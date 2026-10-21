import type { SolidTopology } from "./definitions";
import {
  add3,
  cross3,
  distance3,
  dot3,
  normalize3,
  scale3,
  signedDistanceToPlane,
  solid3DEpsilon,
  subtract3,
  type Plane3D,
  type Vec3,
} from "./vectors";

export interface SolidSectionResult {
  readonly area: number;
  readonly perimeter: number;
  readonly vertices: readonly Vec3[];
  readonly intersections: number;
}

function deduplicate(
  points: readonly Vec3[],
  epsilon: number,
): readonly Vec3[] {
  const result: Vec3[] = [];
  for (const point of points) {
    if (!result.some((candidate) => distance3(candidate, point) <= epsilon))
      result.push(point);
  }
  return result;
}

function stableSortOnPlane(
  points: readonly Vec3[],
  plane: Plane3D,
): readonly Vec3[] {
  const center = scale3(
    points.reduce(add3, { x: 0, y: 0, z: 0 }),
    1 / points.length,
  );
  const reference =
    Math.abs(plane.normal.x) < 0.8
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
  const u = normalize3(cross3(plane.normal, reference))!;
  const v = cross3(plane.normal, u);
  return [...points].sort((left, right) => {
    const a = subtract3(left, center);
    const b = subtract3(right, center);
    const angleA = Math.atan2(dot3(a, v), dot3(a, u));
    const angleB = Math.atan2(dot3(b, v), dot3(b, u));
    return (
      angleA - angleB ||
      left.x - right.x ||
      left.y - right.y ||
      left.z - right.z
    );
  });
}

/**
 * The plane/edge intersection routine orders vertices as a convex polygon.
 * Reject non-convex solids (and warped or degenerate faces) before using it in
 * interactive section tools; arbitrary imported bases may be concave.
 */
export function isConvexSolidTopology(topology: SolidTopology): boolean {
  if (topology.vertices.length < 4 || topology.faces.length < 4) return false;
  const positions = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );
  const extent = Math.max(
    ...topology.vertices.map((vertex) =>
      Math.max(
        Math.abs(vertex.position.x),
        Math.abs(vertex.position.y),
        Math.abs(vertex.position.z),
      ),
    ),
  );
  if (!Number.isFinite(extent)) return false;
  const tolerance = Math.max(solid3DEpsilon * 10, extent * 1e-7);
  for (const face of topology.faces) {
    if (face.vertexIds.length < 3) return false;
    const facePositions = face.vertexIds.map((id) => positions.get(id));
    if (facePositions.some((point) => point === undefined)) return false;
    const first = facePositions[0]!;
    let normal: Vec3 | null = null;
    for (let i = 1; i < facePositions.length - 1 && normal === null; i += 1) {
      normal = normalize3(
        cross3(
          subtract3(facePositions[i]!, first),
          subtract3(facePositions[i + 1]!, first),
        ),
      );
    }
    if (normal === null) return false;
    if (
      facePositions.some(
        (point) => Math.abs(dot3(normal!, subtract3(point!, first))) > tolerance,
      )
    ) return false;
    let positive = false;
    let negative = false;
    for (const vertex of topology.vertices) {
      const distance = dot3(normal, subtract3(vertex.position, first));
      if (distance > tolerance) positive = true;
      if (distance < -tolerance) negative = true;
      if (positive && negative) return false;
    }
  }
  return true;
}

export function intersectPolyhedronWithPlane(
  topology: SolidTopology,
  plane: Plane3D,
  epsilon = solid3DEpsilon * 10,
): SolidSectionResult | null {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  const raw: Vec3[] = [];
  for (const edge of topology.edges) {
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    const startDistance = signedDistanceToPlane(plane, start);
    const endDistance = signedDistanceToPlane(plane, end);
    if (Math.abs(startDistance) <= epsilon) raw.push(start);
    if (Math.abs(endDistance) <= epsilon) raw.push(end);
    if (
      (startDistance < -epsilon && endDistance > epsilon) ||
      (startDistance > epsilon && endDistance < -epsilon)
    ) {
      const parameter = startDistance / (startDistance - endDistance);
      raw.push(add3(start, scale3(subtract3(end, start), parameter)));
    }
  }
  const unique = deduplicate(raw, epsilon);
  if (unique.length < 3) return null;
  const ordered = stableSortOnPlane(unique, plane);
  let areaVector: Vec3 = { x: 0, y: 0, z: 0 };
  let perimeter = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const next = ordered[(index + 1) % ordered.length]!;
    areaVector = add3(areaVector, cross3(current, next));
    perimeter += distance3(current, next);
  }
  return {
    area: Math.abs(dot3(areaVector, plane.normal)) / 2,
    intersections: raw.length,
    perimeter,
    vertices: ordered,
  };
}
