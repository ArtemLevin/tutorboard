import * as THREE from "three";

import {
  createSolidTopology,
  type Solid3DDefinition,
  type SolidTopology,
} from "../../core/public";

export interface BuiltSolidScene {
  readonly mesh: THREE.Mesh;
  readonly root: THREE.Group;
  readonly topology: SolidTopology | null;
}

function polyhedronGeometry(topology: SolidTopology): THREE.BufferGeometry {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  const positions: number[] = [];
  for (const face of topology.faces) {
    const first = vertices.get(face.vertexIds[0]!)!;
    for (let index = 1; index + 1 < face.vertexIds.length; index += 1) {
      for (const point of [
        first,
        vertices.get(face.vertexIds[index]!)!,
        vertices.get(face.vertexIds[index + 1]!)!,
      ])
        positions.push(point.x, point.y, point.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function analyticGeometry(definition: Solid3DDefinition): THREE.BufferGeometry {
  switch (definition.kind) {
    case "sphere":
      return new THREE.SphereGeometry(definition.radius, 48, 28);
    case "cylinder":
      return new THREE.CylinderGeometry(
        definition.radius,
        definition.radius,
        definition.height,
        48,
      );
    case "cone":
      return new THREE.ConeGeometry(definition.radius, definition.height, 48);
    case "truncated-cone":
      return new THREE.CylinderGeometry(
        definition.topRadius,
        definition.bottomRadius,
        definition.height,
        48,
      );
    default: {
      const topology = createSolidTopology(definition);
      if (topology === null) throw new Error("Unsupported solid definition.");
      return polyhedronGeometry(topology);
    }
  }
}

export function buildSolidScene(
  definition: Solid3DDefinition,
): BuiltSolidScene {
  const topology = createSolidTopology(definition);
  const geometry =
    topology === null
      ? analyticGeometry(definition)
      : polyhedronGeometry(topology);
  const material = new THREE.MeshStandardMaterial({
    color: 0x91b8c4,
    metalness: 0.03,
    opacity: 0.62,
    roughness: 0.72,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "solid-surface";
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 12),
    new THREE.LineBasicMaterial({ color: 0x243847 }),
  );
  edges.name = "solid-edges";
  const root = new THREE.Group();
  root.add(mesh, edges);
  return { mesh, root, topology };
}
