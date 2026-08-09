import {
  resolveAnalyticSolidPointAnchor,
  resolveSolidPointAnchor,
} from "./anchors";
import type {
  Solid3DDefinition,
  Solid3DPoint,
  Solid3DRecord,
} from "./definitions";
import {
  constrainedHelperPositions,
  isSolidSectionHelperPoint,
  isSyntheticSolidSectionHelperPoint,
  solidSectionHelperCode,
} from "./section-constraints";
import { createSolidTopology } from "./topology";
import { stableTopologyFaceAnchor } from "./topology-anchors";
import type { Vec3 } from "./vectors";

export function resolveSolid3DPointPosition(
  definition: Solid3DDefinition,
  point: Solid3DPoint,
): Vec3 {
  if (isSyntheticSolidSectionHelperPoint(point)) return point.position;
  if (point.anchor.kind === "analytic-surface")
    return (
      resolveAnalyticSolidPointAnchor(definition, point.anchor) ??
      point.position
    );

  const topology = createSolidTopology(definition);
  if (topology === null) return point.position;
  if (point.anchor.kind === "face" && !stableTopologyFaceAnchor(point.anchor))
    return point.position;
  return resolveSolidPointAnchor(topology, point.anchor) ?? point.position;
}

function helperReference(point: Solid3DPoint): string | null {
  const code = solidSectionHelperCode(point);
  if (code === "pf" && point.anchor.kind === "face") return point.anchor.faceId;
  if (code === "pe" && point.anchor.kind === "edge") return point.anchor.edgeId;
  if (code === "ps" && point.anchor.kind === "analytic-surface")
    return point.anchor.surfaceId;
  return null;
}

export function reprojectSolid3DRecord(
  record: Solid3DRecord,
  definition: Solid3DDefinition,
): Solid3DRecord {
  let points = record.points.map((point) => ({
    ...point,
    position: resolveSolid3DPointPosition(definition, point),
  }));
  const pointById = () => new Map(points.map((point) => [point.id, point]));

  for (const section of record.sections) {
    const current = pointById();
    const sectionPoints = section.pointIds.flatMap((id) => {
      const point = current.get(id);
      return point === undefined ? [] : [point];
    });
    const originPoint = sectionPoints.find(
      (point) => !isSolidSectionHelperPoint(point),
    );
    const helpers = sectionPoints.filter(isSyntheticSolidSectionHelperPoint);
    if (originPoint === undefined || helpers.length !== 2) continue;
    const code = solidSectionHelperCode(helpers[0]!);
    if (code === null || code === "ep") continue;
    if (solidSectionHelperCode(helpers[1]!) !== code) continue;
    const reference = helperReference(helpers[0]!);
    if (reference === null || helperReference(helpers[1]!) !== reference) continue;
    const origin = resolveSolid3DPointPosition(definition, originPoint);
    const helperPositions = constrainedHelperPositions(
      definition,
      code,
      reference,
      origin,
    );
    if (helperPositions === null) continue;
    const helperIds = new Map([
      [helpers[0]!.id, helperPositions[0]],
      [helpers[1]!.id, helperPositions[1]],
    ] as const);
    points = points.map((point) => {
      const position = helperIds.get(point.id);
      return position === undefined ? point : { ...point, position };
    });
  }

  return {
    ...record,
    definition,
    points,
  };
}
