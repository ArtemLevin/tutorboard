import { useEffect, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  createSolidTopology,
  resolveSolid3DPointPosition,
  solid3DModelQuaternion,
  type Solid3DQuaternion,
  type Solid3DRecord,
  type Solid3DPoint,
  type SolidAnalyticSurfaceId,
  type SolidElementRef,
  type SolidPointAnchor,
  type SolidSectionResult,
  type Vec3,
} from "../../core/public";
import { disposeSolidScene } from "./resource-disposal";
import { buildSolidScene } from "./scene-builder";
import { resolveSolidHitAnchor } from "./semantic-hit";
import {
  dragSolidPointToPointer,
  pickSolidPointForDrag,
  type SolidPointDragPlacement,
} from "./solid-point-drag";
import { SolidRotationGizmoController } from "./rotation-gizmo";

type PointDragEndHandler = (
  pointId: string,
  placement: SolidPointDragPlacement | null,
) => void;

export interface Solid3DViewportProps {
  readonly cameraMode: "orthographic" | "perspective";
  readonly highlightedSurfaceId?: SolidAnalyticSurfaceId | null;
  readonly mode: "points" | "view";
  readonly onPointPlace: (position: Vec3, anchor: SolidPointAnchor) => void;
  readonly onPointDragStart?: (pointId: string) => void;
  readonly onPointDragPreview?: (
    pointId: string,
    placement: SolidPointDragPlacement,
  ) => void;
  readonly onPointDragEnd?: PointDragEndHandler | undefined;
  readonly showRotationGizmo?: boolean;
  readonly onModelRotationCommit?:
    ((rotation: Solid3DQuaternion) => void) | undefined;
  readonly onSurfaceHover?: (surfaceId: SolidAnalyticSurfaceId | null) => void;
  readonly record: Solid3DRecord;
  readonly resetToken: number;
  readonly section: SolidSectionResult | null;
  /** Axis decoration is model-local and never persists in the document. */
  readonly rotationAxis?: readonly [Vec3, Vec3] | null;
  readonly showSectionFill: boolean;
  readonly showSectionOutline: boolean;
  readonly highlightedElement?: SolidElementRef | null;
  readonly onElementHover?: (element: SolidElementRef | null) => void;
}

type WebGLFailure = "context-lost" | "unavailable";

function sectionObject(
  section: SolidSectionResult,
  fill: boolean,
  outline: boolean,
): THREE.Group {
  const root = new THREE.Group();
  if (section.vertices.length < 3) return root;
  if (fill) {
    const positions: number[] = [];
    for (let index = 1; index + 1 < section.vertices.length; index += 1) {
      for (const point of [
        section.vertices[0]!,
        section.vertices[index]!,
        section.vertices[index + 1]!,
      ])
        positions.push(point.x, point.y, point.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    root.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x9b314e,
          opacity: 0.42,
          side: THREE.DoubleSide,
          transparent: true,
        }),
      ),
    );
  }
  if (outline) {
    const points = [...section.vertices, section.vertices[0]!].map(
      (point) => new THREE.Vector3(point.x, point.y, point.z),
    );
    root.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x8f2f45, linewidth: 2 }),
      ),
    );
  }
  root.renderOrder = 5;
  return root;
}

function triangleHighlight(
  geometry: THREE.BufferGeometry,
  selectedTriangles: readonly boolean[],
): THREE.Mesh | null {
  const source = geometry.getAttribute("position");
  const index = geometry.index;
  const triangleCount = Math.floor((index?.count ?? source.count) / 3);
  const positions: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!selectedTriangles[triangle]) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = triangle * 3 + corner;
      const vertex = index?.getX(offset) ?? offset;
      positions.push(
        source.getX(vertex),
        source.getY(vertex),
        source.getZ(vertex),
      );
    }
  }
  if (positions.length === 0) return null;
  const highlightGeometry = new THREE.BufferGeometry();
  highlightGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return new THREE.Mesh(
    highlightGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthWrite: false,
      opacity: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
}

