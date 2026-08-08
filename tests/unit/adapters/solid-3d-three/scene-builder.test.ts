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

describe("buildSolidScene", () => {
  it("builds a closed analytic hemisphere with semantic surfaces", () => {
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
        expect(
          scene.mesh.geometry.getAttribute("position").count,
        ).toBeGreaterThan(0);
      } finally {
        disposeScene(scene);
      }
    }
  });
});
