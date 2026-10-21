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
  cross3,
  dot3,
  normalize3,
  scale3,
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
  sharedEdgeId: string,
): Vec3 | null {
  const edgeIndex = face.edgeIds.indexOf(sharedEdgeId);
  if (edgeIndex < 0) return null;
  const vertices = face.vertexIds.map(
    (id) => topology.vertices.find((item) => item.id === id)?.position,
  );
  if (vertices.length < 3 || vertices.some((point) => point === undefined))
    return null;
  const polygon = vertices.filter(
    (point): point is Vec3 => point !== undefined,
  );
  const origin = polygon[0]!;
  // Polygon winding gives the inward half-plane at *each* boundary edge.
  // A polygon-wide vertex centroid can lie outside a concave polygon.
  let areaNormal: Vec3 = { x: 0, y: 0, z: 0 };
  for (let index = 1; index + 1 < polygon.length; index += 1)
    areaNormal = add3(
      areaNormal,
      cross3(
        subtract3(polygon[index]!, origin),
        subtract3(polygon[index + 1]!, origin),
      ),
    );
  const normal = normalize3(areaNormal);
  if (normal === null) return null;
  const extent = Math.max(
    1,
    ...polygon.map((point) =>
      Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z),
    ),
  );
  if (
    polygon.some(
      (point) =>
        Math.abs(dot3(normal, subtract3(point, origin))) > extent * 1e-6,
    )
  )
    return null;
  const start = polygon[edgeIndex]!;
  const end = polygon[(edgeIndex + 1) % polygon.length]!;
  const orientedEdge = normalize3(subtract3(end, start));
  if (orientedEdge === null) return null;
  // Both the face normal and edge direction use the same vertex winding.
  // Therefore normal × tangent is the locally inward perpendicular ray.
  return normalize3(cross3(normal, orientedEdge));
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
  const a = topology.vertices.find(
    ({ id }) => id === edge.startVertexId,
  )?.position;
  const b = topology.vertices.find(
    ({ id }) => id === edge.endVertexId,
  )?.position;
  if (a === undefined || b === undefined) return null;
  if (normalize3(subtract3(b, a)) === null) return null;
  const midpoint = scale3(add3(a, b), 0.5);
  const firstRay = faceRay(topology, first, edge.id);
  const secondRay = faceRay(topology, second, edge.id);
  if (firstRay === null || secondRay === null) return null;
  const cosine = Math.max(-1, Math.min(1, dot3(firstRay, secondRay)));
  const degrees = (Math.acos(cosine) * 180) / Math.PI;
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
  if (calculateSolidDihedralAngle(record.definition, faces) === null)
    return null;
  const existing = record.dihedralMeasurements ?? [];
  if (
    existing.length >= 12 ||
    existing.some(
      (item) =>
        item.id === id ||
        (item.faces.includes(faces[0]) && item.faces.includes(faces[1])),
    )
  )
    return null;
  const item: SolidDihedralAngleMeasurement = { id, faces };
  return { ...record, dihedralMeasurements: [...existing, item] };
}
