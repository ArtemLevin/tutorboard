import {
  resolveAnalyticSolidPointAnchor,
  resolveSolidPointAnchor,
} from "./anchors";
import type {
  Solid3DDefinition,
  Solid3DPoint,
  Solid3DRecord,
} from "./definitions";
import { createSolidTopology } from "./topology";
import { stableTopologyFaceAnchor } from "./topology-anchors";
import type { Vec3 } from "./vectors";

export function resolveSolid3DPointPosition(
  definition: Solid3DDefinition,
  point: Solid3DPoint,
): Vec3 {
  if (point.anchor.kind === "analytic-surface")
    return (
      resolveAnalyticSolidPointAnchor(definition, point.anchor) ?? point.position
    );

  const topology = createSolidTopology(definition);
  if (topology === null) return point.position;
  if (point.anchor.kind === "face" && !stableTopologyFaceAnchor(point.anchor))
    return point.position;
  return resolveSolidPointAnchor(topology, point.anchor) ?? point.position;
}

export function reprojectSolid3DRecord(
  record: Solid3DRecord,
  definition: Solid3DDefinition,
): Solid3DRecord {
  return {
    ...record,
    definition,
    points: record.points.map((point) => ({
      ...point,
      position: resolveSolid3DPointPosition(definition, point),
    })),
  };
}
