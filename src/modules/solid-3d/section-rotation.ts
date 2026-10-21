import {
  add3,
  createSolidTopology,
  cross3,
  dot3,
  intersectPolyhedronWithPlane,
  isConvexSolidTopology,
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

export type SolidSectionRotationAxis =
  | { readonly kind: "edge"; readonly edgeId: string }
  | {
      readonly kind: "points";
      readonly pointIds: readonly [Solid3DPoint["id"], Solid3DPoint["id"]];
    };

export interface SolidSectionRotationFrame {
  readonly axis: SolidSectionRotationAxis;
  readonly plane: Plane3D;
  readonly planePoint: Vec3;
  readonly axisStart: Vec3;
  readonly axisDirection: Vec3;
  readonly axisEnd: Vec3;
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

/** A pair of semantic points defines the infinite rotation axis in solid-local space. */
function axisEndpoints(
  record: Solid3DRecord,
  topology: SolidTopology,
  axis: SolidSectionRotationAxis,
): readonly [Vec3, Vec3] | null {
  if (axis.kind === "points") {
    const [firstId, secondId] = axis.pointIds;
    if (firstId === secondId) return null;
    const first = record.points.find(({ id }) => id === firstId);
    const second = record.points.find(({ id }) => id === secondId);
    if (first === undefined || second === undefined) return null;
    return [
      resolveSolid3DPointPosition(record.definition, first),
      resolveSolid3DPointPosition(record.definition, second),
    ];
  }
  const edge = topology.edges.find(({ id }) => id === axis.edgeId);
  if (edge === undefined) return null;
  const first = topology.vertices.find(({ id }) => id === edge.startVertexId);
  const second = topology.vertices.find(({ id }) => id === edge.endVertexId);
  return first === undefined || second === undefined
    ? null
    : [first.position, second.position];
}

/** Returns null for coincident/missing axis points and non-convex solids. */
export function getSolidSectionRotationFrameForAxis(
  record: Solid3DRecord,
  pointIds: PointIds,
  axis: SolidSectionRotationAxis,
): SolidSectionRotationFrame | null {
  const topology = createSolidTopology(record.definition);
  if (topology === null || !isConvexSolidTopology(topology)) return null;
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
  const ends = axisEndpoints(record, topology, axis);
  if (ends === null) return null;
  const [axisStart, axisEnd] = ends;
  const axisDirection = normalize3(subtract3(axisEnd, axisStart));
  if (axisDirection === null) return null;
  return {
    axis,
    axisDirection,
    axisStart,
    axisEnd,
    plane,
    planePoint: positions[0]!,
  };
}

/** Previous edge-based public contract is retained for existing callers. */
export function getSolidSectionRotationFrame(
  record: Solid3DRecord,
  pointIds: PointIds,
  edgeId: string,
): SolidSectionRotationFrame | null {
  return getSolidSectionRotationFrameForAxis(record, pointIds, {
    kind: "edge",
    edgeId,
  });
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
  )
    return null;
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

/** Preserve the original P1.3 edge rotation API. */
export function previewSolidSectionRotationAboutAxis(
  record: Solid3DRecord,
  pointIds: PointIds,
  axis: SolidSectionRotationAxis,
  angleDegrees: number,
): SolidSectionRotationPreview | null {
  const frame = getSolidSectionRotationFrameForAxis(record, pointIds, axis);
  const topology = createSolidTopology(record.definition);
  return frame === null || topology === null
    ? null
    : previewSolidSectionRotationFrame(topology, frame, angleDegrees);
}

/**
 * Axis points are read dependencies even when they are not section points.
 * Reject stale source gestures before resolving new positions and committing.
 */
export function saveSolidSectionRotationAboutAxis(input: {
  readonly current: Solid3DRecord;
  readonly starting: Solid3DRecord;
  readonly pointIds: PointIds;
  readonly axis: SolidSectionRotationAxis;
  readonly angleDegrees: number;
  readonly token: string;
}): SaveSolidSectionSweepResult {
  const { current, starting, pointIds, axis, angleDegrees, token } = input;
  if (axis.kind === "points") {
    if (
      axis.pointIds[0] === axis.pointIds[1] ||
      axis.pointIds.some((id) => {
        const initial = starting.points.find((point) => point.id === id);
        const latest = current.points.find((point) => point.id === id);
        return initial === undefined ||
          latest === undefined ||
          JSON.stringify(initial) !== JSON.stringify(latest);
      })
    ) return { status: "error", code: "invalid-source" };
  }
  const preview =
    Math.abs(angleDegrees) < 1e-8
      ? null
      : previewSolidSectionRotationAboutAxis(
          current,
          pointIds,
          axis,
          angleDegrees,
        );
  return captureSolidSectionIntersection({
    current,
    starting,
    pointIds,
    section: preview?.section ?? null,
    token,
    kind: "rotation",
  });
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
  return saveSolidSectionRotationAboutAxis({
    ...input,
    axis: { kind: "edge", edgeId: input.edgeId },
  });
}
