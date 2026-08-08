import { useEffect, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  add3,
  createSolidTopology,
  distance3,
  scale3,
  subtract3,
  type Solid3DRecord,
  type SolidElementRef,
  type SolidPointAnchor,
  type SolidSectionResult,
  type Vec3,
} from "../../core/public";
import { disposeSolidScene } from "./resource-disposal";
import { buildSolidScene } from "./scene-builder";

export interface Solid3DViewportProps {
  readonly cameraMode: "orthographic" | "perspective";
  readonly mode: "points" | "view";
  readonly onPointPlace: (position: Vec3, anchor: SolidPointAnchor) => void;
  readonly record: Solid3DRecord;
  readonly resetToken: number;
  readonly section: SolidSectionResult | null;
  readonly showSectionFill: boolean;
  readonly showSectionOutline: boolean;
  readonly highlightedElement?: SolidElementRef | null;
  readonly onElementHover?: (element: SolidElementRef | null) => void;
}

type WebGLFailure = "context-lost" | "unavailable";

function nearestAnchor(
  point: Vec3,
  topology: ReturnType<typeof buildSolidScene>["topology"],
  faceIndex: number | undefined,
): { readonly anchor: SolidPointAnchor; readonly position: Vec3 } {
  if (topology !== null) {
    const vertex = [...topology.vertices].sort(
      (a, b) => distance3(a.position, point) - distance3(b.position, point),
    )[0];
    if (vertex !== undefined && distance3(vertex.position, point) < 0.2)
      return {
        anchor: { kind: "vertex", vertexId: vertex.id },
        position: vertex.position,
      };
    let nearest: {
      edgeId: string;
      parameter: number;
      point: Vec3;
      distance: number;
    } | null = null;
    const vertices = new Map(
      topology.vertices.map((item) => [item.id, item.position]),
    );
    for (const edge of topology.edges) {
      const start = vertices.get(edge.startVertexId)!;
      const end = vertices.get(edge.endVertexId)!;
      const delta = subtract3(end, start);
      const denominator =
        delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
      const raw =
        denominator === 0
          ? 0
          : ((point.x - start.x) * delta.x +
              (point.y - start.y) * delta.y +
              (point.z - start.z) * delta.z) /
            denominator;
      const parameter = Math.min(1, Math.max(0, raw));
      const projected = add3(start, scale3(delta, parameter));
      const distance = distance3(projected, point);
      if (nearest === null || distance < nearest.distance)
        nearest = { distance, edgeId: edge.id, parameter, point: projected };
    }
    if (nearest !== null && nearest.distance < 0.14)
      return {
        anchor: {
          edgeId: nearest.edgeId,
          kind: "edge",
          parameter: nearest.parameter,
        },
        position: nearest.point,
      };
    const face =
      topology.faces[faceIndex === undefined ? 0 : Math.floor(faceIndex / 2)] ??
      topology.faces[0]!;
    return {
      anchor: {
        faceId: face.id,
        kind: "face",
        localCoordinates: { x: 0, y: 0 },
      },
      position: point,
    };
  }
  return {
    anchor: {
      kind: "analytic-surface",
      parameters: [point.x, point.y, point.z],
      surfaceId: "surface:0",
    },
    position: point,
  };
}

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

function builtHighlight(
  record: Solid3DRecord,
  element: SolidElementRef,
): THREE.Object3D | null {
  const topology = createSolidTopology(record.definition);
  const material = new THREE.LineBasicMaterial({ color: 0xf59e0b });
  if (element.kind === "point") {
    const point = record.points.find(({ id }) => id === element.id);
    if (point === undefined) return null;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    marker.position.set(point.position.x, point.position.y, point.position.z);
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
    onElementHover,
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
    scene: THREE.Scene;
  } | null>(null);
  const modeRef = useRef(props.mode);
  const onPointPlaceRef = useRef(props.onPointPlace);
  const onElementHoverRef = useRef(onElementHover);
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
    onElementHoverRef.current = onElementHover;
  }, [onElementHover]);

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
      const placed = nearestAnchor(
        { x: local.x, y: local.y, z: local.z },
        built.topology,
        hit.faceIndex ?? undefined,
      );
      onPointPlaceRef.current(placed.position, placed.anchor);
    };
    const pointerMove = (event: PointerEvent) => {
      if (onElementHoverRef.current === undefined) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.params.Line = { threshold: 0.08 };
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(built.root.children, true)[0];
      if (hit === undefined) {
        onElementHoverRef.current(null);
        return;
      }
      const kind = hit.object.userData.semanticKind as string | undefined;
      const id = hit.object.userData.semanticId as string | undefined;
      if ((kind === "vertex" || kind === "edge") && id !== undefined) {
        onElementHoverRef.current({ id, kind });
        return;
      }
      const faceId = (
        hit.object.userData.semanticFaceIds as string[] | undefined
      )?.[hit.faceIndex ?? -1];
      onElementHoverRef.current(
        faceId === undefined ? null : { id: faceId, kind: "face" },
      );
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    runtimeRef.current = {
      camera,
      controls,
      mesh: built.mesh,
      renderer,
      scene,
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
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      disposeSolidScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      runtimeRef.current = null;
    };
  }, [cameraMode, record.definition, resetToken, retryToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    const old = runtime.scene.getObjectByName("solid-overlays");
    if (old !== undefined) {
      runtime.scene.remove(old);
      disposeSolidScene(old);
    }
    const overlays = new THREE.Group();
    overlays.name = "solid-overlays";
    for (const point of record.points) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x7c3aed }),
      );
      marker.position.set(point.position.x, point.position.y, point.position.z);
      overlays.add(marker);
    }
    const highlighted = highlightedElement;
    if (highlighted !== null && highlighted !== undefined) {
      const highlight = builtHighlight(record, highlighted);
      if (highlight !== null) overlays.add(highlight);
    }
    if (section !== null)
      overlays.add(sectionObject(section, showSectionFill, showSectionOutline));
    runtime.scene.add(overlays);
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [
    record,
    section,
    showSectionFill,
    showSectionOutline,
    highlightedElement,
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
