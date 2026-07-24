import Konva from "konva";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Group, Layer, Stage } from "react-konva";

import {
  panViewport,
  zoomViewportAt,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type Transform2D,
  type Vec2,
  type ViewportState,
} from "../../core/public";
import { BoardGrid } from "./grid";
import { clientPoint } from "./pointer";
import type { KonvaRendererRegistry } from "./renderer-registry";
import { useElementSize } from "./use-element-size";

const zoomBounds = { minimum: 0.1, maximum: 8 } as const;
const zoomStep = 1.08;
const wheelCommitDelayMs = 120;

type PanSource = "hand" | "middle" | "space";

interface PanSession {
  readonly captureElement: HTMLElement;
  readonly pointerId: number;
  readonly source: PanSource;
  readonly startPoint: Vec2;
  readonly startViewport: ViewportState;
  latestViewport: ViewportState;
}

interface WheelSession {
  latestViewport: ViewportState;
  timeoutId: number;
}

export interface BoardStageProps {
  readonly panMode: boolean;
  readonly registry: KonvaRendererRegistry;
  readonly scene: BoardSceneReadModel;
  readonly onViewportCommit: (viewport: ViewportState) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function sameViewport(left: ViewportState, right: ViewportState): boolean {
  return (
    left.zoom === right.zoom &&
    left.offset.x === right.offset.x &&
    left.offset.y === right.offset.y
  );
}

function applyTransforms(
  child: ReactElement,
  transforms: readonly Transform2D[],
): ReactElement {
  return transforms.reduceRight(
    (nested, transform, index) => (
      <Group
        key={`transform-${index}`}
        rotation={transform.rotation}
        scaleX={transform.scale.x}
        scaleY={transform.scale.y}
        x={transform.translation.x}
        y={transform.translation.y}
      >
        {nested}
      </Group>
    ),
    child,
  );
}

function renderItem(
  item: BoardRenderItem,
  registry: KonvaRendererRegistry,
): ReactElement {
  return (
    <Group key={item.object.id}>
      {applyTransforms(registry.render(item), item.transforms)}
    </Group>
  );
}

export function BoardStage({
  onViewportCommit,
  panMode,
  registry,
  scene,
}: BoardStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const wheelSessionRef = useRef<WheelSession | null>(null);
  const viewportRef = useRef(scene.viewport);
  const spacePressedRef = useRef(false);
  const [previewViewport, setPreviewViewport] = useState(scene.viewport);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const size = useElementSize(rootRef);

  useEffect(() => {
    viewportRef.current = scene.viewport;
    if (panSessionRef.current === null) {
      const wheelSession = wheelSessionRef.current;
      if (wheelSession !== null) {
        window.clearTimeout(wheelSession.timeoutId);
        wheelSessionRef.current = null;
      }
      setPreviewViewport(scene.viewport);
    }
  }, [scene.viewport]);

  const releaseCapture = useCallback((session: PanSession) => {
    if (session.captureElement.hasPointerCapture(session.pointerId)) {
      session.captureElement.releasePointerCapture(session.pointerId);
    }
  }, []);

  const finishPan = useCallback(
    (commit: boolean) => {
      const session = panSessionRef.current;
      if (session === null) {
        return;
      }

      panSessionRef.current = null;
      releaseCapture(session);
      setIsPanning(false);

      if (
        commit &&
        !sameViewport(session.startViewport, session.latestViewport)
      ) {
        setPreviewViewport(session.latestViewport);
        onViewportCommit(session.latestViewport);
      } else {
        setPreviewViewport(viewportRef.current);
      }
    },
    [onViewportCommit, releaseCapture],
  );

  const cancelWheel = useCallback(() => {
    const session = wheelSessionRef.current;
    if (session !== null) {
      window.clearTimeout(session.timeoutId);
      wheelSessionRef.current = null;
      setPreviewViewport(viewportRef.current);
    }
  }, []);

  const commitWheel = useCallback(() => {
    const session = wheelSessionRef.current;
    if (session !== null) {
      window.clearTimeout(session.timeoutId);
      wheelSessionRef.current = null;
      setPreviewViewport(session.latestViewport);
      onViewportCommit(session.latestViewport);
    }
  }, [onViewportCommit]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = panSessionRef.current;
      if (session === null || session.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const current = clientPoint(event);
      const viewport = panViewport(session.startViewport, {
        x: current.x - session.startPoint.x,
        y: current.y - session.startPoint.y,
      });
      session.latestViewport = viewport;
      setPreviewViewport(viewport);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (panSessionRef.current?.pointerId === event.pointerId) {
        finishPan(true);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (panSessionRef.current?.pointerId === event.pointerId) {
        finishPan(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        finishPan(false);
        cancelWheel();
        return;
      }
      if (event.code === "Space" && !isEditableTarget(event.target)) {
        event.preventDefault();
        spacePressedRef.current = true;
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        setSpacePressed(false);
        if (panSessionRef.current?.source === "space") {
          finishPan(true);
        }
      }
    };
    const handleBlur = () => {
      finishPan(false);
      cancelWheel();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [cancelWheel, finishPan]);

  useEffect(() => {
    const container = stageRef.current?.container();
    if (container === undefined) {
      return;
    }

    const handleLostCapture = () => finishPan(false);
    container.addEventListener("lostpointercapture", handleLostCapture);
    return () => {
      container.removeEventListener("lostpointercapture", handleLostCapture);
    };
  }, [finishPan, size.height, size.width]);

  useEffect(
    () => () => {
      const session = panSessionRef.current;
      if (session !== null) {
        panSessionRef.current = null;
        releaseCapture(session);
      }
      const wheelSession = wheelSessionRef.current;
      if (wheelSession !== null) {
        wheelSessionRef.current = null;
        window.clearTimeout(wheelSession.timeoutId);
      }
    },
    [releaseCapture],
  );

  useEffect(() => {
    if (
      !panMode &&
      panSessionRef.current !== null &&
      panSessionRef.current.source === "hand"
    ) {
      finishPan(false);
    }
  }, [finishPan, panMode]);

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (panSessionRef.current !== null) {
      return;
    }

    const isMiddleButton = event.evt.button === 1;
    const isLeftButton = event.evt.button === 0;
    const source: PanSource | null = isMiddleButton
      ? "middle"
      : isLeftButton && spacePressedRef.current
        ? "space"
        : isLeftButton && panMode
          ? "hand"
          : null;
    if (source === null) {
      return;
    }

    commitWheel();
    event.evt.preventDefault();
    const stage = event.target.getStage();
    if (stage === null) {
      return;
    }
    const captureElement = stage.container();
    captureElement.setPointerCapture(event.evt.pointerId);
    const viewport = previewViewport;
    panSessionRef.current = {
      captureElement,
      pointerId: event.evt.pointerId,
      source,
      startPoint: clientPoint(event.evt),
      startViewport: viewport,
      latestViewport: viewport,
    };
    setIsPanning(true);
  };

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    if (panSessionRef.current !== null) {
      return;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer === null || pointer === undefined) {
      return;
    }

    const direction =
      (event.evt.deltaY < 0 ? 1 : -1) * (event.evt.ctrlKey ? -1 : 1);
    const currentViewport =
      wheelSessionRef.current?.latestViewport ?? previewViewport;
    const requestedZoom =
      direction > 0
        ? currentViewport.zoom * zoomStep
        : currentViewport.zoom / zoomStep;
    const viewport = zoomViewportAt(
      currentViewport,
      pointer,
      requestedZoom,
      zoomBounds,
    );
    if (!sameViewport(viewport, currentViewport)) {
      setPreviewViewport(viewport);
      const currentSession = wheelSessionRef.current;
      if (currentSession !== null) {
        window.clearTimeout(currentSession.timeoutId);
      }
      wheelSessionRef.current = {
        latestViewport: viewport,
        timeoutId: window.setTimeout(commitWheel, wheelCommitDelayMs),
      };
    }
  };

  const cursor = isPanning
    ? "grabbing"
    : panMode || spacePressed
      ? "grab"
      : "default";

  return (
    <div
      ref={rootRef}
      aria-label="Бесконечное полотно TutorBoard"
      className="board-stage"
      data-panning={isPanning}
      data-testid="board-stage"
      role="application"
      style={{ cursor }}
    >
      <Stage
        ref={stageRef}
        height={size.height}
        onContextMenu={(event) => event.evt.preventDefault()}
        onPointerDown={handlePointerDown}
        onWheel={handleWheel}
        width={size.width}
      >
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            <BoardGrid size={size} viewport={previewViewport} />
          </Group>
        </Layer>
        <Layer>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            {scene.items.map((item) => renderItem(item, registry))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
