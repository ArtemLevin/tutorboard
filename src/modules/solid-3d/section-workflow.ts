import {
  createSolidTopology,
  intersectPolyhedronWithPlane,
  intersectAnalyticSolidWithPlane,
  planeFromThreePoints,
  type Solid3DRecord,
  type SolidSectionResult,
} from "../../core/public";

export type SolidSectionWorkflowResult =
  | {
      readonly code:
        | "solid.section.points-missing"
        | "solid.section.collinear"
        | "solid.section.outside";
      readonly status: "error";
    }
  | { readonly section: SolidSectionResult; readonly status: "ok" };

export function calculateSolidSection(
  record: Solid3DRecord,
  pointIds: readonly [string, string, string],
): SolidSectionWorkflowResult {
  const points = pointIds.map((id) =>
    record.points.find((point) => point.id === id),
  );
  if (points.some((point) => point === undefined))
    return { code: "solid.section.points-missing", status: "error" };
  const plane = planeFromThreePoints(
    points[0]!.position,
    points[1]!.position,
    points[2]!.position,
  );
  if (plane === null)
    return { code: "solid.section.collinear", status: "error" };
  const topology = createSolidTopology(record.definition);
  const section =
    topology === null
      ? intersectAnalyticSolidWithPlane(record.definition, plane)
      : intersectPolyhedronWithPlane(topology, plane);
  return section === null
    ? { code: "solid.section.outside", status: "error" }
    : { section, status: "ok" };
}