function builtHighlight(
  record: Solid3DRecord,
  element: SolidElementRef,
): THREE.Object3D | null {
  const topology = createSolidTopology(record.definition);
  if (element.kind === "point") {
    const point = record.points.find(({ id }) => id === element.id);
    if (point === undefined) return null;
    const position = resolveSolid3DPointPosition(record.definition, point);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    marker.position.set(position.x, position.y, position.z);
    return marker;
  }
  if (topology === null) return null;
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  if (element.kind === "vertex") {
    const point = vertices.get(element.id);
    if (point === undefined) return null;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    marker.position.set(point.x, point.y, point.z);
    return marker;
  }
  const ids =
    element.kind === "edge"
      ? (() => {
          const edge = topology.edges.find(({ id }) => id === element.id);
          return edge === undefined
            ? []
            : [edge.startVertexId, edge.endVertexId];
        })()
      : element.kind === "face"
        ? (topology.faces.find(({ id }) => id === element.id)?.vertexIds ?? [])
        : [];
  if (ids.length < 2) return null;
  const points = ids.flatMap((id) => {
    const point = vertices.get(id);
    return point === undefined
      ? []
      : [new THREE.Vector3(point.x, point.y, point.z)];
  });
  if (element.kind === "face" && points.length > 0)
    points.push(points[0]!.clone());
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xf59e0b }),
  );
}

