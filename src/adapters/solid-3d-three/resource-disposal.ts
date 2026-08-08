import * as THREE from "three";

export function disposeSolidScene(root: THREE.Object3D): void {
  root.traverse((object) => {
    const candidate = object as THREE.Mesh;
    candidate.geometry?.dispose();
    const materials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material === undefined
        ? []
        : [candidate.material];
    for (const material of materials) material.dispose();
  });
}
