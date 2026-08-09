import type { SolidPointAnchor, SolidTopology } from "./definitions";
import { add3, dot3, scale3, subtract3, type Vec3 } from "./vectors";

export type TopologyFaceAnchor = Extract<
  SolidPointAnchor,
  { readonly kind: "face" }
>;

export interface TopologyFaceAnchorResolution {
  readonly anchor: TopologyFaceAnchor;
  readonly position: Vec3;
}

export interface TriangulatedTopologyFace {
  readonly faceId: string;
  readonly triangleIndex: number;
  readonly vertexIds: readonly [string, string, string];
}

export function triangulatedTopologyFaces(
  topology: SolidTopology,
): readonly TriangulatedTopologyFace[] {
  return topology.faces.flatMap((face) =>
    Array.from(
      { length: Math.max(0, face.vertexIds.length - 2) },
      (_, triangleIndex) => ({
        faceId: face.id,
        triangleIndex,
        vertexIds: [
          face.vertexIds[0]!,
          face.vertexIds[triangleIndex + 1]!,
          face.vertexIds[triangleIndex + 2]!,
        ] as const,
      }),
    ),
  );
}

function canonicalBarycentricCoordinates(
  first: Vec3,
  second: Vec3,
  third: Vec3,
  point: Vec3,
): { readonly x: number; readonly y: number } | null {
  const firstEdge = subtract3(second, first);
  const secondEdge = subtract3(third, first);
  const offset = subtract3(point, first);
  const d00 = dot3(firstEdge, firstEdge);
  const d01 = dot3(firstEdge, secondEdge);
  const d11 = dot3(secondEdge, secondEdge);
  const d20 = dot3(offset, firstEdge);
  const d21 = dot3(offset, secondEdge);
  const denominator = d00 * d11 - d01 * d01;
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= 1e-12)
    return null;

  let x = (d11 * d20 - d01 * d21) / denominator;
  let y = (d00 * d21 - d01 * d20) / denominator;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  x = Math.max(0, x);
  y = Math.max(0, y);
  const sum = x + y;
  if (sum > 1) {
    x /= sum;
    y /= sum;
  }
  return { x, y };
}

export function canonicalizeTopologyFaceAnchor(
  topology: SolidTopology,
  point: Vec3,
  faceIndex: number | undefined,
): TopologyFaceAnchorResolution | null {
  if (faceIndex === undefined || !Number.isInteger(faceIndex) || faceIndex < 0)
    return null;
  const triangle = triangulatedTopologyFaces(topology)[faceIndex];
  if (triangle === undefined) return null;
  const vertices = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );
  const first = vertices.get(triangle.vertexIds[0]);
  const second = vertices.get(triangle.vertexIds[1]);
  const third = vertices.get(triangle.vertexIds[2]);
  if (first === undefined || second === undefined || third === undefined)
    return null;
  const localCoordinates = canonicalBarycentricCoordinates(
    first,
    second,
    third,
    point,
  );
  if (localCoordinates === null) return null;
  const position = add3(
    first,
    add3(
      scale3(subtract3(second, first), localCoordinates.x),
      scale3(subtract3(third, first), localCoordinates.y),
    ),
  );
  return {
    anchor: {
      faceId: triangle.faceId,
      kind: "face",
      localCoordinates,
      triangleIndex: triangle.triangleIndex,
    },
    position,
  };
}
