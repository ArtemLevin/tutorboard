import type {
  Solid3DDefinition,
  SolidEdge,
  SolidFace,
  SolidTopology,
  SolidVertex,
} from "./definitions";
import type { Vec2, Vec3 } from "./vectors";

const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const label = (index: number): string =>
  labels[index] ?? `V${String(index + 1)}`;
const vertex = (index: number, position: Vec3): SolidVertex => ({
  id: `vertex:${String(index)}`,
  label: label(index),
  position,
});

function topologyFromFaces(
  positions: readonly Vec3[],
  faceVertexIndexes: readonly (readonly number[])[],
): SolidTopology {
  const vertices = positions.map((position, index) => vertex(index, position));
  const edgeMap = new Map<string, SolidEdge>();
  const faces: SolidFace[] = [];
  for (const [faceIndex, indexes] of faceVertexIndexes.entries()) {
    const edgeIds: string[] = [];
    for (let index = 0; index < indexes.length; index += 1) {
      const start = indexes[index]!;
      const end = indexes[(index + 1) % indexes.length]!;
      const key =
        start < end
          ? `${String(start)}:${String(end)}`
          : `${String(end)}:${String(start)}`;
      const edgeId = `edge:${key}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          endVertexId: vertices[end]!.id,
          id: edgeId,
          startVertexId: vertices[start]!.id,
        });
      }
      edgeIds.push(edgeId);
    }
    faces.push({
      edgeIds,
      id: `face:${String(faceIndex)}`,
      vertexIds: indexes.map((index) => vertices[index]!.id),
    });
  }
  return { edges: [...edgeMap.values()], faces, vertices };
}

function box(size: Vec3): SolidTopology {
  const x = size.x / 2;
  const y = size.y / 2;
  const z = size.z / 2;
  return topologyFromFaces(
    [
      { x: -x, y: -y, z: -z },
      { x, y: -y, z: -z },
      { x, y, z: -z },
      { x: -x, y, z: -z },
      { x: -x, y: -y, z },
      { x, y: -y, z },
      { x, y, z },
      { x: -x, y, z },
    ],
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  );
}

function prism(base: readonly Vec2[], height: number): SolidTopology {
  const half = height / 2;
  const positions = [
    ...base.map((point) => ({ x: point.x, y: -half, z: point.y })),
    ...base.map((point) => ({ x: point.x, y: half, z: point.y })),
  ];
  const count = base.length;
  const bottom = Array.from({ length: count }, (_, index) => count - index - 1);
  const top = Array.from({ length: count }, (_, index) => count + index);
  const sides = Array.from({ length: count }, (_, index) => [
    index,
    (index + 1) % count,
    count + ((index + 1) % count),
    count + index,
  ]);
  return topologyFromFaces(positions, [bottom, top, ...sides]);
}

function pyramid(base: readonly Vec2[], apex: Vec3): SolidTopology {
  const positions = [
    ...base.map((point) => ({ x: point.x, y: 0, z: point.y })),
    apex,
  ];
  const count = base.length;
  return topologyFromFaces(positions, [
    Array.from({ length: count }, (_, index) => count - index - 1),
    ...Array.from({ length: count }, (_, index) => [
      index,
      (index + 1) % count,
      count,
    ]),
  ]);
}

export function createSolidTopology(
  definition: Solid3DDefinition,
): SolidTopology | null {
  switch (definition.kind) {
    case "cube":
      return box({
        x: definition.edgeLength,
        y: definition.edgeLength,
        z: definition.edgeLength,
      });
    case "cuboid":
      return box(definition.size);
    case "tetrahedron": {
      const scale = definition.edgeLength / (2 * Math.sqrt(2));
      return topologyFromFaces(
        [
          { x: scale, y: scale, z: scale },
          { x: scale, y: -scale, z: -scale },
          { x: -scale, y: scale, z: -scale },
          { x: -scale, y: -scale, z: scale },
        ],
        [
          [0, 2, 1],
          [0, 1, 3],
          [0, 3, 2],
          [1, 2, 3],
        ],
      );
    }
    case "prism":
      return prism(definition.base, definition.height);
    case "pyramid":
      return pyramid(definition.base, definition.apex);
    case "cone":
    case "cylinder":
    case "sphere":
    case "truncated-cone":
      return null;
  }
}
