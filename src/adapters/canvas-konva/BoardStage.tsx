import Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
  createLineEndpointRotationTransform,
  lineWorldEndpoints,
  panViewport,
  screenToWorld,
  selectVisibleBoardItems,
  zoomViewportAt,
  type BoardObjectId,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type LineEndpoint,
  type Vec2,
  type ViewportState,
} from "../../core/public";
import type { InputModifiers } from "../../shared/input-modifiers";
import {
  buildSmoothClosedStrokePoints,
  flattenStrokePoints,
} from "../../shared/stroke-smoothing";
import { AnimatedImageRedrawCoordinator } from "./animated-image-redraw";
import { AnimatedImageRedrawContext } from "./animated-image-redraw-context";
import { BoardRenderItemView, BoardSceneContent } from "./board-scene-content";
import { BoardGrid } from "./grid";
import { clientPoint, elementPoint } from "./pointer";
import { rasterDecodeCache } from "./raster-decode-cache";
import {
  rasterImageDiagnostics,
  type RasterImageDiagnosticsSnapshot,
} from "./raster-image-diagnostics";
import {
  collectCoalescedPointerEvents,
  collectPredictedPointerEvents,
  pointerEventInputTimestampMs,
} from "./pointer-samples";
import {
  createKonvaWetInkSurface,
  WetInkRenderer,
  type WetInkFrameReport,
  type WetInkSample,
  type WetInkStyle,
} from "./wet-ink-renderer";
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
const canvasPrimaryClickDelayMs = 500;
const selectionHitTolerancePx = 12;
const lineEndpointDragThresholdPx = 2;
const wetInkDiagnosticPublishIntervalMs = 500;
const penDotCursor =
  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%229%22 height=%229%22 viewBox=%220 0 9 9%22%3E%3Ccircle cx=%224.5%22 cy=%224.5%22 r=%222.25%22 fill=%22%23245d6b%22 stroke=%22%23ffffff%22 stroke-width=%221%22/%3E%3C/svg%3E") 4 4, crosshair';

type PanSource = "hand" | "middle" | "right" | "space";

interface PanSession {
  activated: boolean;
  readonly canvasContextEligible: boolean;
  readonly contextObjectId: BoardObjectId | null;
  readonly captureElement: HTMLElement;
  readonly pointerId: number;
  readonly source: PanSource;
  readonly startPoint: Vec2;
  readonly startViewport: ViewportState;
  latestViewport: ViewportState;
}