export function Solid3DViewport(props: Solid3DViewportProps): ReactElement {
  const {
    cameraMode,
    highlightedElement,
    highlightedSurfaceId,
    onElementHover,
    onModelRotationCommit,
    onSurfaceHover,
    record,
    resetToken,
    section,
    showSectionFill,
    showSectionOutline,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    camera: THREE.Camera;
    active: boolean;
    setCamera: (next: THREE.Camera) => void;
    controls: OrbitControls;
    mesh: THREE.Mesh;
    renderer: THREE.WebGLRenderer;
    root: THREE.Group;
    scene: THREE.Scene;
    semanticSurfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[];
  } | null>(null);
  const modeRef = useRef(props.mode);
  const onPointPlaceRef = useRef(props.onPointPlace);
  const onPointDragStartRef = useRef(props.onPointDragStart);
  const onPointDragPreviewRef = useRef(props.onPointDragPreview);
  const onPointDragEndRef = useRef(props.onPointDragEnd);
  const recordRef = useRef(record);
  const onModelRotationCommitRef = useRef(onModelRotationCommit);
  const rotationGizmoRef = useRef<SolidRotationGizmoController | null>(null);
  const showRotationGizmoRef = useRef(props.showRotationGizmo ?? false);
  const onElementHoverRef = useRef(onElementHover);
  const onSurfaceHoverRef = useRef(onSurfaceHover);
  const projectionRef = useRef(record.projection);
  const [failure, setFailure] = useState<WebGLFailure | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Stable semantic geometry must not lose its GPU context on reference-only updates.
  const definitionKey = JSON.stringify(record.definition);

  useEffect(() => {
    modeRef.current = props.mode;
    const controls = runtimeRef.current?.controls;
    if (controls !== undefined) {
      controls.mouseButtons.LEFT =
        props.mode === "points" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT =
        props.mode === "points" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    }
  }, [props.mode]);

  useEffect(() => {
    onPointPlaceRef.current = props.onPointPlace;
    onPointDragStartRef.current = props.onPointDragStart;
    onPointDragPreviewRef.current = props.onPointDragPreview;
    onPointDragEndRef.current = props.onPointDragEnd;
    recordRef.current = record;
  }, [
    props.onPointPlace,
    props.onPointDragStart,
    props.onPointDragPreview,
    props.onPointDragEnd,
    record,
  ]);

  useEffect(() => {
    onModelRotationCommitRef.current = onModelRotationCommit;
    showRotationGizmoRef.current = props.showRotationGizmo ?? false;
    rotationGizmoRef.current?.setEnabled(
      Boolean(showRotationGizmoRef.current && onModelRotationCommit),
    );
  }, [onModelRotationCommit, props.showRotationGizmo]);

  useEffect(() => {
    onElementHoverRef.current = onElementHover;
  }, [onElementHover]);

  useEffect(() => {
    onSurfaceHoverRef.current = onSurfaceHover;
  }, [onSurfaceHover]);

  useEffect(() => {
    projectionRef.current = record.projection;
  }, [record.projection]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(260, container.clientHeight);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f0e7);
    let camera: THREE.Camera =
      cameraMode === "orthographic"
        ? new THREE.OrthographicCamera(
            (-2.8 * width) / height,
            (2.8 * width) / height,
            2.8,
            -2.8,
            0.01,
            100,
          )
        : new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(4.8, 3.8, 5.4);
    camera.lookAt(0, 0, 0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "default",
      });
    } catch {
      queueMicrotask(() => {
        if (!cancelled) setFailure("unavailable");
      });
      return () => {
        cancelled = true;
      };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);
    const built = buildSolidScene(record.definition);
    const quaternion = solid3DModelQuaternion(projectionRef.current);
    built.root.quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
    scene.add(built.root, new THREE.HemisphereLight(0xffffff, 0x50606a, 2.1));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(5, 7, 4);
    scene.add(light);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT =
      modeRef.current === "points" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT =
      modeRef.current === "points" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    let contextReady = true;
    const render = () => {
      if (contextReady) renderer.render(scene, camera);
    };
    const rotationGizmo = new SolidRotationGizmoController(
      built.root,
      camera,
      renderer.domElement,
      controls,
      render,
      (rotation) => onModelRotationCommitRef.current?.(rotation),
    );
    scene.add(rotationGizmo.group);
    rotationGizmoRef.current = rotationGizmo;
    rotationGizmo.setEnabled(
      Boolean(showRotationGizmoRef.current && onModelRotationCommitRef.current),
    );
    controls.addEventListener("change", render);
    const resize = () => {
      const nextWidth = Math.max(320, container.clientWidth);
      const nextHeight = Math.max(260, container.clientHeight);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
      }
      if (camera instanceof THREE.OrthographicCamera) {
        const aspect = nextWidth / nextHeight;
        camera.left = -2.8 * aspect;
        camera.right = 2.8 * aspect;
        camera.updateProjectionMatrix();
      }
      if (contextReady) renderer.setSize(nextWidth, nextHeight, false);
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerOrigin: { readonly x: number; readonly y: number } | null = null;
    let suppressClick = false;
    let dragFrame = 0;
    let drag: {
      readonly pointerId: number;
      readonly point: Solid3DPoint;
      placement: SolidPointDragPlacement | null;
    } | null = null;
    const dragScene = {
      camera,
      root: built.root,
      mesh: built.mesh,
      topology: built.topology,
      surfaceFaceIds: built.semanticSurfaceFaceIds,
    };
    const pointerDragDown = (event: PointerEvent) => {
      if (!contextReady) return;
      // A canceled gesture may never emit click. Do not swallow the next click.
      if (drag === null) suppressClick = false;
      if (
        modeRef.current !== "points" ||
        event.button !== 0 ||
        onPointDragEndRef.current === undefined
      )
        return;
      const point = pickSolidPointForDrag(
        recordRef.current,
        dragScene,
        renderer.domElement.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
      if (point === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = true;
      pointerOrigin = null;
      drag = { pointerId: event.pointerId, point, placement: null };
      renderer.domElement.setPointerCapture?.(event.pointerId);
      onPointDragStartRef.current?.(point.id);
    };
    const pointerDragMove = (event: PointerEvent) => {
      if (!contextReady) return;
      const active = drag;
      if (active === null || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const placement = dragSolidPointToPointer(
        recordRef.current,
        active.point,
        dragScene,
        renderer.domElement.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
      if (placement === null) return;
      active.placement = placement;
      if (dragFrame !== 0) return;
      dragFrame = window.requestAnimationFrame(() => {
        dragFrame = 0;
        if (drag === active && active.placement !== null)
          onPointDragPreviewRef.current?.(active.point.id, active.placement);
      });
    };
    const finishPointDrag = (event: PointerEvent, commit: boolean) => {
      const active = drag;
      if (active === null || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = null;
      if (!commit) suppressClick = false;
      if (dragFrame !== 0) window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      if (renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      onPointDragEndRef.current?.(
        active.point.id,
        commit ? active.placement : null,
      );
    };
    const pointerDragUp = (event: PointerEvent) => finishPointDrag(event, true);
    const pointerDragCancel = (event: PointerEvent) =>
      finishPointDrag(event, false);
    const pointerDown = (event: PointerEvent) => {
      if (!contextReady) return;
      pointerOrigin = { x: event.clientX, y: event.clientY };
    };
    const click = (event: MouseEvent) => {
      if (!contextReady) return;
      if (suppressClick) {
        suppressClick = false;
        pointerOrigin = null;
        return;
      }
      const moved =
        pointerOrigin === null
          ? 0
          : Math.hypot(
              event.clientX - pointerOrigin.x,
              event.clientY - pointerOrigin.y,
            );
      pointerOrigin = null;
      if (modeRef.current !== "points" || event.button !== 0 || moved > 4)
        return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(built.mesh, false)[0];
      if (hit === undefined) return;
      const local = built.mesh.worldToLocal(hit.point.clone());
      const placed = resolveSolidHitAnchor(
        record.definition,
        { x: local.x, y: local.y, z: local.z },
        built.topology,
        hit.faceIndex ?? undefined,
        built.semanticSurfaceFaceIds,
      );
      if (placed !== null)
        onPointPlaceRef.current(placed.position, placed.anchor);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!contextReady) return;
      if (
        onElementHoverRef.current === undefined &&
        onSurfaceHoverRef.current === undefined
      )
        return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.params.Line = { threshold: 0.08 };
      raycaster.setFromCamera(pointer, camera);
      if (built.topology === null) {
        const surfaceHit = raycaster.intersectObject(built.mesh, false)[0];
        const surfaceId =
          surfaceHit?.faceIndex === undefined || surfaceHit.faceIndex === null
            ? null
            : (built.semanticSurfaceFaceIds[surfaceHit.faceIndex] ?? null);
        onSurfaceHoverRef.current?.(surfaceId);
        onElementHoverRef.current?.(null);
        return;
      }
      onSurfaceHoverRef.current?.(null);
      const hit = raycaster.intersectObjects(built.root.children, true)[0];
      if (hit === undefined) {
        onElementHoverRef.current?.(null);
        return;
      }
      const kind = hit.object.userData.semanticKind as string | undefined;
      const id = hit.object.userData.semanticId as string | undefined;
      if ((kind === "vertex" || kind === "edge") && id !== undefined) {
        onElementHoverRef.current?.({ id, kind });
        return;
      }
      const faceId = (
        hit.object.userData.semanticFaceIds as string[] | undefined
      )?.[hit.faceIndex ?? -1];
      onElementHoverRef.current?.(
        faceId === undefined ? null : { id: faceId, kind: "face" },
      );
    };
    const pointerLeave = () => {
      onElementHoverRef.current?.(null);
      onSurfaceHoverRef.current?.(null);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (!contextReady) return;
      contextReady = false;
      if (runtimeRef.current?.renderer === renderer)
        runtimeRef.current.active = false;
      controls.enabled = false;
      rotationGizmo.setEnabled(false);
      if (dragFrame !== 0) window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      if (drag !== null) {
        const active = drag;
        drag = null;
        if (renderer.domElement.hasPointerCapture?.(active.pointerId))
          renderer.domElement.releasePointerCapture(active.pointerId);
        onPointDragEndRef.current?.(active.point.id, null);
      }
      pointerOrigin = null;
      suppressClick = false;
      onElementHoverRef.current?.(null);
      onSurfaceHoverRef.current?.(null);
      setFailure("context-lost");
    };
    const contextRestored = () => {
      if (contextReady) return;
      contextReady = true;
      if (runtimeRef.current?.renderer === renderer)
        runtimeRef.current.active = true;
      controls.enabled = true;
      rotationGizmo.setEnabled(
        Boolean(showRotationGizmoRef.current && onModelRotationCommitRef.current),
      );
      resize();
      setFailure(null);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
    renderer.domElement.addEventListener("pointerdown", pointerDragDown, true);
    renderer.domElement.addEventListener("pointermove", pointerDragMove, true);
    renderer.domElement.addEventListener("pointerup", pointerDragUp, true);
    renderer.domElement.addEventListener(
      "pointercancel",
      pointerDragCancel,
      true,
    );
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
    runtimeRef.current = {
      camera,
      setCamera: (next) => {
        camera = next;
        dragScene.camera = next;
      },
      active: true,
      controls,
      mesh: built.mesh,
      renderer,
      root: built.root,
      scene,
      semanticSurfaceFaceIds: built.semanticSurfaceFaceIds,
    };
    render();
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      if (dragFrame !== 0) window.cancelAnimationFrame(dragFrame);
      renderer.domElement.removeEventListener(
        "pointerdown",
        pointerDragDown,
        true,
      );
      renderer.domElement.removeEventListener(
        "pointermove",
        pointerDragMove,
        true,
      );
      renderer.domElement.removeEventListener("pointerup", pointerDragUp, true);
      renderer.domElement.removeEventListener(
        "pointercancel",
        pointerDragCancel,
        true,
      );
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      contextReady = false;
      rotationGizmoRef.current = null;
      scene.remove(rotationGizmo.group);
      rotationGizmo.dispose();
      disposeSolidScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === container)
        renderer.domElement.remove();
      if (runtimeRef.current?.renderer === renderer) runtimeRef.current = null;
    };
  }, [definitionKey, resetToken, retryToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    const current = runtime.camera;
    if (
      (cameraMode === "orthographic" && current instanceof THREE.OrthographicCamera) ||
      (cameraMode === "perspective" && current instanceof THREE.PerspectiveCamera)
    ) return;
    const container = containerRef.current;
    if (container === null) return;
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(260, container.clientHeight);
    const next: THREE.Camera =
      cameraMode === "orthographic"
        ? new THREE.OrthographicCamera(-2.8 * width / height, 2.8 * width / height, 2.8, -2.8, 0.01, 100)
        : new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    next.position.copy(current.position);
    next.quaternion.copy(current.quaternion);
    next.updateMatrixWorld(true);
    runtime.camera = next;
    runtime.setCamera(next);
    runtime.controls.object = next;
    rotationGizmoRef.current?.setCamera(next);
    runtime.controls.update();
    if (runtime.active) runtime.renderer.render(runtime.scene, next);
  }, [cameraMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    const quaternion = solid3DModelQuaternion(record.projection);
    runtime.root.quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
    runtime.root.updateMatrixWorld(true);
    if (runtime.active) runtime.renderer.render(runtime.scene, runtime.camera);
  }, [record.projection]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    const old = runtime.root.getObjectByName("solid-overlays");
    if (old !== undefined) {
      runtime.root.remove(old);
      disposeSolidScene(old);
    }
    const overlays = new THREE.Group();
    overlays.name = "solid-overlays";
    for (const point of record.points) {
      const position = resolveSolid3DPointPosition(record.definition, point);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x7c3aed }),
      );
      marker.position.set(position.x, position.y, position.z);
      overlays.add(marker);
    }
    const highlighted = highlightedElement;
    if (highlighted !== null && highlighted !== undefined) {
      const highlight = builtHighlight(record, highlighted);
      if (highlight !== null) overlays.add(highlight);
      if (highlighted.kind === "face") {
        const faceIds = runtime.mesh.userData.semanticFaceIds as
          readonly string[] | undefined;
        if (faceIds !== undefined) {
          const faceFill = triangleHighlight(
            runtime.mesh.geometry,
            faceIds.map((id) => id === highlighted.id),
          );
          if (faceFill !== null) overlays.add(faceFill);
        }
      }
    }
    if (highlightedSurfaceId !== null && highlightedSurfaceId !== undefined) {
      const surfaceFill = triangleHighlight(
        runtime.mesh.geometry,
        runtime.semanticSurfaceFaceIds.map((id) => id === highlightedSurfaceId),
      );
      if (surfaceFill !== null) overlays.add(surfaceFill);
    }
    if (section !== null)
      overlays.add(sectionObject(section, showSectionFill, showSectionOutline));
    if (props.rotationAxis !== null && props.rotationAxis !== undefined) {
      const [first, second] = props.rotationAxis;
      const axis = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(first.x, first.y, first.z),
          new THREE.Vector3(second.x, second.y, second.z),
        ]),
        new THREE.LineDashedMaterial({
          color: 0x475569,
          dashSize: 0.12,
          gapSize: 0.07,
          depthTest: false,
          transparent: true,
          opacity: 0.78,
        }),
      );
      axis.name = "solid-rotation-two-point-axis";
      axis.computeLineDistances();
      axis.renderOrder = 6;
      overlays.add(axis);
    }
    runtime.root.add(overlays);
    if (runtime.active) runtime.renderer.render(runtime.scene, runtime.camera);
  }, [
    record,
    section,
    showSectionFill,
    showSectionOutline,
    highlightedElement,
    highlightedSurfaceId,
    props.rotationAxis,
  ]);

  return (
    <div className="solid-3d-viewport-frame">
      <div
        aria-label="Интерактивная трёхмерная модель"
        aria-hidden={failure !== null}
        className="solid-3d-viewport"
        ref={containerRef}
      />
      {failure !== null ? (
        <div className="solid-3d-fallback" role="status">
          <div>
            <strong>
              {failure === "context-lost"
                ? "Контекст WebGL был потерян."
                : "WebGL не удалось запустить."}
            </strong>
            <p>
              {failure === "context-lost"
                ? "Ожидаем восстановления графического контекста. Можно также перезапустить 3D."
                : "Координаты и список элементов остаются доступны справа."}
            </p>
            <button
              onClick={() => {
                setFailure(null);
                setRetryToken((value) => value + 1);
              }}
              type="button"
            >
              Повторить запуск 3D
            </button>
            <details>
              <summary>Как проверить браузер</summary>
              <p>
                Включите аппаратное ускорение в настройках браузера,
                перезапустите его и проверьте «Graphics Feature Status»
                на странице chrome://gpu.
              </p>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
