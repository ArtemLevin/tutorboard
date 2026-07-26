import Konva from "konva";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Group, Layer, Rect, Stage } from "react-konva";

import {
  boardObjectId,
  batchBoardRenderItems,
  panViewport,
  screenToWorld,
  selectVisibleBoardItems,
  zoomViewportAt,
  type BoardObjectId,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type Transform2D,
  type Vec2,
  type ViewportState,
} from "../../core/public";
import { BoardGrid } from "./grid";
import { clientPoint, elementPoint } from "./pointer";
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

interface DrawingSession {
  readonly captureElement: HTMLElement;
  readonly pointerId: number;
  readonly viewport: ViewportState;
}

interface SelectionSession {
  readonly captureElement: HTMLElement;
  readonly pointerId: number;
  readonly viewport: ViewportState;
}

export interface WorldPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
  readonly pressure: number;
}

export interface SelectionPointerStartSample extends WorldPointerSample {
  readonly additive: boolean;
  readonly objectId: BoardObjectId | null;
}

export interface BoardSelectionRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface BoardSelectionBounds {
  readonly id: BoardObjectId;
  readonly rect: BoardSelectionRect;
}

export interface BoardStageProps {
  readonly drawingModeKey: string | null;
  readonly onWorldPointerCancel: (pointerId: number) => void;
  readonly onWorldPointerFinish: (sample: WorldPointerSample) => void;
  readonly onWorldPointerMove: (sample: WorldPointerSample) => void;
  readonly onWorldPointerStart: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerCancel: (pointerId: number) => void;
  readonly onSelectionPointerFinish: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerMove: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerStart: (
    sample: SelectionPointerStartSample,
  ) => void;
  readonly panMode: boolean;
  readonly previewItems?: readonly BoardRenderItem[];
  readonly registry: KonvaRendererRegistry;
  readonly scene: BoardSceneReadModel;
  readonly selectedObjectIds?: readonly BoardObjectId[];
  readonly selectionBounds?: readonly BoardSelectionBounds[];
  readonly selectionMarquee?: BoardSelectionRect | null;
  readonly selectionModeKey: string | null;
  readonly selectionPreviewDelta?: Vec2 | null;
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
  options: {
    readonly interactive: boolean;
    readonly previewDelta?: Vec2 | null;
  },
): ReactElement {
  return (
    <Group
      id={item.object.id}
      key={item.object.id}
      listening={options.interactive}
      {...(options.interactive ? { name: "board-object" } : {})}
      x={options.previewDelta?.x ?? 0}
      y={options.previewDelta?.y ?? 0}
    >
      {applyTransforms(registry.render(item), item.transforms)}
    </Group>
  );
}

function objectIdFromTarget(target: Konva.Node): BoardObjectId | null {
  let current: Konva.Node | null = target;
  while (current !== null) {
    if (current.hasName("board-object")) {
      return boardObjectId(current.id());
    }
    current = current.getParent();
  }
  return null;
}

