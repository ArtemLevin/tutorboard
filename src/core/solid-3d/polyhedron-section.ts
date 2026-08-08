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
