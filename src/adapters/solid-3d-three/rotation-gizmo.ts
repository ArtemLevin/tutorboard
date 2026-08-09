import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Solid3DQuaternion } from "../../core/public";

export type SolidRotationAxis = "x" | "y" | "z";

const axisVector = (axis: SolidRotationAxis): THREE.Vector3 => {
  switch (axis) {
    case "x":
      return new THREE.Vector3(1, 0, 0);
    case "y":
      return new THREE.Vector3(0, 1, 0);
    case "z":
      return new THREE.Vector3(0, 0, 1);
  }
};

export function quaternionAfterGizmoDrag(
  start: Solid3DQuaternion,
  axis: SolidRotationAxis,
  deltaRadians: number,
): Solid3DQuaternion {
  const startQuaternion = new THREE.Quaternion(
    start.x,
    start.y,
    start.z,
    start.w,
  ).normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(
    axisVector(axis),
    deltaRadians,
  );
  const result = delta.multiply(startQuaternion).normalize();
  return { w: result.w, x: result.x, y: result.y, z: result.z };
}

interface DragState {
  readonly axis: SolidRotationAxis;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startQuaternion: THREE.Quaternion;
}

export class SolidRotationGizmoController {
  readonly group: THREE.Group;
  private readonly handles: readonly THREE.Mesh[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private drag: DragState | null = null;

  constructor(
    private readonly root: THREE.Group,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly controls: OrbitControls,
    private readonly render: () => void,
    private readonly onCommit: (rotation: Solid3DQuaternion) => void,
  ) {
    const group = new THREE.Group();
    group.name = "solid-rotation-gizmo";
    const axes = new THREE.AxesHelper(1.65);
    axes.name = "solid-rotation-gizmo-axes";
    group.add(axes);

    const configs: readonly {
      axis: SolidRotationAxis;
      color: number;
      rotation: readonly [number, number, number];
    }[] = [
      { axis: "x", color: 0xdc2626, rotation: [0, Math.PI / 2, 0] },
      { axis: "y", color: 0x16a34a, rotation: [Math.PI / 2, 0, 0] },
      { axis: "z", color: 0x2563eb, rotation: [0, 0, 0] },
    ];
    const handles = configs.map(({ axis, color, rotation }) => {
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(1.9, 0.045, 8, 64),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          opacity: 0.8,
          transparent: true,
        }),
      );
      handle.name = `solid-rotation-gizmo-${axis}`;
      handle.rotation.set(...rotation);
      handle.renderOrder = 20;
      handle.userData.gizmoAxis = axis;
      group.add(handle);
      return handle;
    });
    group.visible = true;
    this.group = group;
    this.handles = handles;

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    for (const handle of this.handles) {
      handle.geometry.dispose();
      if (Array.isArray(handle.material)) {
        for (const material of handle.material) material.dispose();
      } else {
        handle.material.dispose();
      }
    }
    const axes = this.group.getObjectByName("solid-rotation-gizmo-axes");
    if (axes instanceof THREE.AxesHelper) {
      axes.geometry.dispose();
      const material = axes.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
    }
  }

  private readonly setPointer = (event: PointerEvent): void => {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.handles, false)[0];
    const axis = hit?.object.userData.gizmoAxis as
      SolidRotationAxis | undefined;
    if (axis === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.controls.enabled = false;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.drag = {
      axis,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startQuaternion: this.root.quaternion.clone(),
    };
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const deltaPixels =
      event.clientX - drag.startClientX - (event.clientY - drag.startClientY);
    const delta = new THREE.Quaternion().setFromAxisAngle(
      axisVector(drag.axis),
      deltaPixels * 0.012,
    );
    this.root.quaternion.copy(delta.multiply(drag.startQuaternion)).normalize();
    this.root.updateMatrixWorld(true);
    this.render();
  };

  private readonly finish = (event: PointerEvent, commit: boolean): void => {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.controls.enabled = true;
    this.drag = null;
    if (!commit) {
      this.root.quaternion.copy(drag.startQuaternion);
      this.root.updateMatrixWorld(true);
      this.render();
      return;
    }
    const rotation = this.root.quaternion.clone().normalize();
    this.onCommit({
      w: rotation.w,
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
    });
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    this.finish(event, true);
  };

  private readonly pointerCancel = (event: PointerEvent): void => {
    this.finish(event, false);
  };
}
