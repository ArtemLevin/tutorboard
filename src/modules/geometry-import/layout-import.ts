import {
  identityTransform,
  type BoardGroup,
  type BoardObject,
  type CommandMetadata,
  type GeometryImportId,
  type GeometryImportRecord,
  type GeometryOsLayoutDocument,
  type GeometryOsLayoutResult,
  type ImportGeometryCommand,
  type Vec2,
} from "../../core/public";

import type {
  GeometryImportDiagnostic,
  GeometryImportFailureCode,
  GeometryImportSemanticPlan,
  GeometrySemanticCandidate,
  GeometrySemanticProvenance,
  LabelSemanticCandidate,
  PointSemanticCandidate,
  SegmentSemanticCandidate,
} from "./contract";
import { diagnostic } from "./diagnostics";
import { createGeometryImportSemanticPlan } from "./semantic-plan";

const pointStyle = {
  fill: "#2457d6",
  opacity: 1,
  stroke: "#ffffff",
  strokeWidth: 1,
} as const;
const segmentStyle = {
  fill: null,
  opacity: 1,
  stroke: "#1f2937",
  strokeWidth: 2,
} as const;
const labelStyle = {
  fill: "#17202a",
  opacity: 1,
  stroke: null,
  strokeWidth: 0,
} as const;

type LayoutSuccess = Extract<GeometryOsLayoutResult, { kind: "success" }>;

export interface CreateGeometryImportCommandInput {
  readonly importId: GeometryImportId;
  readonly layoutResult: LayoutSuccess;
  readonly metadata: CommandMetadata;
  readonly placement: Vec2;
  readonly prompt: string;
}

export type GeometryImportCommandResult =
  | {
      readonly command: ImportGeometryCommand;
      readonly diagnostics: readonly GeometryImportDiagnostic[];
      readonly status: "success";
    }
  | {
      readonly code: GeometryImportFailureCode;
      readonly diagnostics: readonly GeometryImportDiagnostic[];
      readonly status: "failure";
    };

function failure(
  code: GeometryImportFailureCode,
  diagnostics: readonly GeometryImportDiagnostic[],
): GeometryImportCommandResult {
  return { status: "failure", code, diagnostics };
}

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function provenance(
  plan: GeometryImportSemanticPlan,
  candidate: GeometrySemanticCandidate,
): GeometrySemanticProvenance {
  const value = plan.provenanceByBoardObjectId[candidate.boardObjectId];
  if (value === undefined) {
    throw new Error(
      `Semantic plan omitted provenance for ${candidate.boardObjectId}.`,
    );
  }
  return value;
}

function source(
  plan: GeometryImportSemanticPlan,
  candidate: GeometrySemanticCandidate,
) {
  const value = provenance(plan, candidate);
  return {
    kind: "geometryos" as const,
    importId: plan.importId,
    girEntityId: value.primaryGirEntityId,
    girEntityType: value.primaryGirEntityType,
  };
}

