import type { BoardObjectId } from "../../core/public";

import type {
  CreateGeometryImportSemanticPlanInput,
  GeometryImportDiagnostic,
  GeometryImportSemanticPlan,
  GeometryImportSemanticPlanResult,
  GeometrySemanticCandidate,
  GeometrySemanticProvenance,
  GeometrySemanticReference,
} from "./contract";
import {
  compareString,
  diagnostic,
  failure,
  hasErrors,
  sortDiagnostics,
} from "./diagnostics";
import type { EntityIndexes } from "./entity-index";
import {
  createRootGroupId,
  encodeComponent,
  registerBoardObjectId,
  type IdentityRegistry,
} from "./identity";
import type { CanonicalGirObject, CanonicalGirScene } from "./validation";

interface MutableProvenance {
  readonly primaryGirEntityId: string;
  readonly primaryGirEntityType: string;
  readonly representedGirEntityIds: Set<string>;
  readonly role: "label" | "point" | "segment";
}

interface MutableSegmentCandidate {
  readonly boardObjectId: BoardObjectId;
  readonly endPointGirId: string;
  readonly kind: "segment";
  readonly origin:
    | {
        readonly girEntityId: string;
        readonly kind: "explicit-segment";
      }
    | {
        readonly edgeIndex: 0 | 1 | 2;
        readonly kind: "triangle-edge";
        readonly triangleGirEntityId: string;
      };
  readonly representedGirEntityIds: Set<string>;
  readonly startPointGirId: string;
}

type MutableCandidate =
  | Exclude<GeometrySemanticCandidate, { readonly kind: "segment" }>
  | MutableSegmentCandidate;

interface BuildState {
  readonly candidates: MutableCandidate[];
  readonly diagnostics: GeometryImportDiagnostic[];
  readonly identity: IdentityRegistry;
  readonly mapping: Map<string, Set<BoardObjectId>>;
  readonly provenance: Map<BoardObjectId, MutableProvenance>;
  readonly references: GeometrySemanticReference[];
}

function pairKey(first: string, second: string): string {
  return compareString(first, second) <= 0
    ? `${first}\0${second}`
    : `${second}\0${first}`;
}

function mappingSet(
  mapping: Map<string, Set<BoardObjectId>>,
  girEntityId: string,
): Set<BoardObjectId> {
  const existing = mapping.get(girEntityId);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set<BoardObjectId>();
  mapping.set(girEntityId, created);
  return created;
}

function addProvenance(
  state: BuildState,
  boardId: BoardObjectId,
  provenance: Omit<MutableProvenance, "representedGirEntityIds"> & {
    readonly representedGirEntityIds: readonly string[];
  },
): void {
  state.provenance.set(boardId, {
    ...provenance,
    representedGirEntityIds: new Set(provenance.representedGirEntityIds),
  });
}

function sortedObjects<T extends CanonicalGirObject["type"]>(
  indexes: EntityIndexes,
  type: T,
): readonly Extract<CanonicalGirObject, { readonly type: T }>[] {
  return [...indexes.objectsById.values()]
    .map((entry) => entry.value)
    .filter(
      (object): object is Extract<CanonicalGirObject, { readonly type: T }> =>
        object.type === type,
    )
    .sort((left, right) => compareString(left.id, right.id));
}

function addPointCandidates(state: BuildState, indexes: EntityIndexes): void {
  for (const point of sortedObjects(indexes, "point")) {
    const id = registerBoardObjectId(
      state.identity,
      `point:${encodeComponent(point.id)}`,
      state.diagnostics,
      point.id,
    );
    if (id === null) {
      continue;
    }
    state.candidates.push({
      kind: "point",
      boardObjectId: id,
      girEntityId: point.id,
    });
    mappingSet(state.mapping, point.id).add(id);
    addProvenance(state, id, {
      role: "point",
      primaryGirEntityId: point.id,
      primaryGirEntityType: point.type,
      representedGirEntityIds: [point.id],
    });
  }
}

function addExplicitSegments(
  state: BuildState,
  indexes: EntityIndexes,
): Map<string, MutableSegmentCandidate[]> {
  const byPair = new Map<string, MutableSegmentCandidate[]>();
  for (const segment of sortedObjects(indexes, "segment")) {
    const id = registerBoardObjectId(
      state.identity,
      `segment:${encodeComponent(segment.id)}`,
      state.diagnostics,
      segment.id,
    );
    if (id === null) {
      continue;
    }
    const candidate: MutableSegmentCandidate = {
      kind: "segment",
      boardObjectId: id,
      startPointGirId: segment.points[0],
      endPointGirId: segment.points[1],
      origin: { kind: "explicit-segment", girEntityId: segment.id },
      representedGirEntityIds: new Set([segment.id]),
    };
    state.candidates.push(candidate);
    mappingSet(state.mapping, segment.id).add(id);
    addProvenance(state, id, {
      role: "segment",
      primaryGirEntityId: segment.id,
      primaryGirEntityType: segment.type,
      representedGirEntityIds: [segment.id],
    });
    const key = pairKey(segment.points[0], segment.points[1]);
    const matches = byPair.get(key) ?? [];
    matches.push(candidate);
    byPair.set(key, matches);
  }
  return byPair;
}

