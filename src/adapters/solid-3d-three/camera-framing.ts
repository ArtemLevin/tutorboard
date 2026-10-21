import * as THREE from "three";

/**
 * Fit the complete semantic body, including a rotated group transform, in the
 * camera frustum. The ratios retain the historic cube view for E2E picking.
 * No renderer allocation is needed to compute the framing.
 */
export function frameSolidCamera(
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
  mesh: THREE.Mesh,
  width: number,
  height: number,
  viewingDirection = new THREE.Vector3(4.8, 3.8, 5.4),
): THREE.Vector3 {
  const sphere = new THREE.Box3()
    .setFromObject(mesh)
    .getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(0.01, sphere.radius);
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const halfHeight =
    Math.max(0.02, radius * (2.8 / Math.sqrt(3))) / Math.min(1, aspect);
  const halfFov = THREE.MathUtils.degToRad(45 / 2);
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect));
  const originalDistance = new THREE.Vector3(4.8, 3.8, 5.4).length();
  const distance = Math.max(
    radius * (originalDistance / Math.sqrt(3)),
    (radius * 1.3) / Math.sin(limitingFov),
  );
  const direction = viewingDirection.clone().normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.lookAt(sphere.center);
  camera.near = Math.max(0.001, distance - radius * 2);
  camera.far = distance + radius * 3 + 1;
  if (camera instanceof THREE.OrthographicCamera) {
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.zoom = 1;
  }
  camera.updateProjectionMatrix();
  return sphere.center.clone();
}