interface PrimaryCanvasPointerCandidate {
  readonly pointerId: number;
  readonly startPoint: Vec2;
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

interface LineEndpointSession extends SelectionSession {
  readonly endpoint: LineEndpoint;
  readonly item: BoardRenderItem;
  readonly startClientPoint: Vec2;
}

export interface WorldPointerSample {
  readonly inputTimestampMs?: number;
  readonly modifiers?: InputModifiers;
  readonly point: Vec2;
  readonly pointerId: number;
  readonly pressure: number;
}

export interface WorldModifierSample {
  readonly modifiers: InputModifiers;
  readonly pointerId: number;
}

type TimedWorldPointerSample = Omit<WorldPointerSample, "inputTimestampMs"> &
  WetInkSample;

export type BoardSelectionAreaOperation = "add" | "replace" | "subtract";

export interface SelectionPointerStartSample extends WorldPointerSample {
  readonly additive: boolean;
  readonly areaOnly?: boolean;
  readonly areaOperation?: BoardSelectionAreaOperation;
  readonly hitToleranceWorld?: number;
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
  readonly objectId: BoardObjectId | null;
  readonly worldPoint: Vec2;
}

export interface BoardStageProps {
  readonly coordinatePlotInteraction?:
    CoordinatePlotRenderInteraction | undefined;
  readonly drawingModeKey: string | null;
  readonly drawingConstraintFeedback?: {
    readonly anchor: Vec2;
    readonly label: string;
    readonly point: Vec2;
  } | null;
  readonly eraserPoint?: Vec2 | null;
  readonly eraserRadiusPx?: number;
  readonly laserActive?: boolean;
  readonly laserPoint?: Vec2 | null;
  readonly laserTrailOpacity?: number;
  readonly laserTrailPoints?: readonly Vec2[];
  readonly lineEndpointObjectIds?: readonly BoardObjectId[];
  readonly onCanvasContextMenuRequest?:
    ((request: CanvasContextMenuRequest) => void) | undefined;
  readonly onCanvasPrimaryClickRequest?: (() => void) | undefined;
  readonly onCanvasPrimaryDoubleClickRequest?: (() => void) | undefined;
  readonly onObjectProximityHitRequest?:
    ((point: Vec2, toleranceWorld: number) => BoardObjectId | null) | undefined;
  readonly onObjectSettingsRequest?:
    ((objectId: BoardObjectId) => void) | undefined;
  readonly onLineEndpointTransform?:
    | ((
        transform: BoardObjectTransformSnapshot,
        baseline: BoardRenderItem,
      ) => void)
    | undefined;
  readonly onLineEndpointTransformPreview?:
    ((transform: BoardObjectTransformSnapshot | null) => void) | undefined;
  readonly onPanModeRequest?: () => void;
  readonly onWorldPointerCancel: (pointerId: number) => void;
  readonly onWorldPointerFinish: (sample: WorldPointerSample) => void;
  readonly onWorldPointerMove: (sample: WorldPointerSample) => void;
  readonly onWorldModifiersChange?:
    ((sample: WorldModifierSample) => void) | undefined;
  readonly onWorldPointerBatch?:
    ((samples: readonly WorldPointerSample[]) => void) | undefined;
  readonly onWorldPointerHover?: (point: Vec2) => void;
  readonly onWorldPointerStart: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerCancel: (pointerId: number) => void;
  readonly onSelectionPointerFinish: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerMove: (sample: WorldPointerSample) => void;
  readonly onSelectionPointerStart: (
    sample: SelectionPointerStartSample,
  ) => boolean | void;
  readonly onSelectionTransform?: (
    transforms: readonly BoardObjectTransformSnapshot[],
  ) => void;
  readonly onSelectionTransformPreview?: (
    transforms: readonly BoardObjectTransformSnapshot[] | null,
  ) => void;
  readonly panMode: boolean;
  readonly primaryCanvasGesturesEnabled?: boolean;
  readonly previewItems?: readonly BoardRenderItem[];
  readonly registry: KonvaRendererRegistry;
  readonly remoteCursors?: readonly {
    readonly actorId: string;
    readonly point: Vec2;
  }[];
  readonly remoteInkPreviews?: readonly {
    readonly actorId: string;
    readonly clientId: string;
    readonly displayName: string;
    readonly points: readonly Vec2[];
    readonly previewId: string;
    readonly style: {
      readonly opacity: number;
      readonly stroke: string;
      readonly strokeWidth: number;
    };
  }[];
  readonly scene: BoardSceneReadModel;
  readonly selectedObjectIds?: readonly BoardObjectId[];
  readonly selectionBounds?: readonly BoardSelectionBounds[];
  readonly selectionLasso?: readonly Vec2[] | null;
  readonly selectionMarquee?: BoardSelectionRect | null;
  readonly selectionModeKey: string | null;
  readonly selectionPreviewDelta?: Vec2 | null;
  readonly transformableObjectIds?: readonly BoardObjectId[];
  readonly wetInkStyle?: WetInkStyle | null;
  readonly onViewportCommit: (viewport: ViewportState) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function readInputModifiers(event: {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): InputModifiers {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  };
}

function sameViewport(left: ViewportState, right: ViewportState): boolean {
  return (
    left.zoom === right.zoom &&
    left.offset.x === right.offset.x &&
    left.offset.y === right.offset.y
  );
}

function publishWetInkDiagnostics(
  root: HTMLDivElement,
  report: WetInkFrameReport,
): void {
  const publishCount = Number(root.dataset.wetInkDiagnosticPublishCount ?? 0);
  root.dataset.wetInkDiagnosticPublishCount = String(publishCount + 1);
  root.dataset.wetInkActualBatchPoints = String(report.actualBatchPointCount);
  root.dataset.wetInkActualPoints = String(report.actualPointCount);
  root.dataset.wetInkFrameCount = String(report.frameCount);
  root.dataset.wetInkFrameGapMs = report.frameGapMs.toFixed(2);
  root.dataset.wetInkGeneratedSamples = String(
    report.generatedActualSampleCount,
  );
  root.dataset.wetInkLatencyCount = String(report.latency.count);
  root.dataset.wetInkLatencyLastMs = report.latency.lastMs.toFixed(2);
  root.dataset.wetInkLatencyMeanMs = report.latency.meanMs.toFixed(2);
  root.dataset.wetInkLatencyP95Ms = report.latency.p95Ms.toFixed(2);
  root.dataset.wetInkMaxFrameGapMs = report.maxFrameGapMs.toFixed(2);
  root.dataset.wetInkMutableTailPoints = String(report.mutableTailPointCount);
  root.dataset.wetInkPendingInputCount = String(report.pendingInputCount);
  root.dataset.wetInkPredictedPoints = String(report.predictedPointCount);
  root.dataset.wetInkSealedChunks = String(report.sealedChunkCount);
}

function publishRasterImageDiagnostics(
  root: HTMLDivElement,
  snapshot: RasterImageDiagnosticsSnapshot,
): void {
  root.dataset.rasterActiveDecodedCount = String(snapshot.activeDecodedCount);
  root.dataset.rasterActiveEstimatedDecodedBytes = String(
    snapshot.activeEstimatedDecodedBytes,
  );
  root.dataset.rasterDecodeCompletedCount = String(
    snapshot.decodeCompletedCount,
  );
  root.dataset.rasterDecodeFailedCount = String(snapshot.decodeFailedCount);
  root.dataset.rasterDecodeStartedCount = String(snapshot.decodeStartedCount);
  root.dataset.rasterDuplicateDecodeStartCount = String(
    snapshot.duplicateDecodeStartCount,
  );
  root.dataset.rasterLastDecodeMs = snapshot.lastDecodeMs.toFixed(2);
  root.dataset.rasterMaxDecodeMs = snapshot.maxDecodeMs.toFixed(2);
  root.dataset.rasterPeakActiveDecodedCount = String(
    snapshot.peakActiveDecodedCount,
  );
  root.dataset.rasterPeakEstimatedDecodedBytes = String(
    snapshot.peakEstimatedDecodedBytes,
  );
  root.dataset.rasterReleasedCount = String(snapshot.releasedCount);
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

function isLineEndpointHandleTarget(target: Konva.Node): boolean {
  let current: Konva.Node | null = target;
  while (current !== null) {
    if (current.hasName("line-endpoint-handle")) return true;
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

function applyObjectTransformPreview(
  item: BoardRenderItem,
  preview: BoardObjectTransformSnapshot | null,
): BoardRenderItem {
  if (preview === null || preview.objectId !== item.object.id) return item;
  return {
    ...item,
    object: {
      ...item.object,
      position: preview.position,
      rotation: preview.rotation,
      scale: preview.scale,
    },
  };
}

export function BoardStage({
  coordinatePlotInteraction,
  drawingModeKey,
  drawingConstraintFeedback = null,
  eraserPoint = null,
  eraserRadiusPx = 12,
  laserActive = false,
  laserPoint = null,
  laserTrailOpacity = 1,
  laserTrailPoints = [],
  lineEndpointObjectIds = [],
  onCanvasContextMenuRequest,
  onCanvasPrimaryClickRequest,
  onCanvasPrimaryDoubleClickRequest,
  onObjectProximityHitRequest,
  onObjectSettingsRequest,
  onLineEndpointTransform,
  onLineEndpointTransformPreview,
  onPanModeRequest,
  onViewportCommit,
  onWorldPointerCancel,
  onWorldPointerFinish,
  onWorldPointerMove,
  onWorldModifiersChange,
  onWorldPointerBatch,
  onWorldPointerHover,
  onWorldPointerStart,
  onSelectionPointerCancel,
  onSelectionPointerFinish,
  onSelectionPointerMove,
  onSelectionPointerStart,
  onSelectionTransform,
  onSelectionTransformPreview,
  panMode,
  primaryCanvasGesturesEnabled = false,
  previewItems = [],
  registry,
  remoteCursors = [],
  remoteInkPreviews = [],
  scene,
  selectedObjectIds = [],
  selectionBounds = [],
  selectionLasso = null,
  selectionMarquee = null,
  selectionModeKey,
  selectionPreviewDelta = null,
  transformableObjectIds = [],
  wetInkStyle = null,
}: BoardStageProps) {
  const [animatedImageRedraw] = useState(
    () => new AnimatedImageRedrawCoordinator(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const wetInkLayerRef = useRef<Konva.Layer>(null);
  const wetInkRendererRef = useRef<WetInkRenderer | null>(null);
  const latestWetInkFrameReportRef = useRef<WetInkFrameReport | null>(null);
  const lastWetInkDiagnosticPublishAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pendingWorldPointerMovesRef = useRef<WorldPointerSample[]>([]);
  const worldPointerBacklogPeakRef = useRef(0);
  const worldPointerMoveFrameRef = useRef<number | null>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const drawingSessionRef = useRef<DrawingSession | null>(null);
  const selectionSessionRef = useRef<SelectionSession | null>(null);
  const lineEndpointSessionRef = useRef<LineEndpointSession | null>(null);
  const lineEndpointPreviewRef = useRef<BoardObjectTransformSnapshot | null>(
    null,
  );
  const wheelSessionRef = useRef<WheelSession | null>(null);
  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);
  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);
  const primaryCanvasPointerCandidateRef =
    useRef<PrimaryCanvasPointerCandidate | null>(null);
  const primaryCanvasClickCandidateRef = useRef<{
    readonly point: Vec2;
    readonly timestamp: number;
  } | null>(null);
  const rightContextMenuTimeoutRef = useRef<number | null>(null);
  const canvasContextMenuRequestRef = useRef(onCanvasContextMenuRequest);
  const lineEndpointCallbacksRef = useRef({
    commit: onLineEndpointTransform,
    preview: onLineEndpointTransformPreview,
  });
  const panModeRequestRef = useRef(onPanModeRequest);
  const worldPointerCallbacksRef = useRef({
    batch: onWorldPointerBatch,
    cancel: onWorldPointerCancel,
    modifiers: onWorldModifiersChange,
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
  const [lineEndpointPreview, setLineEndpointPreview] =
    useState<BoardObjectTransformSnapshot | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const size = useElementSize(rootRef);
  const hasStaticRaster = useMemo(
    () =>
      scene.items.some(
        ({ object }) =>
          (object.kind === "image.embedded" || object.kind === "media.asset") &&
          (object.mimeType === "image/png" || object.mimeType === "image/jpeg"),
      ),
    [scene.items],
  );

  const embeddedRasterSources = useMemo(
    () =>
      new Set(
        scene.items.flatMap(({ object }) =>
          object.kind === "image.embedded" &&
          (object.mimeType === "image/png" || object.mimeType === "image/jpeg")
            ? [object.dataUrl]
            : [],
        ),
      ),
    [scene.items],
  );
  const previousEmbeddedRasterSources = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    for (const key of previousEmbeddedRasterSources.current) {
      if (!embeddedRasterSources.has(key)) {
        rasterDecodeCache.discardSourceWhenUnused(key);
      }
    }
    previousEmbeddedRasterSources.current = embeddedRasterSources;
  }, [embeddedRasterSources]);

  useEffect(
    () => () => {
      for (const key of previousEmbeddedRasterSources.current) {
        rasterDecodeCache.discardSourceWhenUnused(key);
      }
    },
    [],
  );

  useEffect(() => () => animatedImageRedraw.dispose(), [animatedImageRedraw]);

  useEffect(() => {
    if (!hasStaticRaster) rasterDecodeCache.trimUnused();
  }, [hasStaticRaster]);

  useEffect(
    () => () => {
      queueMicrotask(() => rasterDecodeCache.trimUnused());
    },
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    return rasterImageDiagnostics.subscribe((snapshot) => {
      publishRasterImageDiagnostics(root, snapshot);
    });
  }, []);

  useLayoutEffect(() => {
    const layer = wetInkLayerRef.current;
    const root = rootRef.current;
    if (layer === null || root === null) return;
    const renderer = new WetInkRenderer(createKonvaWetInkSurface(layer), {
      onClear: () => {
        const latest = latestWetInkFrameReportRef.current;
        if (latest !== null) publishWetInkDiagnostics(root, latest);
        root.dataset.wetInkActive = "false";
        root.dataset.wetInkActualPoints = "0";
        root.dataset.wetInkPredictedPoints = "0";
      },
      onFrame: (report) => {
        latestWetInkFrameReportRef.current = report;
        if (
          report.frameCount === 1 ||
          report.renderedAtMs - lastWetInkDiagnosticPublishAtRef.current >=
            wetInkDiagnosticPublishIntervalMs
        ) {
          publishWetInkDiagnostics(root, report);
          lastWetInkDiagnosticPublishAtRef.current = report.renderedAtMs;
        }
      },
    });
    wetInkRendererRef.current = renderer;
    root.dataset.wetInkActive = "false";
    root.dataset.wetInkDiagnosticPublishCount = "0";
    root.dataset.wetInkFrameCount = "0";
    root.dataset.wetInkFrameGapMs = "0";
    root.dataset.wetInkGeneratedSamples = "0";
    root.dataset.wetInkLatencyCount = "0";
    root.dataset.wetInkLayer = "ready";
    root.dataset.wetInkMaxFrameGapMs = "0";
    root.dataset.wetInkMutableTailPoints = "0";
    root.dataset.wetInkPendingInputCount = "0";
    root.dataset.wetInkSealedChunks = "0";
    return () => {
      renderer.destroy();
      if (wetInkRendererRef.current === renderer) {
        wetInkRendererRef.current = null;
      }
      latestWetInkFrameReportRef.current = null;
      lastWetInkDiagnosticPublishAtRef.current = Number.NEGATIVE_INFINITY;
      root.dataset.wetInkActive = "false";
      root.dataset.wetInkLayer = "destroyed";
    };
  }, []);

  useLayoutEffect(() => {
    wetInkRendererRef.current?.setViewport(previewViewport);
  }, [previewViewport]);

  const visibleItemBatches = useMemo(
    () =>
      batchBoardRenderItems(
        selectVisibleBoardItems(scene.items, previewViewport, size),
      ),
    [previewViewport, scene.items, size],
  );
  const lineEndpointItems = useMemo(() => {
    const allowed = new Set(lineEndpointObjectIds);
    return scene.items.filter(
      (item) =>
        allowed.has(item.object.id) && item.object.kind === "drawing.line",
    );
  }, [lineEndpointObjectIds, scene.items]);
  const lineEndpointHandles = useMemo(
    () =>
      lineEndpointItems.flatMap((item) => {
        const previewed = applyObjectTransformPreview(
          item,
          lineEndpointPreview,
        );
        const endpoints = lineWorldEndpoints(previewed);
        return endpoints === null
          ? []
          : [
              { endpoint: "start" as const, item, point: endpoints.start },
              { endpoint: "end" as const, item, point: endpoints.end },
            ];
      }),
    [lineEndpointItems, lineEndpointPreview],
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
  }, [
    lineEndpointPreview,
    previewViewport,
    scene.items,
    transformableObjectIds,
  ]);

  const readSelectionTransforms = useCallback(() => {
    const transformer = transformerRef.current;
    if (transformer === null) {
      return [];
    }
    return transformer.nodes().flatMap((node) => {
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
  }, []);

  const previewTransform = useCallback(() => {
    const transforms = readSelectionTransforms();
    onSelectionTransformPreview?.(transforms.length === 0 ? null : transforms);
  }, [onSelectionTransformPreview, readSelectionTransforms]);

  const finishTransform = useCallback(() => {
    setIsTransforming(false);
    const transforms = readSelectionTransforms();
    if (transforms.length > 0) {
      onSelectionTransform?.(transforms);
    }
  }, [onSelectionTransform, readSelectionTransforms]);

  useLayoutEffect(() => {
    panModeRequestRef.current = onPanModeRequest;
  }, [onPanModeRequest]);

  useLayoutEffect(() => {
    canvasContextMenuRequestRef.current = onCanvasContextMenuRequest;
  }, [onCanvasContextMenuRequest]);

  useLayoutEffect(() => {
    lineEndpointCallbacksRef.current = {
      commit: onLineEndpointTransform,
      preview: onLineEndpointTransformPreview,
    };
  }, [onLineEndpointTransform, onLineEndpointTransformPreview]);

  useLayoutEffect(() => {
    worldPointerCallbacksRef.current = {
      batch: onWorldPointerBatch,
      cancel: onWorldPointerCancel,
      modifiers: onWorldModifiersChange,
      finish: onWorldPointerFinish,
      move: onWorldPointerMove,
      start: onWorldPointerStart,
    };
  }, [
    onWorldPointerBatch,
    onWorldPointerCancel,
    onWorldPointerFinish,
    onWorldModifiersChange,
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
      selectionSessionRef.current === null &&
      lineEndpointSessionRef.current === null
    ) {
      const wheelSession = wheelSessionRef.current;
      if (wheelSession !== null) {
        window.clearTimeout(wheelSession.timeoutId);
        wheelSessionRef.current = null;
        animatedImageRedraw.setInteractionActive(false);
      }
      setPreviewViewport(scene.viewport);
    }
  }, [animatedImageRedraw, scene.viewport]);

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
    (
      event: PointerEvent,
      session: DrawingSession,
    ): TimedWorldPointerSample => ({
      inputTimestampMs: pointerEventInputTimestampMs(event),
      modifiers: readInputModifiers(event),
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
    ): readonly TimedWorldPointerSample[] =>
      collectCoalescedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const predictedWorldSamples = useCallback(
    (
      event: PointerEvent,
      session: DrawingSession,
    ): readonly TimedWorldPointerSample[] =>
      collectPredictedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const discardWorldPointerMoves = useCallback(() => {
    if (worldPointerMoveFrameRef.current !== null) {
      cancelAnimationFrame(worldPointerMoveFrameRef.current);
      worldPointerMoveFrameRef.current = null;
    }
    pendingWorldPointerMovesRef.current = [];
    if (rootRef.current !== null) {
      rootRef.current.dataset.pointerBacklog = "0";
    }
  }, []);

  const flushWorldPointerMoves = useCallback(() => {
    if (worldPointerMoveFrameRef.current !== null) {
      cancelAnimationFrame(worldPointerMoveFrameRef.current);
      worldPointerMoveFrameRef.current = null;
    }
    const samples = pendingWorldPointerMovesRef.current;
    pendingWorldPointerMovesRef.current = [];
    const root = rootRef.current;
    if (root !== null) {
      root.dataset.pointerBacklog = "0";
      if (samples.length > 0) {
        root.dataset.pointerLastBatchSize = String(samples.length);
      }
    }
    if (samples.length === 0) return;
    const batch = worldPointerCallbacksRef.current.batch;
    if (batch !== undefined) {
      batch(samples);
      return;
    }
    for (const sample of samples) {
      worldPointerCallbacksRef.current.move(sample);
    }
  }, []);

  const enqueueWorldPointerMoves = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      if (samples.length === 0) return;
      pendingWorldPointerMovesRef.current.push(...samples);
      const backlog = pendingWorldPointerMovesRef.current.length;
      worldPointerBacklogPeakRef.current = Math.max(
        worldPointerBacklogPeakRef.current,
        backlog,
      );
      const root = rootRef.current;
      if (root !== null) {
        root.dataset.pointerBacklog = String(backlog);
        root.dataset.pointerBacklogPeak = String(
          worldPointerBacklogPeakRef.current,
        );
      }
      if (worldPointerMoveFrameRef.current !== null) return;
      worldPointerMoveFrameRef.current = requestAnimationFrame(() => {
        flushWorldPointerMoves();
      });
    },
    [flushWorldPointerMoves],
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
      areaOnly = false,
    ) => {
      captureElement.setPointerCapture(event.pointerId);
      const session: SelectionSession = {
        captureElement,
        pointerId: event.pointerId,
        viewport: previewViewport,
      };
      selectionSessionRef.current = session;
      setIsSelecting(true);
      const consumed = selectionPointerCallbacksRef.current.start({
        ...selectionWorldSample(event, session),
        additive: event.shiftKey,
        areaOnly,
        areaOperation: event.altKey
          ? "subtract"
          : event.shiftKey
            ? "add"
            : "replace",
        hitToleranceWorld: selectionHitTolerancePx / session.viewport.zoom,
        objectId,
      });
      if (consumed === true) {
        primaryCanvasPointerCandidateRef.current = null;
      }
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
      animatedImageRedraw.setInteractionActive(false);
      setIsDrawing(false);
      setPreviewViewport(viewportRef.current);

      if (commit && event !== undefined) {
        const samples = worldSamples(event, session);
        const finalSample = samples.at(-1);
        wetInkRendererRef.current?.finish(samples, []);
        if (finalSample !== undefined) {
          enqueueWorldPointerMoves(samples.slice(0, -1));
          flushWorldPointerMoves();
          worldPointerCallbacksRef.current.finish(finalSample);
        } else {
          flushWorldPointerMoves();
          worldPointerCallbacksRef.current.finish(worldSample(event, session));
        }
      } else {
        discardWorldPointerMoves();
        wetInkRendererRef.current?.cancel();
        worldPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [
      animatedImageRedraw,
      discardWorldPointerMoves,
      enqueueWorldPointerMoves,
      flushWorldPointerMoves,
      releaseCapture,
      worldSample,
      worldSamples,
    ],
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
      animatedImageRedraw.setInteractionActive(false);
      setPreviewViewport(viewportRef.current);
    }
  }, [animatedImageRedraw]);

  const commitWheel = useCallback(() => {
    const session = wheelSessionRef.current;
    if (session !== null) {
      window.clearTimeout(session.timeoutId);
      wheelSessionRef.current = null;
      animatedImageRedraw.setInteractionActive(false);
      setPreviewViewport(session.latestViewport);
      onViewportCommit(session.latestViewport);
    }
  }, [animatedImageRedraw, onViewportCommit]);

  const finishLineEndpointTransform = useCallback(
    (commit: boolean) => {
      const session = lineEndpointSessionRef.current;
      if (session === null) return;
      lineEndpointSessionRef.current = null;
      releaseCapture(session);
      const preview = lineEndpointPreviewRef.current;
      lineEndpointPreviewRef.current = null;
      setLineEndpointPreview(null);
      setIsTransforming(false);
      lineEndpointCallbacksRef.current.preview?.(null);
      if (commit && preview !== null) {
        lineEndpointCallbacksRef.current.commit?.(preview, session.item);
      }
    },
    [releaseCapture],
  );

  const updateLineEndpointTransform = useCallback(
    (event: PointerEvent) => {
      const session = lineEndpointSessionRef.current;
      if (session === null || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      const currentClientPoint = clientPoint(event);
      const movedPx = Math.hypot(
        currentClientPoint.x - session.startClientPoint.x,
        currentClientPoint.y - session.startClientPoint.y,
      );
      if (movedPx < lineEndpointDragThresholdPx) {
        if (lineEndpointPreviewRef.current !== null) {
          lineEndpointPreviewRef.current = null;
          setLineEndpointPreview(null);
          lineEndpointCallbacksRef.current.preview?.(null);
        }
        return;
      }
      const point = selectionWorldSample(event, session).point;
      const transform = createLineEndpointRotationTransform(
        session.item,
        session.endpoint,
        point,
      );
      if (transform === null) return;
      lineEndpointPreviewRef.current = transform;
      setLineEndpointPreview(transform);
      lineEndpointCallbacksRef.current.preview?.(transform);
    },
    [selectionWorldSample],
  );

  const beginLineEndpointTransform = useCallback(
    (
      event: Konva.KonvaEventObject<PointerEvent>,
      item: BoardRenderItem,
      endpoint: LineEndpoint,
    ) => {
      if (event.evt.button !== 0 || lineEndpointSessionRef.current !== null) {
        return;
      }
      const stage = event.target.getStage();
      if (stage === null) return;
      commitWheel();
      event.cancelBubble = true;
      event.evt.preventDefault();
      const captureElement = stage.container();
      captureElement.setPointerCapture(event.evt.pointerId);
      lineEndpointPreviewRef.current = null;
      setLineEndpointPreview(null);
      lineEndpointSessionRef.current = {
        captureElement,
        endpoint,
        item,
        pointerId: event.evt.pointerId,
        startClientPoint: clientPoint(event.evt),
        viewport: previewViewport,
      };
      setIsTransforming(true);
    },
    [commitWheel, previewViewport],
  );

  const clearPendingPrimaryCanvasTap = useCallback(() => {
    primaryCanvasClickCandidateRef.current = null;
    if (primaryCanvasClickTimeoutRef.current !== null) {
      window.clearTimeout(primaryCanvasClickTimeoutRef.current);
      primaryCanvasClickTimeoutRef.current = null;
    }
  }, []);

  const registerPrimaryCanvasTap = useCallback(
    (event: PointerEvent) => {
      const point = clientPoint(event);
      const previous = primaryCanvasClickCandidateRef.current;
      const elapsed =
        previous === null
          ? Number.POSITIVE_INFINITY
          : event.timeStamp - previous.timestamp;
      const withinDistance =
        previous !== null &&
        Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <=
          rightDoubleClickDistancePx;

      if (
        previous !== null &&
        elapsed >= 0 &&
        elapsed <= canvasPrimaryClickDelayMs &&
        withinDistance
      ) {
        clearPendingPrimaryCanvasTap();
        onCanvasPrimaryDoubleClickRequest?.();
        return;
      }

      clearPendingPrimaryCanvasTap();
      primaryCanvasClickCandidateRef.current = {
        point,
        timestamp: event.timeStamp,
      };
      primaryCanvasClickTimeoutRef.current = window.setTimeout(() => {
        primaryCanvasClickTimeoutRef.current = null;
        primaryCanvasClickCandidateRef.current = null;
        onCanvasPrimaryClickRequest?.();
      }, canvasPrimaryClickDelayMs);
    },
    [
      clearPendingPrimaryCanvasTap,
      onCanvasPrimaryClickRequest,
      onCanvasPrimaryDoubleClickRequest,
    ],
  );

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
      const primaryCanvasPointerCandidate =
        primaryCanvasPointerCandidateRef.current;
      if (
        primaryCanvasPointerCandidate !== null &&
        primaryCanvasPointerCandidate.pointerId === event.pointerId &&
        Math.hypot(
          event.clientX - primaryCanvasPointerCandidate.startPoint.x,
          event.clientY - primaryCanvasPointerCandidate.startPoint.y,
        ) > rightDoubleClickDistancePx
      ) {
        primaryCanvasPointerCandidateRef.current = null;
        clearPendingPrimaryCanvasTap();
      }

      const lineEndpointSession = lineEndpointSessionRef.current;
      if (
        lineEndpointSession !== null &&
        lineEndpointSession.pointerId === event.pointerId
      ) {
        updateLineEndpointTransform(event);
        return;
      }

      const drawingSession = drawingSessionRef.current;
      if (
        drawingSession !== null &&
        drawingSession.pointerId === event.pointerId
      ) {
        event.preventDefault();
        const samples = worldSamples(event, drawingSession);
        wetInkRendererRef.current?.append(
          samples,
          predictedWorldSamples(event, drawingSession),
        );
        enqueueWorldPointerMoves(samples);
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
      const primaryCanvasPointerCandidate =
        primaryCanvasPointerCandidateRef.current;
      if (
        primaryCanvasPointerCandidate !== null &&
        primaryCanvasPointerCandidate.pointerId === event.pointerId
      ) {
        primaryCanvasPointerCandidateRef.current = null;
        const stationary =
          Math.hypot(
            event.clientX - primaryCanvasPointerCandidate.startPoint.x,
            event.clientY - primaryCanvasPointerCandidate.startPoint.y,
          ) <= rightDoubleClickDistancePx;
        if (stationary) {
          event.preventDefault();
          if (drawingSessionRef.current?.pointerId === event.pointerId) {
            clearPendingPrimaryCanvasTap();
            finishDrawing(true, event);
            return;
          }
          if (selectionSessionRef.current?.pointerId === event.pointerId) {
            finishSelection(false);
          } else if (panSessionRef.current?.pointerId === event.pointerId) {
            finishPan(false);
          }
          registerPrimaryCanvasTap(event);
          return;
        }
      }
      if (lineEndpointSessionRef.current?.pointerId === event.pointerId) {
        updateLineEndpointTransform(event);
        finishLineEndpointTransform(true);
        return;
      }
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
          const request: CanvasContextMenuRequest = {
            clientPoint: clientPoint(event),
            objectId: session.contextObjectId,
            worldPoint: screenToWorld(
              elementPoint(event, session.captureElement),
              session.startViewport,
            ),
          };
          if (session.contextObjectId === null) {
            canvasContextMenuRequestRef.current?.(request);
          } else {
            if (rightContextMenuTimeoutRef.current !== null) {
              window.clearTimeout(rightContextMenuTimeoutRef.current);
            }
            rightContextMenuTimeoutRef.current = window.setTimeout(() => {
              rightContextMenuTimeoutRef.current = null;
              canvasContextMenuRequestRef.current?.(request);
            }, rightDoubleClickDelayMs);
          }
        }
        finishPan(true);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (
        primaryCanvasPointerCandidateRef.current?.pointerId === event.pointerId
      ) {
        primaryCanvasPointerCandidateRef.current = null;
      }
      if (lineEndpointSessionRef.current?.pointerId === event.pointerId) {
        finishLineEndpointTransform(false);
        return;
      }
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
      const drawingSession = drawingSessionRef.current;
      if (
        drawingSession !== null &&
        ["Alt", "Control", "Meta", "Shift"].includes(event.key)
      ) {
        worldPointerCallbacksRef.current.modifiers?.({
          modifiers: readInputModifiers(event),
          pointerId: drawingSession.pointerId,
        });
      }
      if (event.code === "Escape") {
        finishLineEndpointTransform(false);
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
      const drawingSession = drawingSessionRef.current;
      if (
        drawingSession !== null &&
        ["Alt", "Control", "Meta", "Shift"].includes(event.key)
      ) {
        worldPointerCallbacksRef.current.modifiers?.({
          modifiers: readInputModifiers(event),
          pointerId: drawingSession.pointerId,
        });
      }
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
      primaryCanvasPointerCandidateRef.current = null;
      if (primaryCanvasClickTimeoutRef.current !== null) {
        window.clearTimeout(primaryCanvasClickTimeoutRef.current);
        primaryCanvasClickTimeoutRef.current = null;
      }
      if (rightContextMenuTimeoutRef.current !== null) {
        window.clearTimeout(rightContextMenuTimeoutRef.current);
        rightContextMenuTimeoutRef.current = null;
      }
      finishLineEndpointTransform(false);
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
    enqueueWorldPointerMoves,
    finishDrawing,
    finishLineEndpointTransform,
    finishPan,
    finishSelection,
    clearPendingPrimaryCanvasTap,
    predictedWorldSamples,
    registerPrimaryCanvasTap,
    selectionWorldSample,
    updateLineEndpointTransform,
    worldSamples,
  ]);

  useEffect(() => {
    const container = stageRef.current?.container();
    if (container === undefined) {
      return;
    }

    const handleLostCapture = (event: PointerEvent) => {
      if (lineEndpointSessionRef.current?.pointerId === event.pointerId) {
        finishLineEndpointTransform(false);
      }
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
  }, [
    finishDrawing,
    finishLineEndpointTransform,
    finishPan,
    finishSelection,
    size.height,
    size.width,
  ]);

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
        animatedImageRedraw.setInteractionActive(false);
        worldPointerCallbacksRef.current.cancel(drawingSession.pointerId);
      }
      const selectionSession = selectionSessionRef.current;
      if (selectionSession !== null) {
        selectionSessionRef.current = null;
        releaseCapture(selectionSession);
        selectionPointerCallbacksRef.current.cancel(selectionSession.pointerId);
      }
      const lineEndpointSession = lineEndpointSessionRef.current;
      if (lineEndpointSession !== null) {
        lineEndpointSessionRef.current = null;
        releaseCapture(lineEndpointSession);
        lineEndpointPreviewRef.current = null;
        lineEndpointCallbacksRef.current.preview?.(null);
      }
      const wheelSession = wheelSessionRef.current;
      if (wheelSession !== null) {
        wheelSessionRef.current = null;
        window.clearTimeout(wheelSession.timeoutId);
        animatedImageRedraw.setInteractionActive(false);
      }
      discardWorldPointerMoves();
      rightClickCandidateRef.current = null;
      primaryCanvasPointerCandidateRef.current = null;
      if (primaryCanvasClickTimeoutRef.current !== null) {
        window.clearTimeout(primaryCanvasClickTimeoutRef.current);
        primaryCanvasClickTimeoutRef.current = null;
      }
      if (rightContextMenuTimeoutRef.current !== null) {
        window.clearTimeout(rightContextMenuTimeoutRef.current);
        rightContextMenuTimeoutRef.current = null;
      }
    },
    [animatedImageRedraw, discardWorldPointerMoves, releaseCapture],
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
    primaryCanvasPointerCandidateRef.current = null;
    clearPendingPrimaryCanvasTap();
  }, [clearPendingPrimaryCanvasTap, drawingModeKey, panMode, selectionModeKey]);

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