function addTriangleEdges(
  state: BuildState,
  indexes: EntityIndexes,
  explicitByPair: ReadonlyMap<string, readonly MutableSegmentCandidate[]>,
): void {
  for (const triangle of sortedObjects(indexes, "triangle")) {
    const edges = [
      [triangle.vertices[0], triangle.vertices[1]],
      [triangle.vertices[1], triangle.vertices[2]],
      [triangle.vertices[2], triangle.vertices[0]],
    ] as const;
    edges.forEach(([start, end], edgeIndex) => {
      const matches = explicitByPair.get(pairKey(start, end)) ?? [];
      if (matches.length > 1) {
        state.diagnostics.push(
          diagnostic("geometry-import.ambiguous-triangle-edge", "error", {
            girEntityId: triangle.id,
            relatedGirEntityIds: matches.map((candidate) =>
              candidate.origin.kind === "explicit-segment"
                ? candidate.origin.girEntityId
                : triangle.id,
            ),
          }),
        );
        return;
      }
      if (matches.length === 1 && matches[0] !== undefined) {
        const candidate = matches[0];
        candidate.representedGirEntityIds.add(triangle.id);
        mappingSet(state.mapping, triangle.id).add(candidate.boardObjectId);
        state.provenance
          .get(candidate.boardObjectId)
          ?.representedGirEntityIds.add(triangle.id);
        state.diagnostics.push(
          diagnostic("geometry-import.explicit-segment-reused", "warning", {
            girEntityId: triangle.id,
            relatedGirEntityIds: [
              candidate.origin.kind === "explicit-segment"
                ? candidate.origin.girEntityId
                : triangle.id,
            ],
          }),
        );
        return;
      }

      const typedEdgeIndex = edgeIndex as 0 | 1 | 2;
      const id = registerBoardObjectId(
        state.identity,
        `triangle-edge:${encodeComponent(triangle.id)}:${typedEdgeIndex}`,
        state.diagnostics,
        triangle.id,
      );
      if (id === null) {
        return;
      }
      const candidate: MutableSegmentCandidate = {
        kind: "segment",
        boardObjectId: id,
        startPointGirId: start,
        endPointGirId: end,
        origin: {
          kind: "triangle-edge",
          triangleGirEntityId: triangle.id,
          edgeIndex: typedEdgeIndex,
        },
        representedGirEntityIds: new Set([triangle.id]),
      };
      state.candidates.push(candidate);
      mappingSet(state.mapping, triangle.id).add(id);
      addProvenance(state, id, {
        role: "segment",
        primaryGirEntityId: triangle.id,
        primaryGirEntityType: triangle.type,
        representedGirEntityIds: [triangle.id],
      });
      state.diagnostics.push(
        diagnostic(
          "geometry-import.synthetic-triangle-edge-created",
          "warning",
          {
            girEntityId: triangle.id,
            relatedGirEntityIds: [start, end],
          },
        ),
      );
    });
  }
}

function addLabels(state: BuildState, indexes: EntityIndexes): void {
  const explicitTargets = new Set<string>();
  for (const label of sortedObjects(indexes, "label")) {
    const id = registerBoardObjectId(
      state.identity,
      `label:${encodeComponent(label.id)}`,
      state.diagnostics,
      label.id,
    );
    if (id === null) {
      continue;
    }
    explicitTargets.add(label.target);
    state.candidates.push({
      kind: "label",
      boardObjectId: id,
      targetGirEntityId: label.target,
      text: label.text,
      origin: { kind: "explicit-label", girEntityId: label.id },
    });
    mappingSet(state.mapping, label.id).add(id);
    mappingSet(state.mapping, label.target).add(id);
    addProvenance(state, id, {
      role: "label",
      primaryGirEntityId: label.id,
      primaryGirEntityType: label.type,
      representedGirEntityIds: [label.id, label.target],
    });
  }

  for (const point of sortedObjects(indexes, "point")) {
    if (
      explicitTargets.has(point.id) ||
      point.label === undefined ||
      point.label === null ||
      point.label.length === 0
    ) {
      continue;
    }
    const id = registerBoardObjectId(
      state.identity,
      `point-label:${encodeComponent(point.id)}`,
      state.diagnostics,
      point.id,
    );
    if (id === null) {
      continue;
    }
    state.candidates.push({
      kind: "label",
      boardObjectId: id,
      targetGirEntityId: point.id,
      text: point.label,
      origin: { kind: "point-label", pointGirEntityId: point.id },
    });
    mappingSet(state.mapping, point.id).add(id);
    addProvenance(state, id, {
      role: "label",
      primaryGirEntityId: point.id,
      primaryGirEntityType: point.type,
      representedGirEntityIds: [point.id],
    });
    state.diagnostics.push(
      diagnostic("geometry-import.synthetic-point-label-created", "warning", {
        girEntityId: point.id,
      }),
    );
  }
}

