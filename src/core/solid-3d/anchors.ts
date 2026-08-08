import type { SolidPointAnchor, SolidTopology } from "./definitions";
import { add3, scale3, subtract3, type Vec3 } from "./vectors";

export function resolveSolidPointAnchor(
  topology: SolidTopology,
  anchor: SolidPointAnchor,
): Vec3 | null {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  if (anchor.kind === "vertex") return vertices.get(anchor.vertexId) ?? null;
  if (anchor.kind === "edge") {
    const edge = topology.edges.find((item) => item.id === anchor.edgeId);
    if (edge === undefined) return null;
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    return add3(
      start,
      scale3(subtract3(end, start), Math.min(1, Math.max(0, anchor.parameter))),
    );
  }
  if (anchor.kind === "face") {
    const face = topology.faces.find((item) => item.id === anchor.faceId);
    if (face === undefined || face.vertexIds.length < 3) return null;
    const first = vertices.get(face.vertexIds[0]!)!;
    const second = vertices.get(face.vertexIds[1]!)!;
    const third = vertices.get(face.vertexIds[2]!)!;
    return add3(
      first,
      add3(
        scale3(subtract3(second, first), anchor.localCoordinates.x),
        scale3(subtract3(third, first), anchor.localCoordinates.y),
      ),
    );
  }
  return null;
}
