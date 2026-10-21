import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildSolidScene } from "../../../../src/adapters/solid-3d-three/scene-builder";

function disposeScene(scene: ReturnType<typeof buildSolidScene>): void {
  scene.root.traverse((object) => {
    if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry)
      object.geometry.dispose();
    if ("material" in object) {
      const material = object.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.floor(
    (geometry.index?.count ?? geometry.getAttribute("position").count) / 3,
  );
}

describe("buildSolidScene", () => {
  it("builds a closed analytic hemisphere with per-face semantic surfaces", () => {
    const scene = buildSolidScene({ kind: "hemisphere", radius: 2 });
    try {
      expect(scene.topology).toBeNull();
      expect(
        scene.mesh.geometry.getAttribute("position").count,
      ).toBeGreaterThan(100);
      expect(scene.mesh.userData.semanticSurfaceIds).toEqual([
        "surface:hemisphere-curved",
        "surface:hemisphere-base",
      ]);
      expect(scene.semanticSurfaceFaceIds).toHaveLength(
        triangleCount(scene.mesh.geometry),
      );
      expect(new Set(scene.semanticSurfaceFaceIds)).toEqual(
        new Set(["surface:hemisphere-curved", "surface:hemisphere-base"]),
      );
    } finally {
      disposeScene(scene);
    }
  });

  it("maps every analytic triangle to its mathematical surface", () => {
    const cases = [
      [
        { height: 4, kind: "cylinder", radius: 2 } as const,
        [
          "surface:cylinder-side",
          "surface:cylinder-bottom",
          "surface:cylinder-top",
        ],
      ],
      [
        { height: 4, kind: "cone", radius: 2 } as const,
        ["surface:cone-side", "surface:cone-base"],
      ],
      [
        {
          bottomRadius: 2,
          height: 4,
          kind: "truncated-cone",
          topRadius: 1,
        } as const,
        [
          "surface:truncated-cone-side",
          "surface:truncated-cone-bottom",
          "surface:truncated-cone-top",
        ],
      ],
    ] as const;

    for (const [definition, expectedSurfaceIds] of cases) {
      const scene = buildSolidScene(definition);
      try {
        expect(scene.semanticSurfaceFaceIds).toHaveLength(
          triangleCount(scene.mesh.geometry),
        );
        expect(new Set(scene.semanticSurfaceFaceIds)).toEqual(
          new Set(expectedSurfaceIds),
        );
        expect(scene.semanticSurfaceFaceIds.every((id) => id !== null)).toBe(
          true,
        );
      } finally {
        disposeScene(scene);
      }
    }
  });

  it("maps every sphere triangle to the sphere semantic surface", () => {
    const scene = buildSolidScene({ kind: "sphere", radius: 2 });
    try {
      expect(scene.semanticSurfaceFaceIds).toHaveLength(
        triangleCount(scene.mesh.geometry),
      );
      expect(new Set(scene.semanticSurfaceFaceIds)).toEqual(
        new Set(["surface:sphere"]),
      );
    } finally {
      disposeScene(scene);
    }
  });

  it("triangulates concave prism caps without filling their U-shaped notch", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 5 },
      { x: 0, y: 5 },
    ];
    const scene = buildSolidScene({ kind: "prism", base, height: 2 });
    try {
      const geometry = scene.mesh.geometry;
      const faceIds = scene.mesh.userData.semanticFaceIds as string[];
      expect(faceIds).toHaveLength(triangleCount(geometry));
      expect(new Set(faceIds)).toEqual(
        new Set(scene.topology?.faces.map(({ id }) => id)),
      );
      const positions = geometry.getAttribute("position");
      for (const faceId of ["face:0", "face:1"]) {
        let totalArea = 0;
        for (let triangle = 0; triangle < faceIds.length; triangle += 1) {
          if (faceIds[triangle] !== faceId) continue;
          const a = new THREE.Vector3().fromBufferAttribute(
            positions,
            triangle * 3,
          );
          const b = new THREE.Vector3().fromBufferAttribute(
            positions,
            triangle * 3 + 1,
          );
          const c = new THREE.Vector3().fromBufferAttribute(
            positions,
            triangle * 3 + 2,
          );
          totalArea +=
            Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
          const centroidX = (a.x + b.x + c.x) / 3;
          const centroidZ = (a.z + b.z + c.z) / 3;
          expect(
            centroidX > 1 && centroidX < 4 && centroidZ > 1 && centroidZ < 5,
          ).toBe(false);
        }
        // 5×5 bounding square minus the 3×4 notch.
        expect(totalArea).toBeCloseTo(13, 6);
      }
      scene.mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(2.5, 3, 3),
        new THREE.Vector3(0, -1, 0),
      );
      expect(ray.intersectObject(scene.mesh, false)).toHaveLength(0);
    } finally {
      disposeScene(scene);
    }
  });

  it("builds octahedron and dodecahedron from semantic topology", () => {
    for (const definition of [
      { edgeLength: 2, kind: "octahedron" } as const,
      {
        edgeLength: 2,
        kind: "regular-polyhedron",
        variant: "dodecahedron",
      } as const,
    ]) {
      const scene = buildSolidScene(definition);
      try {
        expect(scene.topology).not.toBeNull();
        expect(scene.semanticSurfaceFaceIds).toEqual([]);
        expect(
          scene.mesh.geometry.getAttribute("position").count,
        ).toBeGreaterThan(0);
      } finally {
        disposeScene(scene);
      }
    }
  });
});