function addUnsupportedDiagnostics(
  state: BuildState,
  indexes: EntityIndexes,
): void {
  for (const type of ["angle", "circle", "line", "ray"] as const) {
    for (const object of sortedObjects(indexes, type)) {
      state.diagnostics.push(
        diagnostic("geometry-import.unsupported-visual-entity", "warning", {
          girEntityId: object.id,
        }),
      );
    }
  }
}

function immutableCandidates(
  candidates: readonly MutableCandidate[],
): readonly GeometrySemanticCandidate[] {
  return candidates
    .map((candidate): GeometrySemanticCandidate =>
      candidate.kind === "segment"
        ? {
            ...candidate,
            representedGirEntityIds: [
              ...candidate.representedGirEntityIds,
            ].sort((left, right) => compareString(left, right)),
          }
        : candidate,
    )
    .sort(
      (left, right) =>
        compareString(left.kind, right.kind) ||
        compareString(left.boardObjectId, right.boardObjectId),
    );
}

function immutableMapping(
  mapping: ReadonlyMap<string, ReadonlySet<BoardObjectId>>,
): Readonly<Record<string, readonly BoardObjectId[]>> {
  return Object.fromEntries(
    [...mapping.entries()]
      .sort(([left], [right]) => compareString(left, right))
      .map(([girId, boardIds]) => [
        girId,
        [...boardIds].sort((left, right) => compareString(left, right)),
      ]),
  );
}

function immutableProvenance(
  provenance: ReadonlyMap<BoardObjectId, MutableProvenance>,
): Readonly<Record<BoardObjectId, GeometrySemanticProvenance>> {
  return Object.fromEntries(
    [...provenance.entries()]
      .sort(([left], [right]) => compareString(left, right))
      .map(([boardId, value]) => [
        boardId,
        {
          ...value,
          representedGirEntityIds: [...value.representedGirEntityIds].sort(
            (left, right) => compareString(left, right),
          ),
        },
      ]),
  );
}

export function buildSemanticPlan(
  gir: CanonicalGirScene,
  input: CreateGeometryImportSemanticPlanInput,
  indexes: EntityIndexes,
  references: readonly GeometrySemanticReference[],
  diagnostics: GeometryImportDiagnostic[],
): GeometryImportSemanticPlanResult {
  const rootGroupId = createRootGroupId(input.importId, diagnostics);
  if (rootGroupId === null) {
    return failure(diagnostics);
  }
  const state: BuildState = {
    candidates: [],
    diagnostics,
    identity: { importId: input.importId, boardSeeds: new Map() },
    mapping: new Map(
      [...indexes.objectsById.keys()].map((id) => [
        id,
        new Set<BoardObjectId>(),
      ]),
    ),
    provenance: new Map(),
    references: [...references],
  };

  addPointCandidates(state, indexes);
  const explicitSegments = addExplicitSegments(state, indexes);
  addTriangleEdges(state, indexes, explicitSegments);
  addLabels(state, indexes);
  addUnsupportedDiagnostics(state, indexes);

  if (state.candidates.length === 0) {
    state.diagnostics.push(
      diagnostic("geometry-import.no-supported-visual-entities", "error"),
    );
  }
  if (hasErrors(state.diagnostics)) {
    return failure(state.diagnostics);
  }

  const plan: GeometryImportSemanticPlan = {
    importId: input.importId,
    rootGroupId,
    girSchemaVersion: gir.schema_version,
    candidates: immutableCandidates(state.candidates),
    mapping: immutableMapping(state.mapping),
    provenanceByBoardObjectId: immutableProvenance(state.provenance),
    references: state.references,
  };
  return {
    status: "success",
    plan,
    diagnostics: sortDiagnostics(state.diagnostics),
  };
}