export function BoardStage({
  drawingModeKey,
  onViewportCommit,
  onWorldPointerCancel,
  onWorldPointerFinish,
  onWorldPointerMove,
  onWorldPointerStart,
  onSelectionPointerCancel,
  onSelectionPointerFinish,
  onSelectionPointerMove,
  onSelectionPointerStart,
  panMode,
  previewItems = [],
  registry,
  scene,
  selectedObjectIds = [],
  selectionBounds = [],
  selectionMarquee = null,
  selectionModeKey,
  selectionPreviewDelta = null,
}: BoardStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const drawingSessionRef = useRef<DrawingSession | null>(null);
  const selectionSessionRef = useRef<SelectionSession | null>(null);
  const wheelSessionRef = useRef<WheelSession | null>(null);
  const worldPointerCallbacksRef = useRef({
    cancel: onWorldPointerCancel,
    finish: onWorldPointerFinish,
    move: onWorldPointerMove,
    start: onWorldPointerStart,
  });
  const selectionPointerCallbacksRef = useRef({
    cancel: onSelectionPointerCancel,
    finish: onSelectionPointerFinish,
    move: onSelectionPointerMove,
    start: onSelectionPointerStart,
  });
  const viewportRef = useRef(scene.viewport);
  const spacePressedRef = useRef(false);
  const [previewViewport, setPreviewViewport] = useState(scene.viewport);
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const size = useElementSize(rootRef);
  const visibleItemBatches = useMemo(
    () =>
      batchBoardRenderItems(
        selectVisibleBoardItems(scene.items, previewViewport, size),
      ),
    [previewViewport, scene.items, size],
  );

  useEffect(() => {
    worldPointerCallbacksRef.current = {
      cancel: onWorldPointerCancel,
      finish: onWorldPointerFinish,
      move: onWorldPointerMove,
      start: onWorldPointerStart,
    };
  }, [
    onWorldPointerCancel,
    onWorldPointerFinish,
    onWorldPointerMove,
    onWorldPointerStart,
  ]);

  useEffect(() => {
    selectionPointerCallbacksRef.current = {
      cancel: onSelectionPointerCancel,
      finish: onSelectionPointerFinish,
      move: onSelectionPointerMove,
      start: onSelectionPointerStart,
    };
  }, [
    onSelectionPointerCancel,
    onSelectionPointerFinish,
    onSelectionPointerMove,
    onSelectionPointerStart,
  ]);

  useEffect(() => {
    viewportRef.current = scene.viewport;
    if (
      panSessionRef.current === null &&
      drawingSessionRef.current === null &&
      selectionSessionRef.current === null
    ) {
      const wheelSession = wheelSessionRef.current;
      if (wheelSession !== null) {
        window.clearTimeout(wheelSession.timeoutId);
        wheelSessionRef.current = null;
      }
      setPreviewViewport(scene.viewport);
    }
  }, [scene.viewport]);

  const releaseCapture = useCallback(
    (session: {
      readonly captureElement: HTMLElement;
      readonly pointerId: number;
    }) => {
      if (session.captureElement.hasPointerCapture(session.pointerId)) {
        session.captureElement.releasePointerCapture(session.pointerId);
      }
    },
    [],
  );

  const worldSample = useCallback(
    (event: PointerEvent, session: DrawingSession): WorldPointerSample => ({
      point: screenToWorld(
        elementPoint(event, session.captureElement),
        session.viewport,
      ),
      pointerId: event.pointerId,
      pressure: Number.isFinite(event.pressure)
        ? Math.min(1, Math.max(0, event.pressure))
        : 0,
    }),
    [],
  );

  const selectionWorldSample = useCallback(
    (event: PointerEvent, session: SelectionSession): WorldPointerSample => ({
      point: screenToWorld(
        elementPoint(event, session.captureElement),
        session.viewport,
      ),
      pointerId: event.pointerId,
      pressure: 0,
    }),
    [],
  );

  const finishDrawing = useCallback(
    (commit: boolean, event?: PointerEvent) => {
      const session = drawingSessionRef.current;
      if (session === null) {
        return;
      }

      drawingSessionRef.current = null;
      releaseCapture(session);
      setIsDrawing(false);
      setPreviewViewport(viewportRef.current);

      if (commit && event !== undefined) {
        worldPointerCallbacksRef.current.finish(worldSample(event, session));
      } else {
        worldPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [releaseCapture, worldSample],
  );

  const finishSelection = useCallback(
    (commit: boolean, event?: PointerEvent) => {
      const session = selectionSessionRef.current;
      if (session === null) {
        return;
      }

      selectionSessionRef.current = null;
      releaseCapture(session);
      setIsSelecting(false);
      setPreviewViewport(viewportRef.current);
      if (commit && event !== undefined) {
        selectionPointerCallbacksRef.current.finish(
          selectionWorldSample(event, session),
        );
      } else {
        selectionPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [releaseCapture, selectionWorldSample],
  );

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
      const drawingSession = drawingSessionRef.current;
      if (
        drawingSession !== null &&
        drawingSession.pointerId === event.pointerId
      ) {
        event.preventDefault();
        worldPointerCallbacksRef.current.move(
          worldSample(event, drawingSession),
        );
        return;
      }

      const selectionSession = selectionSessionRef.current;
      if (
        selectionSession !== null &&
        selectionSession.pointerId === event.pointerId
      ) {
        event.preventDefault();
        selectionPointerCallbacksRef.current.move(
          selectionWorldSample(event, selectionSession),
        );
        return;
      }

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
      if (drawingSessionRef.current?.pointerId === event.pointerId) {
        finishDrawing(true, event);
        return;
      }
      if (selectionSessionRef.current?.pointerId === event.pointerId) {
        finishSelection(true, event);
        return;
      }
      if (panSessionRef.current?.pointerId === event.pointerId) {
        finishPan(true);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (drawingSessionRef.current?.pointerId === event.pointerId) {
        finishDrawing(false);
        return;
      }
      if (selectionSessionRef.current?.pointerId === event.pointerId) {
        finishSelection(false);
        return;
      }
      if (panSessionRef.current?.pointerId === event.pointerId) {
        finishPan(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        finishDrawing(false);
        finishSelection(false);
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
      finishDrawing(false);
      finishSelection(false);
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
  }, [
    cancelWheel,
    finishDrawing,
    finishPan,
    finishSelection,
    selectionWorldSample,
    worldSample,
  ]);

  useEffect(() => {
    const container = stageRef.current?.container();
    if (container === undefined) {
      return;
    }

    const handleLostCapture = (event: PointerEvent) => {
      if (drawingSessionRef.current?.pointerId === event.pointerId) {
        finishDrawing(false);
      }
      if (selectionSessionRef.current?.pointerId === event.pointerId) {
        finishSelection(false);
      }
      if (panSessionRef.current?.pointerId === event.pointerId) {
        finishPan(false);
      }
    };
    container.addEventListener("lostpointercapture", handleLostCapture);
    return () => {
      container.removeEventListener("lostpointercapture", handleLostCapture);
    };
  }, [finishDrawing, finishPan, finishSelection, size.height, size.width]);

  useEffect(
    () => () => {
      const session = panSessionRef.current;
      if (session !== null) {
        panSessionRef.current = null;
        releaseCapture(session);
      }
      const drawingSession = drawingSessionRef.current;
      if (drawingSession !== null) {
        drawingSessionRef.current = null;
        releaseCapture(drawingSession);
        worldPointerCallbacksRef.current.cancel(drawingSession.pointerId);
      }
      const selectionSession = selectionSessionRef.current;
      if (selectionSession !== null) {
        selectionSessionRef.current = null;
        releaseCapture(selectionSession);
        selectionPointerCallbacksRef.current.cancel(selectionSession.pointerId);
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

  useEffect(() => {
    if (drawingSessionRef.current !== null) {
      finishDrawing(false);
    }
  }, [drawingModeKey, finishDrawing]);

  useEffect(() => {
    if (selectionSessionRef.current !== null) {
      finishSelection(false);
    }
  }, [finishSelection, selectionModeKey]);

  useEffect(() => {
    const session = drawingSessionRef.current;
    if (session !== null && !sameViewport(session.viewport, scene.viewport)) {
      finishDrawing(false);
    }
  }, [finishDrawing, scene.viewport]);

  useEffect(() => {
    const session = selectionSessionRef.current;
    if (session !== null && !sameViewport(session.viewport, scene.viewport)) {
      finishSelection(false);
    }
  }, [finishSelection, scene.viewport]);

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
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
      if (!isLeftButton) {
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
      if (selectionModeKey !== null) {
        const session: SelectionSession = {
          captureElement,
          pointerId: event.evt.pointerId,
          viewport: previewViewport,
        };
        selectionSessionRef.current = session;
        setIsSelecting(true);
        selectionPointerCallbacksRef.current.start({
          ...selectionWorldSample(event.evt, session),
          additive: event.evt.shiftKey,
          objectId: objectIdFromTarget(event.target),
        });
        return;
      }
      if (drawingModeKey === null) {
        releaseCapture({
          captureElement,
          pointerId: event.evt.pointerId,
        });
        return;
      }
      const session: DrawingSession = {
        captureElement,
        pointerId: event.evt.pointerId,
        viewport: previewViewport,
      };
      drawingSessionRef.current = session;
      setIsDrawing(true);
      worldPointerCallbacksRef.current.start(worldSample(event.evt, session));
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
    if (
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
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
      : selectionModeKey !== null
        ? "default"
        : drawingModeKey === null
          ? "default"
          : "crosshair";
  const selected = new Set(selectedObjectIds);

  return (
    <div
      ref={rootRef}
      aria-label="Бесконечное полотно TutorBoard"
      className="board-stage"
      data-drawing={isDrawing}
      data-panning={isPanning}
      data-selecting={isSelecting}
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
            {visibleItemBatches.map((batch, batchIndex) => (
              <Group key={`render-batch-${batchIndex}`}>
                {batch.map((item) =>
                  renderItem(item, registry, {
                    interactive: true,
                    previewDelta: selected.has(item.object.id)
                      ? selectionPreviewDelta
                      : null,
                  }),
                )}
              </Group>
            ))}
            {previewItems.map((item) =>
              renderItem(item, registry, { interactive: false }),
            )}
          </Group>
        </Layer>
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            {selectionBounds.map(({ id, rect }) => (
              <Rect
                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}
                fill="rgba(44, 113, 130, 0.05)"
                height={rect.height}
                key={id}
                stroke="#2c7182"
                strokeWidth={1.5 / previewViewport.zoom}
                width={rect.width}
                x={rect.x + (selectionPreviewDelta?.x ?? 0)}
                y={rect.y + (selectionPreviewDelta?.y ?? 0)}
              />
            ))}
            {selectionMarquee === null ? null : (
              <Rect
                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}
                fill="rgba(44, 113, 130, 0.09)"
                height={selectionMarquee.height}
                stroke="#2c7182"
                strokeWidth={1.5 / previewViewport.zoom}
                width={selectionMarquee.width}
                x={selectionMarquee.x}
                y={selectionMarquee.y}
              />
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
