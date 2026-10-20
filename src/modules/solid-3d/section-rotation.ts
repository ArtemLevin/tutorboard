import {
  add3,
  createSolidTopology,
  cross3,
  dot3,
  intersectPolyhedronWithPlane,
  normalize3,
  planeFromThreePoints,
  resolveSolid3DPointPosition,
  scale3,
  subtract3,
  type Plane3D,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidSectionResult,
  type SolidTopology,
  type Vec3,
} from "../../core/public";
import {
  captureSolidSectionIntersection,
  type SaveSolidSectionSweepResult,
} from "./section-sweep";

type PointIds = readonly [
  Solid3DPoint["id"],
  Solid3DPoint["id"],
  Solid3DPoint["id"],
];

export interface SolidSectionRotationFrame {
  readonly edgeId: string;
  readonly plane: Plane3D;
  readonly planePoint: Vec3;
  readonly axisStart: Vec3;
  readonly axisDirection: Vec3;
}

export interface SolidSectionRotationPreview {
  readonly frame: SolidSectionRotationFrame;
  readonly plane: Plane3D;
  readonly section: SolidSectionResult | null;
}

function rotateAroundDirection(
  vector: Vec3,
  axis: Vec3,
  radians: number,
): Vec3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return add3(
    add3(scale3(vector, cosine), scale3(cross3(axis, vector), sine)),
    scale3(axis, dot3(axis, vector) * (1 - cosine)),
  );
}

/** Both the original plane and axis are expressed in local solid coordinates. */
export function getSolidSectionRotationFrame(
  record: Solid3DRecord,
  pointIds: PointIds,
  edgeId: string,
): SolidSectionRotationFrame | null {
  const topology = createSolidTopology(record.definition);
  if (topology === null) return null;
  const edge = topology.edges.find((candidate) => candidate.id === edgeId);
  if (edge === undefined) return null;
  const points = pointIds.map((id) =>
    record.points.find((point) => point.id === id),
  );
  if (points.some((point) => point === undefined)) return null;
  const positions = points.map((point) =>
    resolveSolid3DPointPosition(record.definition, point!),
  );
  const plane = planeFromThreePoints(
    positions[0]!,
    positions[1]!,
    positions[2]!,
  );
  if (plane === null) return null;
  const axisStart = topology.vertices.find(
    ({ id }) => id === edge.startVertexId,
  )?.position;
  const axisEnd = topology.vertices.find(
    ({ id }) => id === edge.endVertexId,
  )?.position;
  if (axisStart === undefined || axisEnd === undefined) return null;
  const axisDirection = normalize3(subtract3(axisEnd, axisStart));
  if (axisDirection === null) return null;
  return {
    axisDirection,
    axisStart,
    edgeId,
    plane,
    planePoint: positions[0]!,
  };
}

/**
 * Live frame evaluation uses a precomputed topology and axis, so moving the
 * slider does not rebuild an expensive polyhedron topology on every frame.
 */
export function previewSolidSectionRotationFrame(
  topology: SolidTopology,
  frame: SolidSectionRotationFrame,
  angleDegrees: number,
): SolidSectionRotationPreview | null {
  if (
    !Number.isFinite(angleDegrees) ||
    angleDegrees < -180 ||
    angleDegrees > 180
  ) return null;
  const radians = (angleDegrees * Math.PI) / 180;
  const normal = rotateAroundDirection(
    frame.plane.normal,
    frame.axisDirection,
    radians,
  );
  const position = add3(
    frame.axisStart,
    rotateAroundDirection(
      subtract3(frame.planePoint, frame.axisStart),
      frame.axisDirection,
      radians,
    ),
  );
  const plane: Plane3D = {
    normal,
    constant: -dot3(normal, position),
  };
  const section = intersectPolyhedronWithPlane(topology, plane);
  return {
    frame,
    plane,
    section: section !== null && section.area > 1e-8 ? section : null,
  };
}

export function previewSolidSectionRotation(
  record: Solid3DRecord,
  pointIds: PointIds,
  edgeId: string,
  angleDegrees: number,
): SolidSectionRotationPreview | null {
  const frame = getSolidSectionRotationFrame(record, pointIds, edgeId);
  const topology = createSolidTopology(record.definition);
  return frame === null || topology === null
    ? null
    : previewSolidSectionRotationFrame(topology, frame, angleDegrees);
}

/** One optimistic update; preserves concurrent changes to unrelated points. */
export function saveSolidSectionRotation(input: {
  readonly current: Solid3DRecord;
  readonly starting: Solid3DRecord;
  readonly pointIds: PointIds;
  readonly edgeId: string;
  readonly angleDegrees: number;
  readonly token: string;
}): SaveSolidSectionSweepResult {
  const { current, starting, pointIds, edgeId, angleDegrees, token } = input;
  const preview =
    Math.abs(angleDegrees) < 1e-8
      ? null
      : previewSolidSectionRotation(current, pointIds, edgeId, angleDegrees);
  return captureSolidSectionIntersection({
    current,
    starting,
    pointIds,
    section: preview?.section ?? null,
    token,
    kind: "rotation",
  });
}
