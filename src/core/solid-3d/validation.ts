import type { Solid3DDefinition, Solid3DRecord } from "./definitions";
import { isFiniteVec3 } from "./vectors";

export type Solid3DDiagnosticCode =
  | "solid.invalid-definition"
  | "solid.invalid-reference"
  | "solid.limit-exceeded";

export interface Solid3DDiagnostic {
  readonly code: Solid3DDiagnosticCode;
  readonly message: string;
}

function validDefinition(definition: Solid3DDefinition): boolean {
  switch (definition.kind) {
    case "cube":
    case "tetrahedron":
      return (
        Number.isFinite(definition.edgeLength) &&
        definition.edgeLength > 0 &&
        definition.edgeLength <= 10_000
      );
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
        Number.isFinite(definition.height) &&
        definition.height > 0
      );
    case "pyramid":
      return (
        definition.base.length >= 3 &&
        definition.base.length <= 256 &&
        isFiniteVec3(definition.apex)
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
      return definition.radius > 0 && Number.isFinite(definition.radius);
  }
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
    )
  )
    diagnostics.push({
      code: "solid.invalid-reference",
      message: "Solid points or sections contain invalid references.",
    });
  return diagnostics;
}
