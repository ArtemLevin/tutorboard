import * as THREE from "three";

import {
  analyticSurfaceIds,
  createSolidTopology,
  type Solid3DDefinition,
  type SolidAnalyticSurfaceId,
  type SolidTopology,
} from "../../core/public";

export interface BuiltSolidScene {
  readonly mesh: THREE.Mesh;
  readonly root: THREE.Group;
  readonly semanticSurfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[];
  readonly topology: SolidTopology | null;
}

interface BuiltGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly semanticSurfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[];
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const count =
    geometry.index?.count ?? geometry.getAttribute("position").count;
  return Math.floor(count / 3);
}

function surfacesFromGroups(
  geometry: THREE.BufferGeometry,
  surfacesByMaterial: Readonly<Partial<Record<number, SolidAnalyticSurfaceId>>>,
  fallback: SolidAnalyticSurfaceId,
): readonly SolidAnalyticSurfaceId[] {
  const surfaces = Array.from(
    { length: triangleCount(geometry) },
    () => fallback,
  );
  for (const group of geometry.groups) {
    const materialIndex = group.materialIndex;
    if (materialIndex === undefined) continue;
    const surfaceId = surfacesByMaterial[materialIndex];
    if (surfaceId === undefined) continue;
    const firstTriangle = Math.floor(group.start / 3);
    const endTriangle = Math.min(
      surfaces.length,
      Math.ceil((group.start + group.count) / 3),
    );
    for (let index = firstTriangle; index < endTriangle; index += 1)
      surfaces[index] = surfaceId;
  }
  return surfaces;
}

interface BuiltPolyhedronGeometry {
  readonly geometry: THREE.BufferGeometry;
  /** One semantic ID for every generated triangle, in triangle order. */
  readonly semanticFaceIds: readonly string[];
}

function polyhedronGeometry(topology: SolidTopology): BuiltPolyhedronGeometry {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  const positions: number[] = [];
  const semanticFaceIds: string[] = [];
  for (const face of topology.faces) {
    const polygon = face.vertexIds.map((id) => vertices.get(id)!);
    if (polygon.length < 3) continue;
    // Use a winding-preserving, translation-independent polygon normal.
    // It defines a stable 2D projection for concave planar faces.
    const origin = polygon[0]!;
    const areaNormal = new THREE.Vector3();
    for (let index = 1; index + 1 < polygon.length; index += 1) {
      const u = polygon[index]!;
      const v = polygon[index + 1]!;
      areaNormal.add(
        new THREE.Vector3(u.x - origin.x, u.y - origin.y, u.z - origin.z).cross(
          new THREE.Vector3(v.x - origin.x, v.y - origin.y, v.z - origin.z),
        ),
      );
    }
    if (areaNormal.lengthSq() <= 1e-16) continue;
    const abs = [
      Math.abs(areaNormal.x),
      Math.abs(areaNormal.y),
      Math.abs(areaNormal.z),
    ];
    const primary = abs.indexOf(Math.max(...abs));
    const contour = polygon.map((point) =>
      primary === 0
        ? new THREE.Vector2(point.y, point.z)
        : primary === 1
          ? new THREE.Vector2(point.x, point.z)
          : new THREE.Vector2(point.x, point.y),
    );
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of triangles) {
      const first = polygon[a]!;
      let second = polygon[b]!;
      let third = polygon[c]!;
      // Earcut's winding can differ from the solid's semantic face winding.
      // Keep the original orientation for normals and outside visibility.
      const triangleNormal = new THREE.Vector3(
        second.x - first.x,
        second.y - first.y,
        second.z - first.z,
      ).cross(
        new THREE.Vector3(
          third.x - first.x,
          third.y - first.y,
          third.z - first.z,
        ),
      );
      if (triangleNormal.dot(areaNormal) < 0) [second, third] = [third, second];
      for (const point of [first, second, third])
        positions.push(point.x, point.y, point.z);
      semanticFaceIds.push(face.id);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return { geometry, semanticFaceIds };
}

function hemisphereGeometry(
  radius: number,
  radialSegments = 48,
  verticalSegments = 18,
): BuiltGeometry {
  const positions: number[] = [];
  const point = (polar: number, azimuth: number): THREE.Vector3 => {
    const horizontal = radius * Math.sin(polar);
    return new THREE.Vector3(
      horizontal * Math.cos(azimuth),
      radius * Math.cos(polar),
      horizontal * Math.sin(azimuth),
    );
  };
  const pushTriangle = (
    first: THREE.Vector3,
    second: THREE.Vector3,
    third: THREE.Vector3,
  ): void => {
    positions.push(
      first.x,
      first.y,
      first.z,
      second.x,
      second.y,
      second.z,
      third.x,
      third.y,
      third.z,
    );
  };

  for (let row = 0; row < verticalSegments; row += 1) {
    const polar0 = (row * Math.PI) / (verticalSegments * 2);
    const polar1 = ((row + 1) * Math.PI) / (verticalSegments * 2);
    for (let column = 0; column < radialSegments; column += 1) {
      const azimuth0 = (column * Math.PI * 2) / radialSegments;
      const azimuth1 = ((column + 1) * Math.PI * 2) / radialSegments;
      const topLeft = point(polar0, azimuth0);
      const topRight = point(polar0, azimuth1);
      const bottomLeft = point(polar1, azimuth0);
      const bottomRight = point(polar1, azimuth1);
      if (row === 0) {
        pushTriangle(topLeft, bottomRight, bottomLeft);
      } else {
        pushTriangle(topLeft, bottomRight, bottomLeft);
        pushTriangle(topLeft, topRight, bottomRight);
      }
    }
  }

  const curvedTriangleCount = positions.length / 9;
  const center = new THREE.Vector3(0, 0, 0);
  for (let column = 0; column < radialSegments; column += 1) {
    const azimuth0 = (column * Math.PI * 2) / radialSegments;
    const azimuth1 = ((column + 1) * Math.PI * 2) / radialSegments;
    const current = new THREE.Vector3(
      radius * Math.cos(azimuth0),
      0,
      radius * Math.sin(azimuth0),
    );
    const next = new THREE.Vector3(
      radius * Math.cos(azimuth1),
      0,
      radius * Math.sin(azimuth1),
    );
    pushTriangle(center, current, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.addGroup(0, curvedTriangleCount * 3, 0);
  geometry.addGroup(
    curvedTriangleCount * 3,
    positions.length / 3 - curvedTriangleCount * 3,
    1,
  );
  geometry.computeVertexNormals();
  return {
    geometry,
    semanticSurfaceFaceIds: [
      ...Array.from(
        { length: curvedTriangleCount },
        () => "surface:hemisphere-curved" as const,
      ),
      ...Array.from(
        { length: positions.length / 9 - curvedTriangleCount },
        () => "surface:hemisphere-base" as const,
      ),
    ],
  };
}

function semanticObjects(topology: SolidTopology): THREE.Group {
  const root = new THREE.Group();
  root.name = "solid-semantic-elements";
  const vertices = new Map(topology.vertices.map((item) => [item.id, item]));
  for (const vertex of topology.vertices) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({ opacity: 0, transparent: true }),
    );
    marker.position.set(
      vertex.position.x,
      vertex.position.y,
      vertex.position.z,
    );
    marker.userData = { semanticId: vertex.id, semanticKind: "vertex" };
    root.add(marker);
  }
  for (const edge of topology.edges) {
    const start = vertices.get(edge.startVertexId)!.position;
    const end = vertices.get(edge.endVertexId)!.position;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(start.x, start.y, start.z),
        new THREE.Vector3(end.x, end.y, end.z),
      ]),
      new THREE.LineBasicMaterial({ opacity: 0, transparent: true }),
    );
    line.userData = { semanticId: edge.id, semanticKind: "edge" };
    root.add(line);
  }
  return root;
}

