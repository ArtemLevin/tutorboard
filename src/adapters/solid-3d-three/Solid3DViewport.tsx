import { useEffect, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  createSolidTopology,
  resolveSolid3DPointPosition,
  solid3DModelQuaternion,
  type Solid3DQuaternion,
  type Solid3DRecord,
  type SolidAnalyticSurfaceId,
  type SolidElementRef,
  type SolidPointAnchor,
  type SolidSectionResult,
  type Vec3,
} from "../../core/public";
import { disposeSolidScene } from "./resource-disposal";
import { buildSolidScene } from "./scene-builder";
import { resolveSolidHitAnchor } from "./semantic-hit";
import { SolidRotationGizmoController } from "./rotation-gizmo";

export interface Solid3DViewportProps {
  readonly cameraMode: "orthographic" | "perspective";
  readonly highlightedSurfaceId?: SolidAnalyticSurfaceId | null;
  readonly mode: "points" | "view";
  readonly onPointPlace: (position: Vec3, anchor: SolidPointAnchor) => void;
  readonly onModelRotationCommit?:
    ((rotation: Solid3DQuaternion) => void) | undefined;
  readonly onSurfaceHover?: (surfaceId: SolidAnalyticSurfaceId | null) => void;
  readonly record: Solid3DRecord;
  readonly resetToken: number;
  readonly section: SolidSectionResult | null;
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
  const material = new THREE.LineBasicMaterial({ color: 0xf59e0b });
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
    material,
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
    controls: OrbitControls;
    mesh: THREE.Mesh;
    renderer: THREE.WebGLRenderer;
    root: THREE.Group;
    scene: THREE.Scene;
    semanticSurfaceFaceIds: readonly (SolidAnalyticSurfaceId | null)[];
  } | null>(null);
  const modeRef = useRef(props.mode);
  const onPointPlaceRef = useRef(props.onPointPlace);
  const onModelRotationCommitRef = useRef(onModelRotationCommit);
  const onElementHoverRef = useRef(onElementHover);
  const onSurfaceHoverRef = useRef(onSurfaceHover);
  const projectionRef = useRef(record.projection);
  const [failure, setFailure] = useState<WebGLFailure | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    modeRef.current = props.mode;
    const controls = runtimeRef.current?.controls;
    if (controls !== undefined) {
      controls.mouseButtons.LEFT =
        props.mode === "points" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    }
  }, [props.mode]);

  useEffect(() => {
    onPointPlaceRef.current = props.onPointPlace;
  }, [props.onPointPlace]);

  useEffect(() => {
    onModelRotationCommitRef.current = onModelRotationCommit;
  }, [onModelRotationCommit]);

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
    const camera: THREE.Camera =
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
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    const render = () => renderer.render(scene, camera);
    const rotationGizmo =
      onModelRotationCommitRef.current === undefined
        ? null
        : new SolidRotationGizmoController(
            built.root,
            camera,
            renderer.domElement,
            controls,
            render,
            (rotation) => onModelRotationCommitRef.current?.(rotation),
          );
    if (rotationGizmo !== null) scene.add(rotationGizmo.group);
    controls.addEventListener("change", render);
    const resizeObserver = new ResizeObserver(() => {
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
      renderer.setSize(nextWidth, nextHeight, false);
      render();
    });
    resizeObserver.observe(container);
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFailure("context-lost");
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerOrigin: { readonly x: number; readonly y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      pointerOrigin = { x: event.clientX, y: event.clientY };
    };
    const click = (event: MouseEvent) => {
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
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
    runtimeRef.current = {
      camera,
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
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      if (rotationGizmo !== null) {
        scene.remove(rotationGizmo.group);
        rotationGizmo.dispose();
      }
      disposeSolidScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      runtimeRef.current = null;
    };
  }, [cameraMode, record.definition, resetToken, retryToken]);

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
    runtime.renderer.render(runtime.scene, runtime.camera);
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
    runtime.root.add(overlays);
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [
    record,
    section,
    showSectionFill,
    showSectionOutline,
    highlightedElement,
    highlightedSurfaceId,
  ]);

  return failure !== null ? (
    <div className="solid-3d-fallback" role="status">
      <div>
        <strong>
          {failure === "context-lost"
            ? "Контекст WebGL был потерян."
            : "WebGL не удалось запустить."}
        </strong>
        <p>Координаты и список элементов остаются доступны справа.</p>
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
            Включите аппаратное ускорение в настройках браузера, перезапустите
            его и проверьте раздел «Graphics Feature Status» на странице
            chrome://gpu.
          </p>
        </details>
      </div>
    </div>
  ) : (
    <div
      aria-label="Интерактивная трёхмерная модель"
      className="solid-3d-viewport"
      ref={containerRef}
    />
  );
}
