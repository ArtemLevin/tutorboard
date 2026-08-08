import type {
  RegularPolyhedronVariant,
  Solid3DDefinition,
  SolidEdge,
  SolidFace,
  SolidTopology,
  SolidVertex,
} from "./definitions";
import {
  cross3,
  dot3,
  normalize3,
  scale3,
  subtract3,
  type Vec2,
  type Vec3,
} from "./vectors";

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

function tetrahedron(edgeLength: number): SolidTopology {
  const scale = edgeLength / (2 * Math.sqrt(2));
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

function octahedron(edgeLength: number): SolidTopology {
  const radius = edgeLength / Math.sqrt(2);
  return topologyFromFaces(
    [
      { x: 0, y: radius, z: 0 },
      { x: 0, y: -radius, z: 0 },
      { x: radius, y: 0, z: 0 },
      { x: 0, y: 0, z: radius },
      { x: -radius, y: 0, z: 0 },
      { x: 0, y: 0, z: -radius },
    ],
    [
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 5],
      [0, 5, 2],
      [1, 3, 2],
      [1, 4, 3],
      [1, 5, 4],
      [1, 2, 5],
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

function truncatedPyramid(
  bottomBase: readonly Vec2[],
  topBase: readonly Vec2[],
  height: number,
): SolidTopology {
  const half = height / 2;
  const count = bottomBase.length;
  const positions = [
    ...bottomBase.map((point) => ({ x: point.x, y: -half, z: point.y })),
    ...topBase.map((point) => ({ x: point.x, y: half, z: point.y })),
  ];
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

function average(points: readonly Vec3[]): Vec3 {
  const sum = points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
      z: current.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return scale3(sum, 1 / points.length);
}

function convexFaces(
  positions: readonly Vec3[],
  epsilon = 1e-7,
): readonly (readonly number[])[] {
  const faces = new Map<string, readonly number[]>();
  for (let first = 0; first < positions.length - 2; first += 1) {
    for (let second = first + 1; second < positions.length - 1; second += 1) {
      for (let third = second + 1; third < positions.length; third += 1) {
        const origin = positions[first]!;
        const normal0 = normalize3(
          cross3(
            subtract3(positions[second]!, origin),
            subtract3(positions[third]!, origin),
          ),
        );
        if (normal0 === null) continue;
        const planeOffset0 = dot3(normal0, origin);
        let positive = false;
        let negative = false;
        for (const point of positions) {
          const distance = dot3(normal0, point) - planeOffset0;
          if (distance > epsilon) positive = true;
          if (distance < -epsilon) negative = true;
        }
        if (positive && negative) continue;

        const faceIndexes = positions
          .map((point, index) => ({
            distance: Math.abs(dot3(normal0, point) - planeOffset0),
            index,
          }))
          .filter(({ distance }) => distance <= epsilon)
          .map(({ index }) => index);
        if (faceIndexes.length < 3) continue;
        const key = [...faceIndexes]
          .sort((left, right) => left - right)
          .join(":");
        if (faces.has(key)) continue;

        let normal = normal0;
        let planeOffset = planeOffset0;
        if (planeOffset < 0) {
          normal = scale3(normal, -1);
          planeOffset = -planeOffset;
        }
        if (planeOffset <= epsilon) continue;
        const center = average(faceIndexes.map((index) => positions[index]!));
        const reference =
          Math.abs(normal.x) < 0.8
            ? { x: 1, y: 0, z: 0 }
            : { x: 0, y: 1, z: 0 };
        const u = normalize3(cross3(normal, reference));
        if (u === null) continue;
        const v = cross3(normal, u);
        const ordered = [...faceIndexes].sort((left, right) => {
          const leftVector = subtract3(positions[left]!, center);
          const rightVector = subtract3(positions[right]!, center);
          const leftAngle = Math.atan2(
            dot3(leftVector, v),
            dot3(leftVector, u),
          );
          const rightAngle = Math.atan2(
            dot3(rightVector, v),
            dot3(rightVector, u),
          );
          return leftAngle - rightAngle || left - right;
        });
        const a = positions[ordered[0]!]!;
        const b = positions[ordered[1]!]!;
        const c = positions[ordered[2]!]!;
        if (dot3(cross3(subtract3(b, a), subtract3(c, b)), normal) < 0) {
          ordered.reverse();
        }
        faces.set(key, ordered);
      }
    }
  }
  return [...faces.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, face]) => face);
}

function platonicPositions(
  variant: Extract<RegularPolyhedronVariant, "dodecahedron" | "icosahedron">,
  edgeLength: number,
): readonly Vec3[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  if (variant === "icosahedron") {
    const scale = edgeLength / 2;
    return [
      { x: -1, y: phi, z: 0 },
      { x: 1, y: phi, z: 0 },
      { x: -1, y: -phi, z: 0 },
      { x: 1, y: -phi, z: 0 },
      { x: 0, y: -1, z: phi },
      { x: 0, y: 1, z: phi },
      { x: 0, y: -1, z: -phi },
      { x: 0, y: 1, z: -phi },
      { x: phi, y: 0, z: -1 },
      { x: phi, y: 0, z: 1 },
      { x: -phi, y: 0, z: -1 },
      { x: -phi, y: 0, z: 1 },
    ].map((point) => scale3(point, scale));
  }
  const inversePhi = 1 / phi;
  const scale = (edgeLength * phi) / 2;
  const positions: Vec3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) positions.push({ x, y, z });
  for (const y of [-inversePhi, inversePhi])
    for (const z of [-phi, phi]) positions.push({ x: 0, y, z });
  for (const x of [-inversePhi, inversePhi])
    for (const y of [-phi, phi]) positions.push({ x, y, z: 0 });
  for (const x of [-phi, phi])
    for (const z of [-inversePhi, inversePhi]) positions.push({ x, y: 0, z });
  return positions.map((point) => scale3(point, scale));
}

function regularPolyhedron(
  variant: RegularPolyhedronVariant,
  edgeLength: number,
): SolidTopology {
  switch (variant) {
    case "tetrahedron":
      return tetrahedron(edgeLength);
    case "cube":
      return box({ x: edgeLength, y: edgeLength, z: edgeLength });
    case "octahedron":
      return octahedron(edgeLength);
    case "dodecahedron":
    case "icosahedron": {
      const positions = platonicPositions(variant, edgeLength);
      return topologyFromFaces(positions, convexFaces(positions));
    }
  }
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
    case "tetrahedron":
      return tetrahedron(definition.edgeLength);
    case "octahedron":
      return octahedron(definition.edgeLength);
    case "regular-polyhedron":
      return regularPolyhedron(definition.variant, definition.edgeLength);
    case "prism":
      return prism(definition.base, definition.height);
    case "pyramid":
      return pyramid(definition.base, definition.apex);
    case "truncated-pyramid":
      return truncatedPyramid(
        definition.bottomBase,
        definition.topBase,
        definition.height,
      );
    case "cone":
    case "cylinder":
    case "hemisphere":
    case "sphere":
    case "truncated-cone":
      return null;
  }
}
