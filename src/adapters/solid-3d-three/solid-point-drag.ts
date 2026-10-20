import * as THREE from "three";

import {
  canonicalizeAnalyticSurfaceAnchor,
  canonicalizeTopologyFaceAnchor,
  decodeTopologyFaceAnchorId,
  isSolidSectionHelperPoint,
  resolveSolid3DPointPosition,
  resolveSolidPointAnchor,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidAnalyticSurfaceId,
  type SolidPointAnchor,
  type SolidTopology,
  type Vec3,
} from "../../core/public";

export interface SolidPointDragPlacement {
  readonly anchor: SolidPointAnchor;
  readonly position: Vec3;
}

export interface SolidPointDragScene {
  readonly camera: THREE.Camera;
  readonly root: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly topology: SolidTopology | null;
  readonly surfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[];
}

function localPoint(root: THREE.Group, point: Vec3): THREE.Vector3 {
  return root.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
}

export function pickSolidPointForDrag(
  record: Solid3DRecord,
  scene: SolidPointDragScene,
  bounds: DOMRect,
  x: number,
  y: number,
  radius = 16,
): Solid3DPoint | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  scene.root.updateMatrixWorld(true);
  scene.camera.updateMatrixWorld();
  let closest: Solid3DPoint | null = null;
  let distanceSquared = radius * radius;
  for (const point of record.points) {
    // A vertex has no degree of freedom and cannot be dragged.
    if (point.anchor.kind === "vertex" || isSolidSectionHelperPoint(point))
      continue;
    const position = resolveSolid3DPointPosition(record.definition, point);
    const screen = localPoint(scene.root, position).project(scene.camera);
    if (screen.z < -1 || screen.z > 1) continue;
    const px = bounds.left + ((screen.x + 1) / 2) * bounds.width;
    const py = bounds.top + ((1 - screen.y) / 2) * bounds.height;
    const distance = (px - x) ** 2 + (py - y) ** 2;
    if (distance >= distanceSquared) continue;
    closest = point;
    distanceSquared = distance;
  }
  return closest;
}

export function dragSolidPointToPointer(
  record: Solid3DRecord,
  point: Solid3DPoint,
  scene: SolidPointDragScene,
  bounds: DOMRect,
  x: number,
  y: number,
): SolidPointDragPlacement | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const pointer = new THREE.Vector2(
    ((x - bounds.left) / bounds.width) * 2 - 1,
    -((y - bounds.top) / bounds.height) * 2 + 1,
  );
  scene.root.updateMatrixWorld(true);
  scene.camera.updateMatrixWorld();

  if (point.anchor.kind === "edge" && scene.topology !== null) {
    const edge = scene.topology.edges.find(
      ({ id }) => id === point.anchor.edgeId,
    );
    if (edge === undefined) return null;
    const start = scene.topology.vertices.find(
      ({ id }) => id === edge.startVertexId,
    );
    const end = scene.topology.vertices.find(
      ({ id }) => id === edge.endVertexId,
    );
    if (start === undefined || end === undefined) return null;
    const a = localPoint(scene.root, start.position).project(scene.camera);
    const b = localPoint(scene.root, end.position).project(scene.camera);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-10) return null;
    const parameter = Math.min(
      1,
      Math.max(
        0,
        ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / lengthSquared,
      ),
    );
    const anchor: SolidPointAnchor = { ...point.anchor, parameter };
    const position = resolveSolidPointAnchor(scene.topology, anchor);
    return position === null ? null : { anchor, position };
  }

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, scene.camera);
  const hit = raycaster.intersectObject(scene.mesh, false)[0];
  if (hit === undefined) return null;
  const local = scene.mesh.worldToLocal(hit.point.clone());
  const position: Vec3 = { x: local.x, y: local.y, z: local.z };

  if (point.anchor.kind === "face" && scene.topology !== null) {
    const next = canonicalizeTopologyFaceAnchor(
      scene.topology,
      position,
      hit.faceIndex ?? undefined,
    );
    if (next === null) return null;
    const originalFace = decodeTopologyFaceAnchorId(point.anchor.faceId).faceId;
    const nextFace = decodeTopologyFaceAnchorId(next.anchor.faceId).faceId;
    return originalFace === nextFace ? next : null;
  }

  if (point.anchor.kind === "analytic-surface") {
    const surface = scene.surfaceFaceIds[hit.faceIndex ?? -1];
    if (surface !== point.anchor.surfaceId) return null;
    return canonicalizeAnalyticSurfaceAnchor(
      record.definition,
      position,
      point.anchor.surfaceId,
    );
  }
  return null;
}