function pointObject(
  plan: GeometryImportSemanticPlan,
  layout: GeometryOsLayoutDocument,
  candidate: PointSemanticCandidate,
): BoardObject | null {
  const point = layout.points[candidate.girEntityId];
  if (
    point === undefined ||
    point.id !== candidate.girEntityId ||
    point.source.objectId !== candidate.girEntityId ||
    point.source.role !== "gir_object" ||
    !finitePoint(point)
  ) {
    return null;
  }
  return {
    id: candidate.boardObjectId,
    kind: "drawing.ellipse",
    groupId: plan.rootGroupId,
    locked: false,
    position: { x: point.x, y: point.y },
    radius: { x: 5, y: 5 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: source(plan, candidate),
    style: pointStyle,
    visible: true,
  };
}

function segmentSourceMatches(
  candidate: SegmentSemanticCandidate,
  segment: GeometryOsLayoutDocument["segments"][number],
): boolean {
  if (candidate.origin.kind === "explicit-segment") {
    return (
      segment.source.role === "gir_object" &&
      segment.source.objectId === candidate.origin.girEntityId
    );
  }
  return (
    segment.source.role === "triangle_edge" &&
    segment.source.objectId === candidate.origin.triangleGirEntityId &&
    segment.source.index === candidate.origin.edgeIndex
  );
}

function segmentObject(
  plan: GeometryImportSemanticPlan,
  layout: GeometryOsLayoutDocument,
  candidate: SegmentSemanticCandidate,
): BoardObject | null {
  const matches = layout.segments.filter((item) =>
    segmentSourceMatches(candidate, item),
  );
  const segment = matches.length === 1 ? matches[0] : undefined;
  if (
    segment === undefined ||
    segment.start !== candidate.startPointGirId ||
    segment.end !== candidate.endPointGirId
  ) {
    return null;
  }
  const start = layout.points[segment.start];
  const end = layout.points[segment.end];
  if (
    start === undefined ||
    end === undefined ||
    !finitePoint(start) ||
    !finitePoint(end)
  ) {
    return null;
  }
  return {
    id: candidate.boardObjectId,
    kind: "drawing.line",
    groupId: plan.rootGroupId,
    locked: false,
    position: { x: start.x, y: start.y },
    end: { x: end.x - start.x, y: end.y - start.y },
    lineStyle: segment.style,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: source(plan, candidate),
    style: segmentStyle,
    visible: true,
  };
}

function labelSourceMatches(
  candidate: LabelSemanticCandidate,
  label: GeometryOsLayoutDocument["labels"][number],
): boolean {
  if (candidate.origin.kind === "explicit-label") {
    return (
      label.source.role === "gir_object" &&
      label.source.objectId === candidate.origin.girEntityId
    );
  }
  return (
    label.source.role === "auto_label" &&
    label.source.objectId === candidate.origin.pointGirEntityId
  );
}

function labelObject(
  plan: GeometryImportSemanticPlan,
  layout: GeometryOsLayoutDocument,
  candidate: LabelSemanticCandidate,
): BoardObject | null {
  const matches = layout.labels.filter((item) =>
    labelSourceMatches(candidate, item),
  );
  const label = matches.length === 1 ? matches[0] : undefined;
  const target = label === undefined ? undefined : layout.points[label.target];
  if (
    label === undefined ||
    target === undefined ||
    label.target !== candidate.targetGirEntityId ||
    label.text !== candidate.text ||
    !finitePoint(target) ||
    !finitePoint({ x: label.dx, y: label.dy })
  ) {
    return null;
  }
  return {
    id: candidate.boardObjectId,
    kind: "drawing.text",
    groupId: plan.rootGroupId,
    locked: false,
    position: { x: target.x + label.dx, y: target.y + label.dy },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: source(plan, candidate),
    style: labelStyle,
    text: label.text,
    visible: true,
  };
}

function boardObject(
  plan: GeometryImportSemanticPlan,
  layout: GeometryOsLayoutDocument,
  candidate: GeometrySemanticCandidate,
): BoardObject | null {
  switch (candidate.kind) {
    case "point":
      return pointObject(plan, layout, candidate);
    case "segment":
      return segmentObject(plan, layout, candidate);
    case "label":
      return labelObject(plan, layout, candidate);
  }
}

function renderOrder(object: BoardObject): number {
  if (object.kind === "drawing.line") return 0;
  if (object.kind === "drawing.ellipse") return 1;
  return 2;
}

export function createGeometryImportCommand(
  input: CreateGeometryImportCommandInput,
): GeometryImportCommandResult {
  const semantic = createGeometryImportSemanticPlan({
    canonicalGir: input.layoutResult.canonicalGir,
    importId: input.importId,
  });
  if (semantic.status === "failure") {
    return semantic;
  }
  if (!finitePoint(input.placement)) {
    const item = diagnostic("geometry-import.layout-source-mismatch", "error");
    return failure("geometry-import.layout-source-mismatch", [
      ...semantic.diagnostics,
      item,
    ]);
  }

  const objects: BoardObject[] = [];
  const diagnostics = [...semantic.diagnostics];
  for (const candidate of semantic.plan.candidates) {
    const object = boardObject(
      semantic.plan,
      input.layoutResult.layoutDocument,
      candidate,
    );
    if (object === null) {
      const item = diagnostic(
        "geometry-import.layout-element-missing",
        "error",
        {
          girEntityId: provenance(semantic.plan, candidate).primaryGirEntityId,
        },
      );
      diagnostics.push(item);
      return failure("geometry-import.layout-element-missing", diagnostics);
    }
    objects.push(object);
  }
  objects.sort(
    (left, right) =>
      renderOrder(left) - renderOrder(right) || left.id.localeCompare(right.id),
  );

  const boardObjectIds = objects.map((object) => object.id);
  const group: BoardGroup = {
    id: semantic.plan.rootGroupId,
    locked: false,
    objectIds: boardObjectIds,
    transform: identityTransform,
  };
  const importRecord: GeometryImportRecord = {
    id: input.importId,
    boardObjectIds,
    canonicalGir: input.layoutResult.canonicalGir,
    createdAt: input.metadata.timestamp,
    geometryOsApiVersion: "1.0.0",
    girSchemaVersion: "0.2.0",
    mapping: semantic.plan.mapping,
    prompt: input.prompt,
    rawResponse: input.layoutResult.rawResponse,
    requestId: input.layoutResult.requestId,
    rootGroupId: semantic.plan.rootGroupId,
    visualOverrides: {},
    visualTransform: {
      rotation: 0,
      scale: { x: 1, y: 1 },
      translation: input.placement,
    },
  };
  return {
    status: "success",
    diagnostics,
    command: {
      ...input.metadata,
      kind: "core.geometry.import",
      group,
      importRecord,
      objects,
    },
  };
}
