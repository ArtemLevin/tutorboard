import { analyticSurfaceIds } from "./anchors";
import type { Solid3DDefinition, Solid3DRecord } from "./definitions";
import { createSolidTopology } from "./topology";
import { isFiniteVec3 } from "./vectors";

export type Solid3DDiagnosticCode =
  | "solid.invalid-definition"
  | "solid.invalid-reference"
  | "solid.limit-exceeded";

export interface Solid3DDiagnostic {
  readonly code: Solid3DDiagnosticCode;
  readonly message: string;
}

const finiteBase = (base: readonly { readonly x: number; readonly y: number }[]) =>
  base.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

const validEdgeLength = (edgeLength: number): boolean =>
  Number.isFinite(edgeLength) && edgeLength > 0 && edgeLength <= 10_000;

function validDefinition(definition: Solid3DDefinition): boolean {
  switch (definition.kind) {
    case "cube":
    case "tetrahedron":
    case "octahedron":
      return validEdgeLength(definition.edgeLength);
    case "regular-polyhedron":
      return validEdgeLength(definition.edgeLength);
    case "cuboid":
      return (
        isFiniteVec3(definition.size) &&
        definition.size.x > 0 &&
        definition.size.y > 0 &&
        definition.size.z > 0
      );
    case "prism":
      return (
        definition.base.length >= 3 &&
        definition.base.length <= 256 &&
        finiteBase(definition.base) &&
        Number.isFinite(definition.height) &&
        definition.height > 0
      );
    case "pyramid":
      return (
        definition.base.length >= 3 &&
        definition.base.length <= 256 &&
        finiteBase(definition.base) &&
        isFiniteVec3(definition.apex)
      );
    case "truncated-pyramid":
      return (
        definition.bottomBase.length >= 3 &&
        definition.bottomBase.length <= 256 &&
        definition.bottomBase.length === definition.topBase.length &&
        finiteBase(definition.bottomBase) &&
        finiteBase(definition.topBase) &&
        Number.isFinite(definition.height) &&
        definition.height > 0
      );
    case "cone":
    case "cylinder":
      return (
        definition.radius > 0 &&
        definition.height > 0 &&
        Number.isFinite(definition.radius + definition.height)
      );
    case "truncated-cone":
      return (
        definition.bottomRadius > 0 &&
        definition.topRadius > 0 &&
        definition.height > 0 &&
        Number.isFinite(
          definition.bottomRadius + definition.topRadius + definition.height,
        )
      );
    case "sphere":
    case "hemisphere":
      return definition.radius > 0 && Number.isFinite(definition.radius);
  }
}

function validAnchorReferences(record: Solid3DRecord): boolean {
  const topology = createSolidTopology(record.definition);
  const surfaces = new Set(analyticSurfaceIds(record.definition));
  if (topology === null) {
    return record.points.every(
      ({ anchor }) =>
        anchor.kind === "analytic-surface" && surfaces.has(anchor.surfaceId as never),
    );
  }
  const vertexIds = new Set(topology.vertices.map(({ id }) => id));
  const edgeIds = new Set(topology.edges.map(({ id }) => id));
  const faceIds = new Set(topology.faces.map(({ id }) => id));
  return record.points.every(({ anchor }) => {
    switch (anchor.kind) {
      case "vertex":
        return vertexIds.has(anchor.vertexId);
      case "edge":
        return edgeIds.has(anchor.edgeId);
      case "face":
        return faceIds.has(anchor.faceId);
      case "analytic-surface":
        return false;
    }
  });
}

export function validateSolid3DRecord(
  record: Solid3DRecord,
): readonly Solid3DDiagnostic[] {
  const diagnostics: Solid3DDiagnostic[] = [];
  if (!validDefinition(record.definition))
    diagnostics.push({
      code: "solid.invalid-definition",
      message: "Solid definition is invalid.",
    });
  if (
    record.points.length > 32 ||
    record.sections.length > 8 ||
    record.boardObjectIds.length > 5_000
  )
    diagnostics.push({
      code: "solid.limit-exceeded",
      message: "Solid record exceeds document limits.",
    });
  const pointIds = new Set(record.points.map((point) => point.id));
  if (
    pointIds.size !== record.points.length ||
    record.sections.some((section) =>
      section.pointIds.some((id) => !pointIds.has(id)),
    ) ||
    !validAnchorReferences(record)
  )
    diagnostics.push({
      code: "solid.invalid-reference",
      message: "Solid points or sections contain invalid references.",
    });
  return diagnostics;
}
