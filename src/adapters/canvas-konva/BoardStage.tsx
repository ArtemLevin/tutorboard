import Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";

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
import {
  buildSmoothClosedStrokePoints,
  flattenStrokePoints,
} from "../../shared/stroke-smoothing";
import { BoardGrid } from "./grid";
import { clientPoint, elementPoint } from "./pointer";
import { collectCoalescedPointerEvents } from "./pointer-samples";
import type {
  CoordinatePlotRenderInteraction,
  KonvaRendererRegistry,
} from "./renderer-registry";
import { useElementSize } from "./use-element-size";

const zoomBounds = { minimum: 0.1, maximum: 8 } as const;
const zoomStep = 1.08;
const wheelCommitDelayMs = 120;
const rightDoubleClickDelayMs = 450;
const rightDoubleClickDistancePx = 8;

type PanSource = "hand" | "middle" | "right" | "space";

interface PanSession {
  activated: boolean;
  readonly canvasContextEligible: boolean;
  readonly captureElement: HTMLElement;
  readonly pointerId: number;
  readonly source: PanSource;
  readonly startPoint: Vec2;
  readonly startViewport: ViewportState;
  latestViewport: ViewportState;
}

interface RightClickCandidate {
  readonly objectId: BoardObjectId;
  readonly point: Vec2;
  readonly timestamp: number;
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

export type BoardSelectionAreaOperation = "add" | "replace" | "subtract";

export interface SelectionPointerStartSample extends WorldPointerSample {
  readonly additive: boolean;
  readonly areaOperation?: BoardSelectionAreaOperation;
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

export interface BoardObjectTransformSnapshot {
  readonly objectId: BoardObjectId;
  readonly position: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
}

export interface CanvasContextMenuRequest {
  readonly clientPoint: Vec2;
  readonly worldPoint: Vec2;
}

export interface BoardStageProps {
  readonly coordinatePlotInteraction?:
    CoordinatePlotRenderInteraction | undefined;
  readonly drawingModeKey: string | null;
  readonly laserActive?: boolean;
  readonly laserPoint?: Vec2 | null;
  readonly laserTrailOpacity?: number;
  readonly laserTrailPoints?: readonly Vec2[];
  readonly onCanvasContextMenuRequest?:
    ((request: CanvasContextMenuRequest) => void) | undefined;
  readonly onObjectSettingsRequest?:
    ((objectId: BoardObjectId) => void) | undefined;
  readonly onPanModeRequest?: () => void;
  readonly onWorldPointerCancel: (pointerId: number) => void;
  readonly onWorldPointerFinish: (sample: WorldPointerSample) => void;
  readonly onWorldPointerMove: (sample: WorldPointerSample) => void;
  readonly onWorldPointerHover?: (point: Vec2) => void;
  readonly onWorldPointerStart: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerCancel: (pointerId: number) => void;
  readonly onSelectionPointerFinish: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerMove: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerStart: (
    sample: SelectionPointerStartSample,
  ) => void;
  readonly onSelectionTransform?: (
    transforms: readonly BoardObjectTransformSnapshot[],
  ) => void;
  readonly panMode: boolean;
  readonly previewItems?: readonly BoardRenderItem[];
  readonly registry: KonvaRendererRegistry;
  readonly remoteCursors?: readonly {
    readonly actorId: string;
    readonly point: Vec2;
  }[];
  readonly scene: BoardSceneReadModel;
  readonly selectedObjectIds?: readonly BoardObjectId[];
  readonly selectionBounds?: readonly BoardSelectionBounds[];
  readonly selectionLasso?: readonly Vec2[] | null;
  readonly selectionMarquee?: BoardSelectionRect | null;
  readonly selectionModeKey: string | null;
  readonly selectionPreviewDelta?: Vec2 | null;
  readonly transformableObjectIds?: readonly BoardObjectId[];
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
    readonly coordinatePlotInteraction?:
      CoordinatePlotRenderInteraction | undefined;
    readonly interactive: boolean;
    readonly previewDelta?: Vec2 | null;
    readonly zoom: number;
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
      {applyTransforms(
        registry.render(item, {
          zoom: options.zoom,
          ...(options.coordinatePlotInteraction === undefined
            ? {}
            : { coordinatePlot: options.coordinatePlotInteraction }),
        }),
        item.transforms,
      )}
    </Group>
  );
}

function isTransformerTarget(target: Konva.Node): boolean {
  let current: Konva.Node | null = target;
  while (current !== null) {
    if (current.getClassName() === "Transformer") {
      return true;
    }
    current = current.getParent();
  }
  return false;
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

function objectIdBelowTransformer(
  stage: Konva.Stage,
  point: Vec2,
): BoardObjectId | null {
  const intersections = stage.getAllIntersections(point);
  for (let index = intersections.length - 1; index >= 0; index -= 1) {
    const target = intersections[index];
    if (target === undefined || isTransformerTarget(target)) continue;
    const objectId = objectIdFromTarget(target);
    if (objectId !== null) return objectId;
  }
  return null;
}

function normalizeTransformValue(value: number): number {
  const normalized = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function BoardStage({
  coordinatePlotInteraction,
  drawingModeKey,
  laserActive = false,
  laserPoint = null,
  laserTrailOpacity = 1,
  laserTrailPoints = [],
  onCanvasContextMenuRequest,
  onObjectSettingsRequest,
  onPanModeRequest,
  onViewportCommit,
  onWorldPointerCancel,
  onWorldPointerFinish,
  onWorldPointerMove,
  onWorldPointerHover,
  onWorldPointerStart,
  onSelectionPointerCancel,
  onSelectionPointerFinish,
  onSelectionPointerMove,
  onSelectionPointerStart,
  onSelectionTransform,
  panMode,
  previewItems = [],
  registry,
  remoteCursors = [],
  scene,
  selectedObjectIds = [],
  selectionBounds = [],
  selectionLasso = null,
  selectionMarquee = null,
  selectionModeKey,
  selectionPreviewDelta = null,
  transformableObjectIds = [],
}: BoardStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const drawingSessionRef = useRef<DrawingSession | null>(null);
  const selectionSessionRef = useRef<SelectionSession | null>(null);
  const wheelSessionRef = useRef<WheelSession | null>(null);
  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);
  const canvasContextMenuRequestRef = useRef(onCanvasContextMenuRequest);
  const panModeRequestRef = useRef(onPanModeRequest);
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
  const worldPointerHoverRef = useRef(onWorldPointerHover);
  const spacePressedRef = useRef(false);
  const [previewViewport, setPreviewViewport] = useState(scene.viewport);
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const size = useElementSize(rootRef);
  const visibleItemBatches = useMemo(
    () =>
      batchBoardRenderItems(
        selectVisibleBoardItems(scene.items, previewViewport, size),
      ),
    [previewViewport, scene.items, size],
  );
  const smoothedSelectionLasso = useMemo(
    () =>
      selectionLasso === null || selectionLasso.length < 3
        ? selectionLasso
        : buildSmoothClosedStrokePoints(selectionLasso, {
            baseSegmentLength: 6,
            maxOutputPoints: 8_000,
            maxSubdivisions: 8,
            minSubdivisions: 4,
            zoom: previewViewport.zoom,
          }),
    [previewViewport.zoom, selectionLasso],
  );

  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    if (stage === null || transformer === null) {
      return;
    }
    const allowed = new Set(transformableObjectIds);
    const nodes = stage.find(".board-transform-target").filter((node) => {
      const objectId = objectIdFromTarget(node);
      return objectId !== null && allowed.has(objectId);
    });
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [previewViewport, scene.items, transformableObjectIds]);

  const finishTransform = useCallback(() => {
    const transformer = transformerRef.current;
    setIsTransforming(false);
    if (transformer === null) {
      return;
    }
    const transforms = transformer.nodes().flatMap((node) => {
      const objectId = objectIdFromTarget(node);
      const values = [
        node.x(),
        node.y(),
        node.rotation(),
        node.scaleX(),
        node.scaleY(),
      ];
      if (
        objectId === null ||
        values.some((value) => !Number.isFinite(value))
      ) {
        return [];
      }
      return [
        {
          objectId,
          position: {
            x: normalizeTransformValue(node.x()),
            y: normalizeTransformValue(node.y()),
          },
          rotation: normalizeTransformValue(node.rotation()),
          scale: {
            x: normalizeTransformValue(node.scaleX()),
            y: normalizeTransformValue(node.scaleY()),
          },
        },
      ];
    });
    if (transforms.length > 0) {
      onSelectionTransform?.(transforms);
    }
  }, [onSelectionTransform]);

  useLayoutEffect(() => {
    panModeRequestRef.current = onPanModeRequest;
  }, [onPanModeRequest]);

  useLayoutEffect(() => {
    canvasContextMenuRequestRef.current = onCanvasContextMenuRequest;
  }, [onCanvasContextMenuRequest]);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
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

  const worldSamples = useCallback(
    (
      event: PointerEvent,
      session: DrawingSession,
    ): readonly WorldPointerSample[] =>
      collectCoalescedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const emitWorldPointerMoves = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      for (const sample of samples) {
        worldPointerCallbacksRef.current.move(sample);
      }
    },
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

  const beginSelectionSession = useCallback(
    (
      event: PointerEvent,
      captureElement: HTMLElement,
      objectId: BoardObjectId | null,
    ) => {
      captureElement.setPointerCapture(event.pointerId);
      const session: SelectionSession = {
        captureElement,
        pointerId: event.pointerId,
        viewport: previewViewport,
      };
      selectionSessionRef.current = session;
      setIsSelecting(true);
      selectionPointerCallbacksRef.current.start({
        ...selectionWorldSample(event, session),
        additive: event.shiftKey,
        areaOperation: event.altKey
          ? "subtract"
          : event.shiftKey
            ? "add"
            : "replace",
        objectId,
      });
    },
    [previewViewport, selectionWorldSample],
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
        const samples = worldSamples(event, session);
        const finalSample = samples.at(-1);
        if (finalSample !== undefined) {
          emitWorldPointerMoves(samples.slice(0, -1));
          worldPointerCallbacksRef.current.finish(finalSample);
        } else {
          worldPointerCallbacksRef.current.finish(worldSample(event, session));
        }
      } else {
        worldPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [emitWorldPointerMoves, releaseCapture, worldSample, worldSamples],
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

  useLayoutEffect(() => {
    worldPointerHoverRef.current = onWorldPointerHover;
  }, [onWorldPointerHover]);
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root !== null &&
        event.target instanceof Node &&
        root.contains(event.target)
      ) {
        worldPointerHoverRef.current?.(
          screenToWorld(elementPoint(event, root), viewportRef.current),
        );
      }
      const drawingSession = drawingSessionRef.current;
      if (
        drawingSession !== null &&
        drawingSession.pointerId === event.pointerId
      ) {
        event.preventDefault();
        emitWorldPointerMoves(worldSamples(event, drawingSession));
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
      const displacement = Math.hypot(
        current.x - session.startPoint.x,
        current.y - session.startPoint.y,
      );
      if (session.source === "right" && !session.activated) {
        if (displacement <= rightDoubleClickDistancePx) {
          return;
        }
        session.activated = true;
        rightClickCandidateRef.current = null;
        panModeRequestRef.current?.();
      }
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
        const session = panSessionRef.current;
        if (
          session.source === "right" &&
          !session.activated &&
          session.canvasContextEligible
        ) {
          canvasContextMenuRequestRef.current?.({
            clientPoint: clientPoint(event),
            worldPoint: screenToWorld(
              elementPoint(event, session.captureElement),
              session.startViewport,
            ),
          });
        }
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
      rightClickCandidateRef.current = null;
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
    emitWorldPointerMoves,
    finishDrawing,
    finishPan,
    finishSelection,
    selectionWorldSample,
    worldSamples,
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
      rightClickCandidateRef.current = null;
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

  useLayoutEffect(() => {
    if (drawingSessionRef.current !== null) {
      finishDrawing(false);
    }
  }, [drawingModeKey, finishDrawing]);

  useLayoutEffect(() => {
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

  const handleSelectionBackgroundPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.button !== 0 ||
      selectionModeKey === null ||
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
      return;
    }
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    const container = stage.container();
    const bounds = container.getBoundingClientRect();
    const hit = stage.getIntersection({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (
      hit !== null &&
      (isTransformerTarget(hit) || objectIdFromTarget(hit) !== null)
    ) {
      return;
    }
    commitWheel();
    event.preventDefault();
    beginSelectionSession(event.nativeEvent, event.currentTarget, null);
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const isRightButton = event.evt.button === 2;
    const isLassoAreaModifier =
      selectionModeKey === "selection.lasso" &&
      (event.evt.shiftKey || event.evt.altKey);
    if (
      !isRightButton &&
      isTransformerTarget(event.target) &&
      !isLassoAreaModifier
    ) {
      commitWheel();
      return;
    }
    if (
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
      return;
    }

    const hitObjectId = isLassoAreaModifier
      ? null
      : objectIdFromTarget(event.target);
    if (isRightButton && onObjectSettingsRequest !== undefined) {
      const point = clientPoint(event.evt);
      const previous = rightClickCandidateRef.current;
      const elapsed =
        previous === null
          ? Number.POSITIVE_INFINITY
          : event.evt.timeStamp - previous.timestamp;
      const sameObject = previous?.objectId === hitObjectId;
      const withinDistance =
        previous !== null &&
        Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <=
          rightDoubleClickDistancePx;
      if (
        hitObjectId !== null &&
        sameObject &&
        elapsed >= 0 &&
        elapsed <= rightDoubleClickDelayMs &&
        withinDistance
      ) {
        rightClickCandidateRef.current = null;
        commitWheel();
        event.cancelBubble = true;
        event.evt.preventDefault();
        event.evt.stopPropagation();
        onObjectSettingsRequest(hitObjectId);
        return;
      }
      rightClickCandidateRef.current =
        hitObjectId === null
          ? null
          : { objectId: hitObjectId, point, timestamp: event.evt.timeStamp };
    } else if (isRightButton) {
      rightClickCandidateRef.current = null;
    }
    const isMiddleButton = event.evt.button === 1;
    const isLeftButton = event.evt.button === 0;
    const shouldSelectHitObject =
      isLeftButton && hitObjectId !== null && drawingModeKey === null;
    const source: PanSource | null = isRightButton
      ? "right"
      : isMiddleButton
        ? "middle"
        : isLeftButton && spacePressedRef.current
          ? "space"
          : isLeftButton &&
              panMode &&
              selectionModeKey === null &&
              !shouldSelectHitObject
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
      if (selectionModeKey !== null || shouldSelectHitObject) {
        beginSelectionSession(event.evt, captureElement, hitObjectId);
        return;
      }
      captureElement.setPointerCapture(event.evt.pointerId);
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
      activated: source !== "right",
      canvasContextEligible:
        source === "right" &&
        hitObjectId === null &&
        !isTransformerTarget(event.target),
      captureElement,
      pointerId: event.evt.pointerId,
      source,
      startPoint: clientPoint(event.evt),
      startViewport: viewport,
      latestViewport: viewport,
    };
    setIsPanning(true);
  };

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (
      event.evt.button !== 0 ||
      selectionModeKey === null ||
      !isTransformerTarget(event.target)
    ) {
      return;
    }
    const stage = event.target.getStage();
    if (stage === null) return;
    const captureElement = stage.container();
    const screenPoint = elementPoint(event.evt, captureElement);
    const objectId = objectIdBelowTransformer(stage, screenPoint);
    if (objectId === null) return;
    const point = screenToWorld(screenPoint, previewViewport);
    const pointerId = -1;
    selectionPointerCallbacksRef.current.start({
      additive: event.evt.shiftKey,
      areaOperation: event.evt.shiftKey ? "add" : "replace",
      objectId,
      point,
      pointerId,
      pressure: 0,
    });
    selectionPointerCallbacksRef.current.finish({
      point,
      pointerId,
      pressure: 0,
    });
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

  const cursor =
    isPanning || isTransforming
      ? "grabbing"
      : laserActive
        ? "none"
        : panMode || spacePressed
          ? "grab"
          : selectionModeKey === "selection.lasso"
            ? "crosshair"
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
      onPointerDownCapture={handleSelectionBackgroundPointerDownCapture}
      className="board-stage"
      data-coordinate-plot-editing={
        coordinatePlotInteraction?.activeObjectId !== null &&
        coordinatePlotInteraction?.activeObjectId !== undefined
      }
      data-drawing={isDrawing}
      data-lasso-points={selectionLasso?.length ?? 0}
      data-lassoing={selectionLasso !== null}
      data-laser-active={laserActive}
      data-laser-trail-opacity={laserTrailOpacity.toFixed(2)}
      data-laser-trail-points={laserTrailPoints.length}
      data-laser-visible={laserPoint !== null}
      data-panning={isPanning}
      data-selecting={isSelecting}
      data-transformable-count={transformableObjectIds.length}
      data-transforming={isTransforming}
      data-testid="board-stage"
      role="application"
      style={{ cursor }}
      tabIndex={0}
    >
      <Stage
        ref={stageRef}
        height={size.height}
        onClick={handleClick}
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
                    coordinatePlotInteraction,
                    interactive: true,
                    zoom: previewViewport.zoom,
                    previewDelta: selected.has(item.object.id)
                      ? selectionPreviewDelta
                      : null,
                  }),
                )}
              </Group>
            ))}
            {previewItems.map((item) =>
              renderItem(item, registry, {
                interactive: false,
                zoom: previewViewport.zoom,
              }),
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
            {selectionBounds
              .filter(({ id }) => !transformableObjectIds.includes(id))
              .map(({ id, rect }) => (
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
            {smoothedSelectionLasso === null ||
            smoothedSelectionLasso.length < 2 ? null : (
              <>
                <Line
                  closed={smoothedSelectionLasso.length > 2}
                  lineCap="round"
                  lineJoin="round"
                  perfectDrawEnabled
                  points={[...flattenStrokePoints(smoothedSelectionLasso)]}
                  stroke="rgba(44, 113, 130, 0.2)"
                  strokeWidth={6 / previewViewport.zoom}
                />
                <Line
                  closed={smoothedSelectionLasso.length > 2}
                  fill="rgba(44, 113, 130, 0.07)"
                  lineCap="round"
                  lineJoin="round"
                  perfectDrawEnabled
                  points={[...flattenStrokePoints(smoothedSelectionLasso)]}
                  stroke="#2c7182"
                  strokeWidth={2 / previewViewport.zoom}
                />
              </>
            )}
            {remoteCursors.map(({ actorId, point }) => (
              <Group key={actorId} x={point.x} y={point.y}>
                <Circle
                  fill="#7c3aed"
                  radius={6 / previewViewport.zoom}
                  stroke="#ffffff"
                  strokeWidth={2 / previewViewport.zoom}
                />
                <Text
                  fill="#5b21b6"
                  fontSize={12 / previewViewport.zoom}
                  listening={false}
                  text={actorId}
                  x={10 / previewViewport.zoom}
                  y={-18 / previewViewport.zoom}
                />
              </Group>
            ))}
            {laserTrailPoints.slice(1).map((point, index) => {
              const previous = laserTrailPoints[index];
              if (previous === undefined) return null;
              const progress = (index + 1) / (laserTrailPoints.length - 1);
              return (
                <Line
                  key={`laser-trail-${index}`}
                  lineCap="round"
                  lineJoin="round"
                  opacity={
                    laserTrailOpacity * (0.16 + Math.pow(progress, 1.6) * 0.84)
                  }
                  perfectDrawEnabled={false}
                  points={[previous.x, previous.y, point.x, point.y]}
                  shadowBlur={(3 + progress * 7) / previewViewport.zoom}
                  shadowColor="#ef4444"
                  shadowOpacity={0.72}
                  stroke="#ef4444"
                  strokeWidth={(3 + progress * 4) / previewViewport.zoom}
                />
              );
            })}
            {laserPoint === null ? null : (
              <Group x={laserPoint.x} y={laserPoint.y}>
                <Circle
                  fill="rgba(239, 68, 68, 0.22)"
                  radius={15 / previewViewport.zoom}
                />
                <Circle
                  fill="#ef4444"
                  radius={5 / previewViewport.zoom}
                  shadowBlur={12 / previewViewport.zoom}
                  shadowColor="#ef4444"
                  shadowOpacity={0.9}
                  stroke="#ffffff"
                  strokeWidth={1.5 / previewViewport.zoom}
                />
              </Group>
            )}
          </Group>
        </Layer>
        <Layer>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            <Transformer
              ref={transformerRef}
              anchorFill="#ffffff"
              anchorSize={9 / previewViewport.zoom}
              anchorStroke="#2c7182"
              anchorStrokeWidth={1.5 / previewViewport.zoom}
              borderStroke="#2c7182"
              borderStrokeWidth={1.5 / previewViewport.zoom}
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < 8 / previewViewport.zoom ||
                Math.abs(newBox.height) < 8 / previewViewport.zoom
                  ? oldBox
                  : newBox
              }
              enabledAnchors={[
                "top-left",
                "top-center",
                "top-right",
                "middle-left",
                "middle-right",
                "bottom-left",
                "bottom-center",
                "bottom-right",
              ]}
              flipEnabled={false}
              onTransformEnd={finishTransform}
              onTransformStart={() => setIsTransforming(true)}
              rotateAnchorOffset={26 / previewViewport.zoom}
              rotationSnapTolerance={5}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
