import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { frameSolidCamera } from "../../../../src/adapters/solid-3d-three/camera-framing";

function frame(radius: number, width: number, height: number) {
  const geometry = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const perspective = new THREE.PerspectiveCamera(
    45,
    width / height,
    0.01,
    100,
  );
  try {
    const focus = frameSolidCamera(ortho, mesh, width, height);
    frameSolidCamera(perspective, mesh, width, height);
    return { focus, ortho, perspective };
  } finally {
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

describe("3D camera model fitting", () => {
  it("retains the default cube projection for existing raycast scenarios", () => {
    const { ortho, perspective } = frame(1, 600, 400);
    expect(ortho.top).toBeCloseTo(2.8, 8);
    expect(ortho.bottom).toBeCloseTo(-2.8, 8);
    expect(perspective.position.x).toBeCloseTo(4.8, 8);
    expect(perspective.position.y).toBeCloseTo(3.8, 8);
    expect(perspective.position.z).toBeCloseTo(5.4, 8);
  });

  it("frames very large objects without clipping at the old far=100 plane", () => {
    const { ortho, perspective } = frame(10000, 800, 600);
    expect(ortho.top).toBeGreaterThan(10000);
    expect(ortho.far).toBeGreaterThan(100);
    expect(perspective.far).toBeGreaterThan(10000);
    expect(perspective.near).toBeGreaterThan(0);
  });

  it("zooms into a very small shape and allows portrait viewports", () => {
    const { ortho, perspective } = frame(0.01, 300, 700);
    expect(ortho.top).toBeLessThan(0.2);
    expect(ortho.right).toBeGreaterThan(0);
    expect(perspective.far).toBeLessThan(100);
  });
});
