import {
  createSolidTopology,
  intersectAnalyticSolidWithPlane,
  intersectPolyhedronWithPlane,
  planeFromThreePoints,
  type Solid3DRecord,
  type SolidSectionResult,
} from "../solid-3d/public";

export function calculateSectionForLearning(
  record: Solid3DRecord,
  pointIds: readonly [string, string, string],
): SolidSectionResult | null {
  const points = pointIds.map((id) =>
    record.points.find((point) => point.id === id),
  );
  if (points.some((point) => point === undefined)) return null;
  const plane = planeFromThreePoints(
    points[0]!.position,
    points[1]!.position,
    points[2]!.position,
  );
  if (plane === null) return null;
  const topology = createSolidTopology(record.definition);
  return topology === null
    ? intersectAnalyticSolidWithPlane(record.definition, plane)
    : intersectPolyhedronWithPlane(topology, plane);
}