function analyticGeometry(definition: Solid3DDefinition): BuiltGeometry {
  switch (definition.kind) {
    case "sphere": {
      const geometry = new THREE.SphereGeometry(definition.radius, 48, 28);
      return {
        geometry,
        semanticSurfaceFaceIds: Array.from(
          { length: triangleCount(geometry) },
          () => "surface:sphere" as const,
        ),
      };
    }
    case "hemisphere":
      return hemisphereGeometry(definition.radius);
    case "cylinder": {
      const geometry = new THREE.CylinderGeometry(
        definition.radius,
        definition.radius,
        definition.height,
        48,
      );
      return {
        geometry,
        semanticSurfaceFaceIds: surfacesFromGroups(
          geometry,
          {
            0: "surface:cylinder-side",
            1: "surface:cylinder-top",
            2: "surface:cylinder-bottom",
          },
          "surface:cylinder-side",
        ),
      };
    }
    case "cone": {
      const geometry = new THREE.ConeGeometry(
        definition.radius,
        definition.height,
        48,
      );
      return {
        geometry,
        semanticSurfaceFaceIds: surfacesFromGroups(
          geometry,
          { 0: "surface:cone-side", 2: "surface:cone-base" },
          "surface:cone-side",
        ),
      };
    }
    case "truncated-cone": {
      const geometry = new THREE.CylinderGeometry(
        definition.topRadius,
        definition.bottomRadius,
        definition.height,
        48,
      );
      return {
        geometry,
        semanticSurfaceFaceIds: surfacesFromGroups(
          geometry,
          {
            0: "surface:truncated-cone-side",
            1: "surface:truncated-cone-top",
            2: "surface:truncated-cone-bottom",
          },
          "surface:truncated-cone-side",
        ),
      };
    }
    default: {
      const topology = createSolidTopology(definition);
      if (topology === null) throw new Error("Unsupported solid definition.");
      return {
        geometry: polyhedronGeometry(topology).geometry,
        semanticSurfaceFaceIds: [],
      };
    }
  }
}

export function buildSolidScene(
  definition: Solid3DDefinition,
): BuiltSolidScene {
  const topology = createSolidTopology(definition);
  const polyhedron = topology === null ? null : polyhedronGeometry(topology);
  const builtGeometry =
    polyhedron === null
      ? analyticGeometry(definition)
      : { geometry: polyhedron.geometry, semanticSurfaceFaceIds: [] };
  const material = new THREE.MeshStandardMaterial({
    color: 0x91b8c4,
    metalness: 0.03,
    opacity: 0.62,
    roughness: 0.72,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(builtGeometry.geometry, material);
  mesh.name = "solid-surface";
  mesh.userData = {
    semanticFaceIds: polyhedron?.semanticFaceIds ?? [],
    semanticKind: topology === null ? "analytic-surface" : "face",
    semanticSurfaceFaceIds: builtGeometry.semanticSurfaceFaceIds,
    semanticSurfaceIds: analyticSurfaceIds(definition),
  };
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(builtGeometry.geometry, 12),
    new THREE.LineBasicMaterial({ color: 0x243847 }),
  );
  edges.name = "solid-edges";
  const root = new THREE.Group();
  root.add(mesh, edges);
  if (topology !== null) root.add(semanticObjects(topology));
  return {
    mesh,
    root,
    semanticSurfaceFaceIds: builtGeometry.semanticSurfaceFaceIds,
    topology,
  };
}
