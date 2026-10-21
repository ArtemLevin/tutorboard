import type {
  Solid3DRecord,
  SolidAngleLine,
  SolidLinePlaneAngleMeasurement,
} from "./definitions";
import { resolveSolidDistanceEndpoint } from "./measurements";
import { createSolidTopology } from "./topology";
import {
  dot3, normalize3, planeFromThreePoints, scale3,
  signedDistanceToPlane, subtract3, type Vec3,
} from "./vectors";

export interface SolidLinePlaneAngleResult {
  /** Acute angle between unoriented line and plane in [0, 90] degrees. */
  readonly degrees: number;
  readonly line: readonly [Vec3, Vec3];
  readonly faceId: string;
  readonly planeOrigin: Vec3;
  readonly normal: Vec3;
  /** Foot of the first line endpoint on the infinite face plane. */
  readonly foot: Vec3;
  readonly direction: Vec3;
  /** Unit line projection in the plane; null for perpendicular lines. */
  readonly projectedDirection: Vec3 | null;
  /** A face-supported tangent for the right-angle construction. */
  readonly tangent: Vec3;
}

/** Works with infinite supporting planes, including when the foot lies outside the polygon. */
export function calculateSolidLinePlaneAngle(
  record: Solid3DRecord,
  line: SolidAngleLine,
  faceId: string,
): SolidLinePlaneAngleResult | null {
  const topology = createSolidTopology(record.definition);
  const face = topology?.faces.find(({ id }) => id === faceId);
  if (topology === null || topology === undefined || face === undefined) return null;
  const positions = face.vertexIds.map(
    (id) => topology.vertices.find((vertex) => vertex.id === id)?.position,
  );
  const origin = positions[0];
  if (origin === undefined) return null;
  let plane = null;
  let tangent: Vec3 | null = null;
  for (let i = 1; i + 1 < positions.length; i += 1) {
    const second = positions[i];
    const third = positions[i + 1];
    if (second === undefined || third === undefined) return null;
    plane = planeFromThreePoints(origin, second, third);
    if (plane !== null) {
      tangent = normalize3(subtract3(second, origin));
      break;
    }
  }
  if (plane === null || tangent === null) return null;
  // Every polygon vertex must lie in the same supporting plane.
  if (positions.some((position) =>
    position === undefined ||
    Math.abs(signedDistanceToPlane(plane, position)) > 1e-6 *
      Math.max(1, Math.abs(position.x), Math.abs(position.y), Math.abs(position.z))
  )) return null;
  const from = resolveSolidDistanceEndpoint(record, line[0]);
  const to = resolveSolidDistanceEndpoint(record, line[1]);
  if (from === null || to === null) return null;
  const direction = normalize3(subtract3(to, from));
  if (direction === null) return null;
  const normalComponent = dot3(direction, plane.normal);
  const inPlane = subtract3(direction, scale3(plane.normal, normalComponent));
  const projectionLength = Math.hypot(inPlane.x, inPlane.y, inPlane.z);
  const degrees = Math.atan2(Math.abs(normalComponent), projectionLength) * 180 / Math.PI;
  if (!Number.isFinite(degrees)) return null;
  const foot = subtract3(from, scale3(plane.normal, signedDistanceToPlane(plane, from)));
  return {
    degrees,
    line: [from, to],
    faceId,
    planeOrigin: origin,
    normal: plane.normal,
    foot,
    direction,
    projectedDirection: normalize3(inPlane),
    tangent,
  };
}

/** Persist only semantic anchors and face ID; geometry is always recomputed. */
export function saveSolidLinePlaneAngle(
  record: Solid3DRecord,
  line: SolidAngleLine,
  faceId: string,
  id: string,
): Solid3DRecord | null {
  if (calculateSolidLinePlaneAngle(record, line, faceId) === null) return null;
  const saved = record.linePlaneMeasurements ?? [];
  const key = (item: SolidAngleLine) =>
    item.map(({ kind, id: endpointId }) => `${kind}:${endpointId}`).sort().join("|");
  if (saved.length >= 12 || saved.some(
    (item) => item.id === id || (item.faceId === faceId && key(item.line) === key(line)),
  )) return null;
  const measurement: SolidLinePlaneAngleMeasurement = { id, line, faceId };
  return { ...record, linePlaneMeasurements: [...saved, measurement] };
}
