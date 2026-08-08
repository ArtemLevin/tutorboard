import {
  add3,
  canonicalizeAnalyticSurfaceAnchor,
  distance3,
  scale3,
  subtract3,
  type Solid3DDefinition,
  type SolidAnalyticSurfaceId,
  type SolidPointAnchor,
  type SolidTopology,
  type Vec3,
} from "../../core/public";

export interface SolidHitPlacement {
  readonly anchor: SolidPointAnchor;
  readonly position: Vec3;
}

function resolvePolyhedronHit(
  point: Vec3,
  topology: SolidTopology,
  faceIndex: number | undefined,
): SolidHitPlacement {
  const vertex = [...topology.vertices].sort(
    (a, b) => distance3(a.position, point) - distance3(b.position, point),
  )[0];
  if (vertex !== undefined && distance3(vertex.position, point) < 0.2)
    return {
      anchor: { kind: "vertex", vertexId: vertex.id },
      position: vertex.position,
    };

  let nearest: {
    edgeId: string;
    parameter: number;
    point: Vec3;
    distance: number;
  } | null = null;
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  for (const edge of topology.edges) {
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    const delta = subtract3(end, start);
    const denominator =
      delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
    const raw =
      denominator === 0
        ? 0
        : ((point.x - start.x) * delta.x +
            (point.y - start.y) * delta.y +
            (point.z - start.z) * delta.z) /
          denominator;
    const parameter = Math.min(1, Math.max(0, raw));
    const projected = add3(start, scale3(delta, parameter));
    const distance = distance3(projected, point);
    if (nearest === null || distance < nearest.distance)
      nearest = { distance, edgeId: edge.id, parameter, point: projected };
  }
  if (nearest !== null && nearest.distance < 0.14)
    return {
      anchor: {
        edgeId: nearest.edgeId,
        kind: "edge",
        parameter: nearest.parameter,
      },
      position: nearest.point,
    };

  const semanticFaceIds = topology.faces.flatMap((face) =>
    Array.from(
      { length: Math.max(1, face.vertexIds.length - 2) },
      () => face.id,
    ),
  );
  const faceId = semanticFaceIds[faceIndex ?? -1];
  const face =
    topology.faces.find(({ id }) => id === faceId) ?? topology.faces[0]!;
  return {
    anchor: {
      faceId: face.id,
      kind: "face",
      localCoordinates: { x: 0, y: 0 },
    },
    position: point,
  };
}

export function resolveSolidHitAnchor(
  definition: Solid3DDefinition,
  point: Vec3,
  topology: SolidTopology | null,
  faceIndex: number | undefined,
  semanticSurfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[],
): SolidHitPlacement | null {
  if (topology !== null) return resolvePolyhedronHit(point, topology, faceIndex);
  const surfaceId = semanticSurfaceFaceIds[faceIndex ?? -1];
  return surfaceId === undefined || surfaceId === null
    ? null
    : canonicalizeAnalyticSurfaceAnchor(definition, point, surfaceId);
}