  useEffect(() => {
    const session = lineEndpointSessionRef.current;
    if (session !== null && !sameViewport(session.viewport, scene.viewport)) {
      finishLineEndpointTransform(false);
    }
  }, [finishLineEndpointTransform, scene.viewport]);

  const handleCanvasPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || !primaryCanvasGesturesEnabled) {
      primaryCanvasPointerCandidateRef.current = null;
      clearPendingPrimaryCanvasTap();
      return;
    }
    if (
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null ||
      lineEndpointSessionRef.current !== null
    ) {
      primaryCanvasPointerCandidateRef.current = null;
      clearPendingPrimaryCanvasTap();
      return;
    }

    const stage = stageRef.current;
    if (stage === null) {
      primaryCanvasPointerCandidateRef.current = null;
      clearPendingPrimaryCanvasTap();
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
      (isTransformerTarget(hit) ||
        isLineEndpointHandleTarget(hit) ||
        objectIdFromTarget(hit) !== null)
    ) {
      primaryCanvasPointerCandidateRef.current = null;
      clearPendingPrimaryCanvasTap();
      return;
    }

    primaryCanvasPointerCandidateRef.current = {
      pointerId: event.pointerId,
      startPoint: clientPoint(event.nativeEvent),
    };

    if (selectionModeKey === null) {
      return;
    }
    commitWheel();
    event.preventDefault();
    beginSelectionSession(
      event.nativeEvent,
      event.currentTarget,
      null,
      selectionModeKey === "selection.lasso" &&
        (event.shiftKey || event.altKey),
    );
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const isRightButton = event.evt.button === 2;
    if (isRightButton && rightContextMenuTimeoutRef.current !== null) {
      window.clearTimeout(rightContextMenuTimeoutRef.current);
      rightContextMenuTimeoutRef.current = null;
    }
    const isLassoAreaModifier =
      selectionModeKey === "selection.lasso" &&
      (event.evt.shiftKey || event.evt.altKey);
    if (
      !isRightButton &&
      (isTransformerTarget(event.target) ||
        isLineEndpointHandleTarget(event.target)) &&
      !isLassoAreaModifier
    ) {
      commitWheel();
      return;
    }
    if (
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null ||
      lineEndpointSessionRef.current !== null
    ) {
      return;
    }

    const hitTestStage = event.target.getStage();
    const directHitObjectId = isLassoAreaModifier
      ? null
      : isTransformerTarget(event.target) && hitTestStage !== null
        ? objectIdBelowTransformer(
            hitTestStage,
            elementPoint(event.evt, hitTestStage.container()),
          )
        : objectIdFromTarget(event.target);
    const proximityHitObjectId =
      isRightButton &&
      directHitObjectId === null &&
      hitTestStage !== null &&
      onObjectProximityHitRequest !== undefined
        ? onObjectProximityHitRequest(
            screenToWorld(
              elementPoint(event.evt, hitTestStage.container()),
              previewViewport,
            ),
            selectionHitTolerancePx / previewViewport.zoom,
          )
        : null;
    const hitObjectId = directHitObjectId ?? proximityHitObjectId;
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
        beginSelectionSession(
          event.evt,
          captureElement,
          hitObjectId,
          isLassoAreaModifier,
        );
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
      animatedImageRedraw.setInteractionActive(wetInkStyle !== null);
      setIsDrawing(true);
      worldPointerBacklogPeakRef.current = 0;
      if (rootRef.current !== null) {
        rootRef.current.dataset.pointerBacklog = "0";
        rootRef.current.dataset.pointerBacklogPeak = "0";
        rootRef.current.dataset.pointerLastBatchSize = "0";
      }
      const startSample = worldSample(event.evt, session);
      if (wetInkStyle !== null) {
        rootRef.current?.setAttribute("data-wet-ink-active", "true");
        wetInkRendererRef.current?.begin(
          startSample,
          wetInkStyle,
          session.viewport,
        );
      }
      worldPointerCallbacksRef.current.start(startSample);
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
    const contextObjectId = hitObjectId;
    panSessionRef.current = {
      activated: source !== "right",
      canvasContextEligible:
        source === "right" &&
        (hitObjectId === null || contextObjectId !== null),
      contextObjectId,
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
      selectionSessionRef.current !== null ||
      lineEndpointSessionRef.current !== null
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
      // Viewport updates already invalidate the committed Layer; avoid
      // competing with full-speed GIF redraws during this short gesture.
      animatedImageRedraw.setInteractionActive(true);
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

  const usesPenDotCursor =
    drawingModeKey === "drawing.pen" || drawingModeKey === "drawing.smart-ink";
  const cursorKind =
    isPanning || isTransforming
      ? "grabbing"
      : laserActive
        ? "hidden"
        : panMode || spacePressed
          ? "grab"
          : selectionModeKey === "selection.lasso"
            ? "crosshair"
            : selectionModeKey !== null
              ? "default"
              : usesPenDotCursor
                ? "pen-dot"
                : drawingModeKey === null
                  ? "default"
                  : "crosshair";
  const cursor =
    cursorKind === "pen-dot"
      ? penDotCursor
      : cursorKind === "hidden"
        ? "none"
        : cursorKind;

  return (
    <div
      ref={rootRef}
      aria-label="Бесконечное полотно TutorBoard"
      onPointerDownCapture={handleCanvasPointerDownCapture}
      className="board-stage"
      data-coordinate-plot-editing={
        coordinatePlotInteraction?.activeObjectId !== null &&
        coordinatePlotInteraction?.activeObjectId !== undefined
      }
      data-cursor-kind={cursorKind}
      data-drawing={isDrawing}
      data-drawing-constraint={drawingConstraintFeedback?.label ?? "none"}
      data-drawing-mode={drawingModeKey ?? "none"}
      data-eraser-visible={eraserPoint !== null}
      data-lasso-points={selectionLasso?.length ?? 0}
      data-lassoing={selectionLasso !== null}
      data-laser-active={laserActive}
      data-laser-trail-opacity={laserTrailOpacity.toFixed(2)}
      data-laser-trail-points={laserTrailPoints.length}
      data-laser-visible={laserPoint !== null}
      data-pan-mode={panMode}
      data-panning={isPanning}
      data-remote-ink-count={remoteInkPreviews.length}
      data-selecting={isSelecting}
      data-selection-mode={selectionModeKey ?? "none"}
      data-transformable-count={transformableObjectIds.length}
      data-transforming={isTransforming}
      data-wet-ink-stroke-style={wetInkStyle?.strokeStyle ?? "none"}
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
            <AnimatedImageRedrawContext value={animatedImageRedraw}>
              <BoardSceneContent
                batches={visibleItemBatches}
                coordinatePlotInteraction={coordinatePlotInteraction}
                lineEndpointPreview={lineEndpointPreview}
                registry={registry}
                selectedObjectIds={selectedObjectIds}
                selectionPreviewX={selectionPreviewDelta?.x ?? 0}
                selectionPreviewY={selectionPreviewDelta?.y ?? 0}
                zoom={previewViewport.zoom}
              />
            </AnimatedImageRedrawContext>
          </Group>
        </Layer>
        <Layer ref={wetInkLayerRef} listening={false}>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            <AnimatedImageRedrawContext value={animatedImageRedraw}>
              {previewItems.map((item) => (
                <BoardRenderItemView
                  interactive={false}
                  item={item}
                  key={item.object.id}
                  registry={registry}
                  zoom={previewViewport.zoom}
                />
              ))}
            </AnimatedImageRedrawContext>
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
            {eraserPoint === null ? null : (
              <Circle
                fill="rgba(255,255,255,0.35)"
                listening={false}
                radius={eraserRadiusPx / previewViewport.zoom}
                stroke="#245d6b"
                strokeWidth={1.5 / previewViewport.zoom}
                x={eraserPoint.x}
                y={eraserPoint.y}
              />
            )}
            {drawingConstraintFeedback === null ? null : (
              <>
                <Circle
                  fill="#ffffff"
                  radius={4.5 / previewViewport.zoom}
                  stroke="#2c7182"
                  strokeWidth={1.5 / previewViewport.zoom}
                  x={drawingConstraintFeedback.anchor.x}
                  y={drawingConstraintFeedback.anchor.y}
                />
                <Circle
                  fill="#2c7182"
                  radius={3.5 / previewViewport.zoom}
                  stroke="#ffffff"
                  strokeWidth={1 / previewViewport.zoom}
                  x={drawingConstraintFeedback.point.x}
                  y={drawingConstraintFeedback.point.y}
                />
                <Text
                  fill="#245d6b"
                  fontSize={13 / previewViewport.zoom}
                  fontStyle="bold"
                  listening={false}
                  text={drawingConstraintFeedback.label}
                  x={
                    drawingConstraintFeedback.point.x +
                    10 / previewViewport.zoom
                  }
                  y={
                    drawingConstraintFeedback.point.y -
                    24 / previewViewport.zoom
                  }
                />
              </>
            )}
            {remoteInkPreviews.map((preview) =>
              preview.points.length < 2 ? (
                <Circle
                  fill={preview.style.stroke}
                  key={`${preview.clientId}:${preview.previewId}`}
                  opacity={preview.style.opacity}
                  radius={Math.max(1, preview.style.strokeWidth / 2)}
                  x={preview.points[0]?.x ?? 0}
                  y={preview.points[0]?.y ?? 0}
                />
              ) : (
                <Line
                  key={`${preview.clientId}:${preview.previewId}`}
                  lineCap="round"
                  lineJoin="round"
                  opacity={preview.style.opacity}
                  perfectDrawEnabled={false}
                  points={[...flattenStrokePoints(preview.points)]}
                  stroke={preview.style.stroke}
                  strokeWidth={preview.style.strokeWidth}
                />
              ),
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
              onTransform={previewTransform}
              onTransformEnd={finishTransform}
              onTransformStart={() => {
                setIsTransforming(true);
                previewTransform();
              }}
              rotateAnchorOffset={26 / previewViewport.zoom}
              rotationSnapTolerance={5}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            />
          </Group>
        </Layer>
        <Layer>
          <Group
            scaleX={previewViewport.zoom}
            scaleY={previewViewport.zoom}
            x={previewViewport.offset.x}
            y={previewViewport.offset.y}
          >
            {lineEndpointHandles.map(({ endpoint, item, point }) => (
              <Circle
                fill="#ffffff"
                hitStrokeWidth={18 / previewViewport.zoom}
                key={`${item.object.id}:${endpoint}`}
                name="line-endpoint-handle"
                onPointerDown={(event) =>
                  beginLineEndpointTransform(event, item, endpoint)
                }
                radius={5 / previewViewport.zoom}
                stroke="#2c7182"
                strokeWidth={1.75 / previewViewport.zoom}
                x={point.x}
                y={point.y}
              />
            ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
