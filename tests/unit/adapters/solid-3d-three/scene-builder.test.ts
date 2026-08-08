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
        new Set([
          "surface:hemisphere-curved",
          "surface:hemisphere-base",
        ]),
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
