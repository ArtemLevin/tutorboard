import type {
  Solid3DDefinition,
  Solid3DRecord,
  SolidDihedralAngleMeasurement,
  SolidFace,
  SolidTopology,
} from "./definitions";
import { createSolidTopology } from "./topology";
import {
  add3,
  dot3,
  normalize3,
  planeFromThreePoints,
  scale3,
  signedDistanceToPlane,
  subtract3,
  type Vec3,
} from "./vectors";

export interface SolidDihedralAngleResult {
  /** Interior linear angle of adjacent face half-planes: 0..180 degrees. */
  readonly degrees: number;
  readonly faces: readonly [string, string];
  readonly edge: readonly [Vec3, Vec3];
  readonly edgeId: string;
  /** Midpoint of the common edge, where the normal section is constructed. */
  readonly origin: Vec3;
  /** Unit rays inside each half-plane, perpendicular to the common edge. */
  readonly rays: readonly [Vec3, Vec3];
}

function faceRay(
  topology: SolidTopology,
  face: SolidFace,
  edgeDirection: Vec3,
  midpoint: Vec3,
): Vec3 | null {
  const positions = face.vertexIds.map(
    (id) => topology.vertices.find((v) => v.id === id)?.position,
  );
  if (positions.length < 3 || positions.some((position) => position === undefined))
    return null;
  const vertices = positions.filter((position): position is Vec3 => position !== undefined);
  const origin = vertices[0]!;
  let plane = null;
  for (let index = 1; index + 1 < vertices.length; index += 1) {
    plane = planeFromThreePoints(origin, vertices[index]!, vertices[index + 1]!);
    if (plane !== null) break;
  }
  if (plane === null) return null;
  const extent = Math.max(1, ...vertices.map((v) =>
    Math.hypot(v.x - origin.x, v.y - origin.y, v.z - origin.z)
  ));
  if (vertices.some((v) => Math.abs(signedDistanceToPlane(plane, v)) > extent * 1e-6))
    return null;
  const center = scale3(
    vertices.reduce((sum, v) => add3(sum, v), { x: 0, y: 0, z: 0 }),
    1 / vertices.length,
  );
  const delta = subtract3(center, midpoint);
  const projected = subtract3(delta, scale3(edgeDirection, dot3(delta, edgeDirection)));
  return normalize3(projected);
}

/**
 * For two faces with exactly one shared topology edge, intersect their
 * half-planes with the plane perpendicular to that edge at its midpoint.
 * The resulting linear angle is well-defined for convex and concave pairs.
 */
export function calculateSolidDihedralAngle(
  definition: Solid3DDefinition,
  faces: readonly [string, string],
): SolidDihedralAngleResult | null {
  if (faces[0] === faces[1]) return null;
  const topology = createSolidTopology(definition);
  if (topology === null) return null;
  const first = topology.faces.find((face) => face.id === faces[0]);
  const second = topology.faces.find((face) => face.id === faces[1]);
  if (first === undefined || second === undefined) return null;
  const shared = first.edgeIds.filter((id) => second.edgeIds.includes(id));
  if (shared.length !== 1) return null;
  const edge = topology.edges.find(({ id }) => id === shared[0]);
  if (edge === undefined) return null;
  const a = topology.vertices.find(({ id }) => id === edge.startVertexId)?.position;
  const b = topology.vertices.find(({ id }) => id === edge.endVertexId)?.position;
  if (a === undefined || b === undefined) return null;
  const direction = normalize3(subtract3(b, a));
  if (direction === null) return null;
  const midpoint = scale3(add3(a, b), 0.5);
  const firstRay = faceRay(topology, first, direction, midpoint);
  const secondRay = faceRay(topology, second, direction, midpoint);
  if (firstRay === null || secondRay === null) return null;
  const cosine = Math.max(-1, Math.min(1, dot3(firstRay, secondRay)));
  const degrees = Math.acos(cosine) * 180 / Math.PI;
  if (!Number.isFinite(degrees)) return null;
  return {
    degrees,
    faces,
    edge: [a, b],
    edgeId: edge.id,
    origin: midpoint,
    rays: [firstRay, secondRay],
  };
}

export function saveSolidDihedralAngle(
  record: Solid3DRecord,
  faces: readonly [string, string],
  id: string,
): Solid3DRecord | null {
  if (calculateSolidDihedralAngle(record.definition, faces) === null) return null;
  const existing = record.dihedralMeasurements ?? [];
  if (
    existing.length >= 12 ||
    existing.some((item) =>
      item.id === id ||
      (item.faces.includes(faces[0]) && item.faces.includes(faces[1])),
    )
  ) return null;
  const item: SolidDihedralAngleMeasurement = { id, faces };
  return { ...record, dihedralMeasurements: [...existing, item] };
}
