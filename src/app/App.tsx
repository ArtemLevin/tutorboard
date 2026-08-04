import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  BoardStage,
  createDefaultKonvaRendererRegistry,
  zoomCoordinatePlotViewportAt,
  type BoardObjectTransformSnapshot,
  type CanvasContextMenuRequest,
  type CoordinatePlotRenderInteraction,
  type CoordinatePlotZoomAxis,
  type SelectionPointerStartSample,
  type WorldPointerSample,
} from "../adapters/canvas-konva/public";
import {
  actorId,
  boardDocumentSchemaVersion,
  boardObjectId,
  commandId,
  createBoardSceneSelector,
  createEmptyBoardDocument,
  documentId,
  geometryImportId,
  groupId,
  plotParameterId,
  plotSeriesId,
  reduceBoardDocument,
  screenToWorld,
  type BoardDocument,
  type BoardCommand,
  type CommandResult,
  type ActorId,
  type BoardObjectId,
  type BoardRenderItem,
  type GeometryOsClient,
  type Vec2,
  type CommandMetadata,
  type CoordinatePlotDefinition,
  type PlotSeries,
  type PlotSeriesId,
  type PenStrokeObject,
  type VisualStyleOverride,
  type ViewportState,
} from "../core/public";
import {
  copyBoardSelection,
  createCutContentCommand,
  createPasteContentCommand,
  type BoardClipboardPayload,
} from "../modules/clipboard/public";
import {
  createAddDrawingObjectCommand,
  drawingStyleDefaults,
  drawingTools,
  getDrawingPreview,
  isDrawingToolId,
  reduceDrawingInteraction,
  type DrawingAction,
  type DrawingInteractionState,
  type DrawingToolId,
  type UserDrawingObject,
} from "../modules/drawing/public";
import {
  startGeometryPrompt,
  type GeometryPromptOperation,
  type GeometryPromptResult,
} from "../modules/geometry-prompt/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from "../modules/history/public";
import {
  createAcceptSmartInkCompositeCommand,
  createAcceptSmartInkProposalCommand,
  proposeSmartInkComposite,
  proposeSmartInkReplacement,
  smartInkProposalStillApplies,
} from "../modules/smart-ink/public";
import {
  createTextShapePlacementCommand,
  createTextShapeContourPointCommand,
  createTextShapeGroupTransformCommand,
  createVertexConstructionCommand,
  inspectTextShapeFigure,
  inspectTextShapeVertex,
  inspectTextShapeVertexNearPoint,
  resolveTextShape,
  suggestTextShapes,
  type TextShapeDefinition,
  type VertexConstructionKind,
} from "../modules/text-shape-placement/public";
import {
  createGroupSelectionCommand,
  createReorderLayersCommand,
  createSetLayerVisibilityCommand,
  createUngroupSelectionCommand,
  selectLayers,
} from "../modules/layers/public";
import {
  createDeleteSelectionCommand,
  createMoveSelectionCommand,
  createSetSelectionLockCommand,
  createTransformSelectionCommand,
  expandSelectionObjectIds,
  getSelectionLasso,
  getSelectionMarquee,
  getSelectionPreviewDelta,
  initialSelectionState,
  isSelectionToolId,
  lassoSelectionTool,
  lassoSelectionToolId,
  normalizeRect,
  reduceSelectionInteraction,
  selectionIsLocked,
  selectionTool,
  selectionToolId,
  selectObjectIdsInLasso,
  selectObjectIdsInRect,
  selectSelectionBounds,
  type CompletedSelectionMove,
  type SelectionAction,
  type SelectionState,
  type SelectionToolId,
} from "../modules/selection/public";
import { createSetSelectionStyleCommand } from "../modules/styling/public";
import {
  createUpdateTextCommand,
  isEditableTextObject,
} from "../modules/text-editing/public";
import {
  addCoordinatePlotParameter,
  addCoordinatePlotSeries,
  createDefaultCoordinatePlotObject,
  fitCoordinatePlotDefinition,
  resetCoordinatePlotViewport,
  updateCoordinatePlotSeriesInput,
  validateCoordinatePlotEditorDefinition,
} from "../modules/coordinate-plot-editor/public";
import {
  calculateHandwrittenFunctionBounds,
  createMathInkRecognitionRequest,
  handwrittenFunctionToolId,
  initialHandwrittenFunctionSessionState,
  interpretMathInkRecognitionResult,
  isMathInkRecognitionAbortError,
  reduceHandwrittenFunctionSession,
  type HandwrittenFunctionInterpretation,
  type HandwrittenFunctionSessionAction,
  type HandwrittenFunctionSessionDiagnosticCode,
  type HandwrittenFunctionSessionState,
  type HandwrittenFunctionStroke,
  type MathInkRecognizer,
} from "../modules/handwritten-function/public";
import { HandwrittenFunctionPanel } from "./HandwrittenFunctionPanel";
import {
  createHandwrittenFunctionPlotObject,
  createHandwrittenFunctionReplaceCommand,
  createHandwrittenFunctionStrokeObjects,
  handwrittenFunctionSourceStillApplies,
  interpretHandwrittenFunctionDraft,
} from "./handwritten-function-composition";
import { CoordinatePlotEditorPanel } from "./CoordinatePlotEditorPanel";
import { CoordinatePlotNavigationControls } from "./CoordinatePlotNavigationControls";
import {
  createEmbeddedImageObject,
  embeddedImageAccept,
  embeddedImageImportLimits,
  isSupportedEmbeddedImageCandidate,
  prepareEmbeddedImageFile,
} from "./image-import";
import { BoardSettingsDialog } from "./board-chrome/BoardSettingsDialog";
import { BoardToolDock } from "./board-chrome/BoardToolDock";
import {
  CanvasContextMenu,
  ClearCanvasDialog,
} from "./board-chrome/CanvasContextMenu";
import { useDrawingToolPreferences } from "./board-chrome/tool-preferences";
import { readEnvironment } from "./configuration/environment";
import {
  GeometryPromptPanel,
  type GeometryPromptViewState,
} from "./GeometryPromptPanel";
import "./styles.css";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");
const navigationToolId = "navigation.pan" as const;
const laserToolId = "presentation.laser" as const;
const geometryPlacementToolId = "geometry.text-placement" as const;
const laserTrailFadeDurationMs = 900;
const laserTrailFrameMs = 40;
const laserTrailMaximumPoints = 96;
const laserTrailMinimumDistance = 1.5;
type ActiveToolId =
  | typeof navigationToolId
  | typeof laserToolId
  | typeof geometryPlacementToolId
  | typeof handwrittenFunctionToolId
  | SelectionToolId
  | DrawingToolId;

type PendingGeometryPlacement =
  | {
      readonly definition: TextShapeDefinition;
      readonly kind: "catalog";
    }
  | {
      readonly kind: "geometryos";
      readonly prompt: string;
    };
const initialDrawingState: DrawingInteractionState = { kind: "idle" };

function appendLaserTrailPoint(
  points: readonly Vec2[],
  point: Vec2,
): readonly Vec2[] {
  const previous = points.at(-1);
  if (
    previous !== undefined &&
    Math.hypot(point.x - previous.x, point.y - previous.y) <
      laserTrailMinimumDistance
  ) {
    return points;
  }
  return [...points.slice(-(laserTrailMaximumPoints - 1)), point];
}

function handwrittenSessionDiagnosticMessage(
  code: HandwrittenFunctionSessionDiagnosticCode,
): string {
  const messages: Record<HandwrittenFunctionSessionDiagnosticCode, string> = {
    "handwriting.active-stroke": "Завершите текущий штрих.",
    "handwriting.duration-limit": "Ввод занял слишком много времени.",
    "handwriting.empty-session": "Добавьте хотя бы один штрих.",
    "handwriting.empty-stroke": "Короткий штрих пропущен.",
    "handwriting.invalid-action": "Действие недоступно в текущем состоянии.",
    "handwriting.invalid-identifier":
      "Внутренний идентификатор ввода некорректен.",
    "handwriting.invalid-point": "Координаты штриха некорректны.",
    "handwriting.point-limit": "Достигнут предел точек рукописной функции.",
    "handwriting.pointer-mismatch": "Активный указатель изменился.",
    "handwriting.stale-recognition":
      "Получен устаревший результат распознавания.",
    "handwriting.stroke-limit": "Достигнут предел количества штрихов.",
  };
  return messages[code];
}

function handwrittenStrokeObjectId(
  sessionId: string,
  stroke: HandwrittenFunctionStroke,
  index: number,
): BoardObjectId {
  return boardObjectId(
    `object:handwritten-function:${sessionId}:${index}:${stroke.id}`,
  );
}

interface CoordinatePlotEditorSession {
  readonly draft: CoordinatePlotDefinition;
  readonly expected: CoordinatePlotDefinition;
  readonly objectId: BoardObjectId;
  readonly selectedSeriesId: PlotSeriesId | null;
  readonly zoomAxis: CoordinatePlotZoomAxis;
}

export interface AppPersistenceStatus {
  readonly detail?: string;
  readonly kind:
    "conflict" | "error" | "idle" | "saved" | "saving" | "scheduled";
  readonly label: string;
  readonly retryable?: boolean;
}

export interface AppProps {
  readonly commandActorId?: ActorId;
  readonly geometryOsClient?: GeometryOsClient | undefined;
  readonly historyEnabled?: boolean;
  readonly mathInkRecognizer?: MathInkRecognizer | undefined;
  readonly initialDocument?: BoardDocument;
  readonly collaborativeUndoAvailable?: boolean;
  readonly onCollaborativeUndo?: () => void;
  readonly onCommandCommitted?:
    | ((
        command: BoardCommand,
        document: BoardDocument,
        previousDocument: BoardDocument,
      ) => void)
    | undefined;
  readonly onDocumentChange?: (document: BoardDocument) => void;
  readonly onExportDocument?: ((document: BoardDocument) => void) | undefined;
  readonly onExportPngSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportPdfSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportSvgSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportDiagnostics?: () => void;
  readonly onImportDocument?: (file: File) => void;
  readonly onShareBoard?: (() => void) | undefined;
  readonly onPresenceChange?: (presence: {
    readonly cursor?: { readonly x: number; readonly y: number };
    readonly selectedObjectIds: readonly string[];
    readonly viewport: {
      readonly x: number;
      readonly y: number;
      readonly zoom: number;
    };
  }) => void;
  readonly onRetryPersistence?: () => void;
  readonly persistenceNotice?: string | null;
  readonly persistenceStatus?: AppPersistenceStatus;
  readonly readOnly?: boolean;
  readonly settingsExtra?: ReactNode;
  readonly remoteCursors?: readonly {
    readonly actorId: string;
    readonly point: { readonly x: number; readonly y: number };
  }[];
}

// The persistence bootstrap reuses this deterministic seed without importing UI state.
// eslint-disable-next-line react-refresh/only-export-components
export function createInitialDocument(): BoardDocument {
  const timestamp = new Date().toISOString();
  return createEmptyBoardDocument({
    id: documentId("document:local-board"),
    title: "TutorBoard canvas",
    createdAt: timestamp,
  });
}

export function App({
  commandActorId = localActorId,
  collaborativeUndoAvailable = false,
  geometryOsClient,
  historyEnabled = true,
  mathInkRecognizer,
  initialDocument,
  onCommandCommitted,
  onCollaborativeUndo,
  onDocumentChange,
  onExportDocument,
  onExportPngSnapshot,
  onExportPdfSnapshot,
  onExportSvgSnapshot,
  onExportDiagnostics,
  onImportDocument,
  onShareBoard,
  onPresenceChange,
  onRetryPersistence,
  persistenceNotice = null,
  persistenceStatus = { kind: "idle", label: "Локальное сохранение" },
  readOnly = false,
  settingsExtra,
  remoteCursors = [],
}: AppProps = {}) {
  const [boardState, setBoardState] = useState(() => ({
    commandError: null as string | null,
    history: createDocumentHistory(initialDocument ?? createInitialDocument()),
  }));
  const [activeTool, setActiveTool] = useState<ActiveToolId>(navigationToolId);
  const [drawingState, setDrawingState] = useState(initialDrawingState);
  const drawingStateRef = useRef<DrawingInteractionState>(initialDrawingState);
  const [drawingDiagnostic, setDrawingDiagnostic] = useState<string | null>(
    null,
  );
  const [smartInkNotice, setSmartInkNotice] = useState<string | null>(null);
  const recentSmartInkObjectIdsRef = useRef<BoardObjectId[]>([]);
  const [handwrittenFunctionState, setHandwrittenFunctionState] =
    useState<HandwrittenFunctionSessionState>(
      initialHandwrittenFunctionSessionState,
    );
  const handwrittenFunctionStateRef = useRef<HandwrittenFunctionSessionState>(
    initialHandwrittenFunctionSessionState,
  );
  const [
    handwrittenFunctionSourceObjects,
    setHandwrittenFunctionSourceObjects,
  ] = useState<readonly PenStrokeObject[] | null>(null);
  const handwrittenFunctionSourceObjectsRef = useRef<
    readonly PenStrokeObject[] | null
  >(null);
  const [
    handwrittenFunctionInterpretation,
    setHandwrittenFunctionInterpretation,
  ] = useState<HandwrittenFunctionInterpretation | null>(null);
  const [handwrittenFunctionDraft, setHandwrittenFunctionDraft] = useState("");
  const [handwrittenFunctionDiagnostic, setHandwrittenFunctionDiagnostic] =
    useState<string | null>(null);
  const handwrittenFunctionRecognitionAbortRef = useRef<AbortController | null>(
    null,
  );
  const [selectionState, setSelectionState] = useState(initialSelectionState);
  const selectionStateRef = useRef<SelectionState>(initialSelectionState);
  const [coordinatePlotEditor, setCoordinatePlotEditor] =
    useState<CoordinatePlotEditorSession | null>(null);
  const [selectionInspectorObjectId, setSelectionInspectorObjectId] =
    useState<BoardObjectId | null>(null);
  const [textDraft, setTextDraft] = useState("Новый текст");
  const [polygonSides, setPolygonSides] = useState(5);
  const [laserPoint, setLaserPoint] = useState<Vec2 | null>(null);
  const [laserTrailOpacity, setLaserTrailOpacity] = useState(0);
  const [laserTrailPoints, setLaserTrailPoints] = useState<readonly Vec2[]>([]);
  const laserTrailFadeTimerRef = useRef<number | null>(null);
  const { styleFor, updateStyle } = useDrawingToolPreferences();
  const [imageDiagnostic, setImageDiagnostic] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<BoardClipboardPayload | null>(
    null,
  );
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] =
    useState<CanvasContextMenuRequest | null>(null);
  const [clearCanvasConfirmationOpen, setClearCanvasConfirmationOpen] =
    useState(false);
  const [accessibilityNotice, setAccessibilityNotice] = useState<string | null>(
    null,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geometryPromptOpen, setGeometryPromptOpen] = useState(false);
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsDialogRef = useRef<HTMLElement>(null);
  const [geometryPrompt, setGeometryPrompt] = useState(
    "Построй треугольник ABC и высоту AH",
  );
  const [autoLabelGeometryVertices, setAutoLabelGeometryVertices] =
    useState(true);
  const [pendingGeometryPlacement, setPendingGeometryPlacement] =
    useState<PendingGeometryPlacement | null>(null);
  const [vertexConstructionObjectId, setVertexConstructionObjectId] =
    useState<BoardObjectId | null>(null);
  const contourPointPointerRef = useRef<number | null>(null);
  const [geometryPromptState, setGeometryPromptState] =
    useState<GeometryPromptViewState>({ kind: "idle" });
  const geometryOperationRef = useRef<GeometryPromptOperation | null>(null);
  const lastGeometryOsPlacementRef = useRef<{
    readonly point: Vec2;
    readonly prompt: string;
  } | null>(null);
  const placePendingGeometryRef = useRef<(point: Vec2) => void>(() => {});
  const workspaceRef = useRef<HTMLElement>(null);
  const lastPointerWorldRef = useRef<Vec2 | null>(null);
  const { commandError, history } = boardState;
  const document = history.present;
  const documentRef = useRef(document);

  const stopLaserTrailFade = useCallback(() => {
    if (laserTrailFadeTimerRef.current === null) return;
    window.clearInterval(laserTrailFadeTimerRef.current);
    laserTrailFadeTimerRef.current = null;
  }, []);

  const clearLaserTrail = useCallback(() => {
    stopLaserTrailFade();
    setLaserTrailOpacity(0);
    setLaserTrailPoints([]);
  }, [stopLaserTrailFade]);

  const fadeLaserTrail = useCallback(() => {
    stopLaserTrailFade();
    const startedAtMs = performance.now();
    setLaserTrailOpacity(1);
    laserTrailFadeTimerRef.current = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAtMs;
      const opacity = Math.max(0, 1 - elapsedMs / laserTrailFadeDurationMs);
      setLaserTrailOpacity(opacity);
      if (opacity > 0) return;
      stopLaserTrailFade();
      setLaserTrailPoints([]);
    }, laserTrailFrameMs);
  }, [stopLaserTrailFade]);

  useEffect(() => stopLaserTrailFade, [stopLaserTrailFade]);
  useEffect(() => {
    documentRef.current = document;
  }, [document]);
  useEffect(() => {
    if (activeTool !== "drawing.smart-ink") {
      recentSmartInkObjectIdsRef.current = [];
    }
  }, [activeTool]);
  useEffect(
    () => () => {
      geometryOperationRef.current?.cancel();
      handwrittenFunctionRecognitionAbortRef.current?.abort();
    },
    [],
  );
  const registry = useMemo(() => createDefaultKonvaRendererRegistry(), []);
  const geometrySuggestions = useMemo(
    () => suggestTextShapes(geometryPrompt, 8),
    [geometryPrompt],
  );
  const sceneSelector = useMemo(() => createBoardSceneSelector(), []);
  const scene = useMemo(
    () => sceneSelector(document),
    [document, sceneSelector],
  );
  useEffect(() => {
    onPresenceChange?.({
      selectedObjectIds: selectionState.selectedObjectIds,
      viewport: {
        x: document.viewport.offset.x,
        y: document.viewport.offset.y,
        zoom: document.viewport.zoom,
      },
    });
  }, [
    document.viewport.offset.x,
    document.viewport.offset.y,
    document.viewport.zoom,
    onPresenceChange,
    selectionState.selectedObjectIds,
  ]);
  const layers = useMemo(() => selectLayers(document), [document]);
  const drawingPreview = useMemo(
    () => getDrawingPreview(drawingState),
    [drawingState],
  );
  const handwrittenFunctionStrokes = useMemo<
    readonly HandwrittenFunctionStroke[]
  >(() => {
    if (handwrittenFunctionState.kind === "idle") return [];
    const active =
      handwrittenFunctionState.kind === "collecting"
        ? handwrittenFunctionState.activeStroke
        : null;
    return active !== null && active.points.length >= 2
      ? [
          ...handwrittenFunctionState.strokes,
          { id: active.id, points: active.points },
        ]
      : handwrittenFunctionState.strokes;
  }, [handwrittenFunctionState]);
  const handwrittenFunctionBounds = useMemo(
    () =>
      handwrittenFunctionState.kind === "idle"
        ? null
        : handwrittenFunctionState.kind === "collecting"
          ? calculateHandwrittenFunctionBounds(handwrittenFunctionStrokes)
          : handwrittenFunctionState.bounds,
    [handwrittenFunctionState, handwrittenFunctionStrokes],
  );
  const handwrittenFunctionDraftInterpretation = useMemo(
    () =>
      handwrittenFunctionDraft.trim().length === 0
        ? null
        : interpretHandwrittenFunctionDraft(handwrittenFunctionDraft),
    [handwrittenFunctionDraft],
  );
  const handwrittenFunctionDraftCandidate =
    handwrittenFunctionDraftInterpretation?.status === "accepted"
      ? handwrittenFunctionDraftInterpretation.selected
      : null;
  const handwrittenFunctionDraftIssue = useMemo(() => {
    if (handwrittenFunctionDraft.trim().length === 0) {
      return handwrittenFunctionSourceObjects === null
        ? null
        : "Введите функцию для построения графика.";
    }
    if (handwrittenFunctionDraftCandidate !== null) return null;
    return (
      handwrittenFunctionDraftInterpretation?.diagnostics.find(
        ({ severity, code }) =>
          severity === "error" &&
          code !== "handwriting.interpretation.no-valid-candidate",
      )?.message ?? "Выражение пока нельзя построить."
    );
  }, [
    handwrittenFunctionDraft,
    handwrittenFunctionDraftCandidate,
    handwrittenFunctionDraftInterpretation,
    handwrittenFunctionSourceObjects,
  ]);
  const handwrittenFunctionPlotObject = useMemo(() => {
    if (
      handwrittenFunctionBounds === null ||
      handwrittenFunctionDraftCandidate === null ||
      handwrittenFunctionState.kind === "idle"
    ) {
      return null;
    }
    const sessionId = handwrittenFunctionState.sessionId;
    return createHandwrittenFunctionPlotObject({
      bounds: handwrittenFunctionBounds,
      candidate: handwrittenFunctionDraftCandidate,
      ids: {
        objectId: boardObjectId(
          `object:handwritten-function-plot:${sessionId}`,
        ),
        parameterId: (_name, index) =>
          plotParameterId(
            `plot-parameter:handwritten-function:${sessionId}:${index}`,
          ),
        seriesId: plotSeriesId(`plot-series:handwritten-function:${sessionId}`),
      },
    });
  }, [
    handwrittenFunctionBounds,
    handwrittenFunctionDraftCandidate,
    handwrittenFunctionState,
  ]);
  const handwrittenFunctionSourceApplies = useMemo(
    () =>
      handwrittenFunctionSourceObjects !== null &&
      handwrittenFunctionSourceStillApplies(
        document,
        handwrittenFunctionSourceObjects,
      ),
    [document, handwrittenFunctionSourceObjects],
  );
  const handwrittenFunctionPreviewItems = useMemo<
    readonly BoardRenderItem[]
  >(() => {
    const inkItems =
      handwrittenFunctionSourceObjects !== null ||
      handwrittenFunctionState.kind === "idle"
        ? []
        : createHandwrittenFunctionStrokeObjects({
            ids: {
              objectId: (stroke, index) =>
                handwrittenStrokeObjectId(
                  handwrittenFunctionState.sessionId,
                  stroke,
                  index,
                ),
            },
            strokes: handwrittenFunctionStrokes,
          }).map((object) => ({ object, transforms: [] }));
    const plotItems =
      handwrittenFunctionSourceObjects === null ||
      handwrittenFunctionPlotObject === null
        ? []
        : [
            {
              object: {
                ...handwrittenFunctionPlotObject,
                style: {
                  ...handwrittenFunctionPlotObject.style,
                  opacity: 0.72,
                },
              },
              transforms: [],
            },
          ];
    return [...inkItems, ...plotItems];
  }, [
    handwrittenFunctionPlotObject,
    handwrittenFunctionSourceObjects,
    handwrittenFunctionState,
    handwrittenFunctionStrokes,
  ]);
  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () => [
      ...(drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }]),
      ...handwrittenFunctionPreviewItems,
    ],
    [drawingPreview, handwrittenFunctionPreviewItems],
  );
  const wetInkStyle = useMemo(() => {
    const style =
      activeTool === "drawing.pen" || activeTool === "drawing.smart-ink"
        ? styleFor(activeTool)
        : activeTool === handwrittenFunctionToolId
          ? drawingStyleDefaults.pen
          : null;
    if (style === null) return null;
    return {
      opacity: style.opacity,
      stroke: style.stroke ?? drawingStyleDefaults.pen.stroke,
      strokeWidth: style.strokeWidth,
    };
  }, [activeTool, styleFor]);
  const selectionPreviewDelta = useMemo(
    () => getSelectionPreviewDelta(selectionState),
    [selectionState],
  );
  const selectionMarquee = useMemo(
    () => getSelectionMarquee(selectionState),
    [selectionState],
  );
  const selectionLasso = useMemo(
    () => getSelectionLasso(selectionState),
    [selectionState],
  );
  const selectionBounds = useMemo(
    () => selectSelectionBounds(scene, selectionState.selectedObjectIds),
    [scene, selectionState.selectedObjectIds],
  );
  const selectedLocked = useMemo(
    () => selectionIsLocked(document, selectionState.selectedObjectIds),
    [document, selectionState.selectedObjectIds],
  );
  const renderedSelectionPreviewDelta = selectedLocked
    ? null
    : selectionPreviewDelta;

  useEffect(() => {
    onDocumentChange?.(document);
  }, [document, onDocumentChange]);

  const createCommandMetadata = useCallback(
    (): CommandMetadata => ({
      actorId: commandActorId,
      id: commandId(`command:${crypto.randomUUID()}`),
      timestamp: new Date().toISOString(),
    }),
    [commandActorId],
  );

  const commitCommand = useCallback(
    (command: BoardCommand): CommandResult => {
      if (readOnly) {
        const result: CommandResult = {
          document: documentRef.current,
          error: {
            code: "command.invalid",
            message: "Доска открыта только для чтения.",
          },
          ok: false,
        };
        setBoardState((current) => ({
          ...current,
          commandError: result.error.message,
        }));
        return result;
      }
      const previousDocument = documentRef.current;
      const result = reduceBoardDocument(previousDocument, command);
      if (!result.ok) {
        setBoardState((current) => ({
          ...current,
          commandError: result.error.message,
        }));
        return result;
      }
      documentRef.current = result.document;
      setBoardState((current) => ({
        commandError: null,
        history: commitDocumentHistory(current.history, result.document),
      }));
      onCommandCommitted?.(command, result.document, previousDocument);
      return result;
    },
    [onCommandCommitted, readOnly],
  );

  const undo = useCallback(() => {
    if (!historyEnabled) {
      if (collaborativeUndoAvailable && onCollaborativeUndo !== undefined) {
        onCollaborativeUndo();
      } else {
        setBoardState((current) => ({
          ...current,
          commandError: "Нет собственной обратимой операции для отмены.",
        }));
      }
      return;
    }
    setBoardState((current) => {
      const next = undoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, [collaborativeUndoAvailable, historyEnabled, onCollaborativeUndo]);

  const redo = useCallback(() => {
    if (!historyEnabled) {
      setBoardState((current) => ({
        ...current,
        commandError:
          "Повтор будет доступен после добавления синхронизируемой undo-команды в board/v1.",
      }));
      return;
    }
    setBoardState((current) => {
      const next = redoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, [historyEnabled]);

  const copySelection = useCallback(() => {
    const copied = copyBoardSelection(
      documentRef.current,
      selectionStateRef.current.selectedObjectIds,
    );
    if (copied.status === "error") {
      setClipboardNotice("Нет объектов для копирования");
      return;
    }
    setClipboard(copied.payload);
    setClipboardNotice(`Скопировано: ${copied.payload.order.length}`);
  }, []);

  const cutSelection = useCallback(() => {
    const current = documentRef.current;
    const copied = copyBoardSelection(
      current,
      selectionStateRef.current.selectedObjectIds,
    );
    if (copied.status === "error") {
      setClipboardNotice("Нет объектов для вырезания");
      return;
    }
    const result = commitCommand(
      createCutContentCommand(copied.payload, createCommandMetadata()),
    );
    if (!result.ok) {
      setClipboardNotice(result.error.message);
      return;
    }
    setClipboard(copied.payload);
    setClipboardNotice(`Вырезано: ${copied.payload.order.length}`);
    const cleared: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [],
    };
    selectionStateRef.current = cleared;
    setSelectionState(cleared);
  }, [commitCommand, createCommandMetadata]);

  const pasteClipboard = useCallback(() => {
    if (clipboard === null) {
      setClipboardNotice("Буфер обмена пуст");
      return;
    }
    const token = crypto.randomUUID();
    let objectSequence = 0;
    let groupSequence = 0;
    let importSequence = 0;
    const command = createPasteContentCommand(
      clipboard,
      {
        actorId: commandActorId,
        id: commandId(`command:${token}`),
        timestamp: new Date().toISOString(),
      },
      {
        geometryImport: () =>
          geometryImportId(`import:paste:${token}:${importSequence++}`),
        group: () => groupId(`group:paste:${token}:${groupSequence++}`),
        object: () =>
          boardObjectId(`object:paste:${token}:${objectSequence++}`),
      },
    );
    const result = commitCommand(command);
    if (!result.ok) {
      setClipboardNotice(result.error.message);
      return;
    }
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: command.objects.map(({ id }) => id),
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setActiveTool(selectionToolId);
    setClipboardNotice(`Вставлено: ${command.objects.length}`);
  }, [clipboard, commandActorId, commitCommand]);

  const clearCanvas = useCallback(() => {
    const current = documentRef.current;
    const copied = copyBoardSelection(current, current.order);
    if (copied.status === "error") {
      setClearCanvasConfirmationOpen(false);
      setCanvasContextMenu(null);
      return;
    }
    const result = commitCommand(
      createCutContentCommand(copied.payload, createCommandMetadata()),
    );
    if (!result.ok) {
      setClipboardNotice(result.error.message);
      return;
    }
    const cleared: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [],
    };
    selectionStateRef.current = cleared;
    setSelectionState(cleared);
    setSelectionInspectorObjectId(null);
    setClearCanvasConfirmationOpen(false);
    setCanvasContextMenu(null);
    setAccessibilityNotice(
      `Холст очищен: удалено объектов ${copied.payload.order.length}`,
    );
  }, [commitCommand, createCommandMetadata]);

  const selectLayer = useCallback(
    (objectId: BoardObjectId) => {
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: expandSelectionObjectIds(document, [objectId]),
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setActiveTool(selectionToolId);
    },
    [document],
  );

  const reorderLayer = useCallback(
    (objectId: BoardObjectId, mode: "back" | "front") => {
      commitCommand(
        createReorderLayersCommand(createCommandMetadata(), [objectId], mode),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const toggleLayerVisibility = useCallback(
    (objectId: BoardObjectId, visible: boolean) => {
      commitCommand(
        createSetLayerVisibilityCommand(
          createCommandMetadata(),
          [objectId],
          visible,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const toggleLayerLock = useCallback(
    (objectId: BoardObjectId, locked: boolean) => {
      const current = documentRef.current;
      commitCommand(
        createSetSelectionLockCommand(
          createCommandMetadata(),
          current,
          expandSelectionObjectIds(current, [objectId]),
          locked,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const groupSelection = useCallback(() => {
    const current = documentRef.current;
    const objectIds = selectionStateRef.current.selectedObjectIds;
    if (
      objectIds.length < 2 ||
      objectIds.some((id) => {
        const object = current.objects[id];
        return object?.groupId !== null || object.source.kind !== "user";
      })
    ) {
      return;
    }
    commitCommand(
      createGroupSelectionCommand(
        createCommandMetadata(),
        groupId(`group:${crypto.randomUUID()}`),
        objectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata]);

  const ungroupSelection = useCallback(() => {
    const current = documentRef.current;
    commitCommand(
      createUngroupSelectionCommand(
        createCommandMetadata(),
        current,
        selectionStateRef.current.selectedObjectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata]);

  const updateSelectionStyle = useCallback(
    (style: VisualStyleOverride) => {
      if (selectionStateRef.current.selectedObjectIds.length === 0) {
        return;
      }
      commitCommand(
        createSetSelectionStyleCommand(
          createCommandMetadata(),
          selectionStateRef.current.selectedObjectIds,
          style,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const updateSelectedText = useCallback(
    (objectId: BoardObjectId, text: string) => {
      const object = documentRef.current.objects[objectId];
      if (!isEditableTextObject(object) || object.text === text) {
        return;
      }
      commitCommand(
        createUpdateTextCommand(createCommandMetadata(), objectId, text),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const commitViewport = useCallback(
    (viewport: ViewportState) => {
      commitCommand({
        ...createCommandMetadata(),
        kind: "core.viewport.set",
        viewport,
      });
    },
    [commitCommand, createCommandMetadata],
  );

  const commitDrawingObject = useCallback(
    (object: UserDrawingObject) => {
      return commitCommand(
        createAddDrawingObjectCommand(createCommandMetadata(), object),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const insertTextAt = useCallback(
    (point: Vec2) => {
      const pointerId = 0;
      const started = reduceDrawingInteraction(initialDrawingState, {
        kind: "start",
        objectId: boardObjectId(`object:${crypto.randomUUID()}`),
        point,
        pointerId,
        style: styleFor("drawing.text"),
        text: textDraft,
        tool: "drawing.text",
      });
      const finished = reduceDrawingInteraction(started.state, {
        kind: "finish",
        point,
        pointerId,
      });
      if (finished.completedObject === null) {
        setDrawingDiagnostic(finished.diagnostic);
        return;
      }
      const result = commitDrawingObject(finished.completedObject);
      if (!result.ok) {
        return;
      }
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: [finished.completedObject.id],
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setSelectionInspectorObjectId(finished.completedObject.id);
      setActiveTool(selectionToolId);
      setAccessibilityNotice("Текст добавлен");
    },
    [commitDrawingObject, styleFor, textDraft],
  );

  const commitSelectionMove = useCallback(
    (completed: CompletedSelectionMove) => {
      const current = documentRef.current;
      commitCommand(
        createMoveSelectionCommand(
          createCommandMetadata(),
          current,
          completed.objectIds,
          completed.delta,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const commitSelectionTransform = useCallback(
    (transforms: readonly BoardObjectTransformSnapshot[]) => {
      if (transforms.length === 0) {
        return;
      }
      const current = documentRef.current;
      let command: BoardCommand;
      try {
        command = createTransformSelectionCommand(
          createCommandMetadata(),
          current,
          transforms,
        );
      } catch (error) {
        setBoardState((latest) => ({
          ...latest,
          commandError:
            error instanceof Error ? error.message : "Transform is invalid.",
        }));
        return;
      }
      const result = commitCommand(command);
      if (result.ok) {
        setAccessibilityNotice("Размер или поворот выделения изменён");
      }
    },
    [commitCommand, createCommandMetadata],
  );

  const transformSelectionBy = useCallback(
    (scaleFactor: number, rotationDelta: number) => {
      const current = documentRef.current;
      const figure = inspectTextShapeFigure(
        current,
        selectionStateRef.current.selectedObjectIds,
      );
      if (figure !== null) {
        const command = createTextShapeGroupTransformCommand({
          document: current,
          groupId: figure.groupId,
          metadata: createCommandMetadata(),
          rotationDelta,
          scaleFactor,
        });
        if (command !== null && commitCommand(command).ok) {
          setAccessibilityNotice("Размер или поворот фигуры изменён");
        }
        return;
      }
      const transforms = selectionStateRef.current.selectedObjectIds.flatMap(
        (objectId) => {
          const object = current.objects[objectId];
          if (
            object === undefined ||
            object.locked ||
            object.groupId !== null ||
            object.source.kind !== "user"
          ) {
            return [];
          }
          return [
            {
              objectId,
              position: object.position,
              rotation: object.rotation + rotationDelta,
              scale: {
                x: Math.min(100, Math.max(0.05, object.scale.x * scaleFactor)),
                y: Math.min(100, Math.max(0.05, object.scale.y * scaleFactor)),
              },
            },
          ];
        },
      );
      commitSelectionTransform(transforms);
    },
    [commitCommand, commitSelectionTransform, createCommandMetadata],
  );

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => shortcutsButtonRef.current?.focus());
    });
  }, []);

  const applySmartInkComposite = useCallback(
    (objectId: BoardObjectId) => {
      const current = documentRef.current;
      const ids = [
        ...recentSmartInkObjectIdsRef.current.filter(
          (id) => current.objects[id] !== undefined && id !== objectId,
        ),
        objectId,
      ].slice(-6);
      recentSmartInkObjectIdsRef.current = ids;
      const recentObjects = ids.flatMap((id) => {
        const object = documentRef.current.objects[id];
        return object === undefined ? [] : [object];
      });
      const composite = proposeSmartInkComposite(recentObjects);
      if (composite === null) return;
      const accepted = commitCommand(
        createAcceptSmartInkCompositeCommand(
          createCommandMetadata(),
          composite,
        ),
      );
      if (accepted.ok) {
        recentSmartInkObjectIdsRef.current = [];
        setSmartInkNotice(null);
      }
    },
    [commitCommand, createCommandMetadata],
  );

  const applyDrawingAction = useCallback(
    (action: DrawingAction, requestSmartInk = false) => {
      const result = reduceDrawingInteraction(drawingStateRef.current, action);
      drawingStateRef.current = result.state;
      setDrawingState(result.state);
      setDrawingDiagnostic(result.diagnostic);
      if (result.completedObject !== null) {
        const committed = commitDrawingObject(result.completedObject);
        if (
          committed.ok &&
          requestSmartInk &&
          result.completedObject.kind === "drawing.pen-stroke"
        ) {
          const proposed = proposeSmartInkReplacement(result.completedObject);
          if (proposed.status === "proposed") {
            const current =
              documentRef.current.objects[proposed.proposal.original.id];
            if (
              current?.kind === "drawing.pen-stroke" &&
              smartInkProposalStillApplies(proposed.proposal, current)
            ) {
              const accepted = commitCommand(
                createAcceptSmartInkProposalCommand(
                  createCommandMetadata(),
                  proposed.proposal,
                ),
              );
              setSmartInkNotice(
                accepted.ok
                  ? null
                  : "Smart Ink: автокоррекция фигуры завершилась ошибкой.",
              );
            } else {
              setSmartInkNotice(
                "Smart Ink: исходный штрих изменился до автокоррекции.",
              );
            }
          } else {
            setSmartInkNotice(
              proposed.recognizer.status === "ambiguous"
                ? "Smart Ink: форма неоднозначна, исходный штрих сохранён."
                : null,
            );
          }
          applySmartInkComposite(result.completedObject.id);
        }
      }
    },
    [
      applySmartInkComposite,
      commitCommand,
      commitDrawingObject,
      createCommandMetadata,
    ],
  );

  const applyHandwrittenFunctionAction = useCallback(
    (
      action: HandwrittenFunctionSessionAction,
    ): HandwrittenFunctionSessionState => {
      const result = reduceHandwrittenFunctionSession(
        handwrittenFunctionStateRef.current,
        action,
      );
      handwrittenFunctionStateRef.current = result.state;
      setHandwrittenFunctionState(result.state);
      if (result.diagnostic !== null) {
        setHandwrittenFunctionDiagnostic(
          handwrittenSessionDiagnosticMessage(result.diagnostic),
        );
      }
      return result.state;
    },
    [],
  );

  const closeHandwrittenFunctionState = useCallback(() => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    handwrittenFunctionRecognitionAbortRef.current = null;
    handwrittenFunctionStateRef.current =
      initialHandwrittenFunctionSessionState;
    setHandwrittenFunctionState(initialHandwrittenFunctionSessionState);
    handwrittenFunctionSourceObjectsRef.current = null;
    setHandwrittenFunctionSourceObjects(null);
    setHandwrittenFunctionInterpretation(null);
    setHandwrittenFunctionDraft("");
    setHandwrittenFunctionDiagnostic(null);
  }, []);

  const materializeHandwrittenFunctionInk = useCallback(
    (
      state: Exclude<
        HandwrittenFunctionSessionState,
        { readonly kind: "idle" }
      >,
    ): readonly PenStrokeObject[] | null => {
      const existing = handwrittenFunctionSourceObjectsRef.current;
      if (existing !== null) return existing;
      if (state.strokes.length === 0) return null;
      const objects = createHandwrittenFunctionStrokeObjects({
        ids: {
          objectId: (stroke, index) =>
            handwrittenStrokeObjectId(state.sessionId, stroke, index),
        },
        strokes: state.strokes,
      });
      const committed = commitCommand({
        ...createCommandMetadata(),
        kind: "core.objects.add",
        objects,
      });
      if (!committed.ok) {
        setHandwrittenFunctionDiagnostic(committed.error.message);
        return null;
      }
      handwrittenFunctionSourceObjectsRef.current = objects;
      setHandwrittenFunctionSourceObjects(objects);
      return objects;
    },
    [commitCommand, createCommandMetadata],
  );

  const preserveHandwrittenFunctionInk = useCallback((): boolean => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    let state = handwrittenFunctionStateRef.current;
    if (
      state.kind === "collecting" &&
      state.activeStroke !== null &&
      state.activeStroke.points.length >= 2
    ) {
      const point = state.activeStroke.points.at(-1)!;
      state = applyHandwrittenFunctionAction({
        kind: "finish-stroke",
        point,
        pointerId: state.activeStroke.pointerId,
      });
    }
    if (
      state.kind !== "idle" &&
      state.strokes.length > 0 &&
      handwrittenFunctionSourceObjectsRef.current === null &&
      materializeHandwrittenFunctionInk(state) === null
    ) {
      return false;
    }
    closeHandwrittenFunctionState();
    setAccessibilityNotice("Рукописные штрихи оставлены на доске");
    return true;
  }, [
    applyHandwrittenFunctionAction,
    closeHandwrittenFunctionState,
    materializeHandwrittenFunctionInk,
  ]);

  const clearHandwrittenFunction = useCallback(() => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    const originals = handwrittenFunctionSourceObjectsRef.current;
    if (originals !== null) {
      const objectIds = originals
        .map(({ id }) => id)
        .filter((id) => documentRef.current.objects[id] !== undefined);
      if (objectIds.length > 0) {
        const removed = commitCommand({
          ...createCommandMetadata(),
          kind: "core.objects.delete",
          objectIds,
        });
        if (!removed.ok) {
          setHandwrittenFunctionDiagnostic(removed.error.message);
          return;
        }
      }
    }
    closeHandwrittenFunctionState();
    setAccessibilityNotice("Рукописный ввод очищен");
  }, [closeHandwrittenFunctionState, commitCommand, createCommandMetadata]);

  const recognizeHandwrittenFunction = useCallback(() => {
    let state = handwrittenFunctionStateRef.current;
    if (state.kind === "idle" || state.kind === "recognizing") return;
    if (state.kind === "resolved" || state.kind === "failed") {
      state = applyHandwrittenFunctionAction({ kind: "reopen-input" });
    }
    if (state.kind === "collecting") {
      state = applyHandwrittenFunctionAction({ kind: "complete-input" });
    }
    if (state.kind !== "ready") return;
    const sourceObjects = materializeHandwrittenFunctionInk(state);
    if (sourceObjects === null) return;
    if (mathInkRecognizer === undefined) {
      setHandwrittenFunctionDiagnostic(
        "Штрихи сохранены. Введите функцию вручную.",
      );
      setAccessibilityNotice("Штрихи сохранены для ручного ввода функции");
      return;
    }

    handwrittenFunctionRecognitionAbortRef.current?.abort();
    const recognitionId = `recognition:${crypto.randomUUID()}`;
    const request = createMathInkRecognitionRequest(state, recognitionId);
    const started = applyHandwrittenFunctionAction({
      kind: "recognition-started",
      recognitionId,
    });
    if (started.kind !== "recognizing") return;
    const controller = new AbortController();
    handwrittenFunctionRecognitionAbortRef.current = controller;
    setHandwrittenFunctionDiagnostic(null);
    void mathInkRecognizer
      .recognize(request, controller.signal)
      .then((result) => {
        const current = handwrittenFunctionStateRef.current;
        if (
          controller.signal.aborted ||
          current.kind !== "recognizing" ||
          current.recognitionId !== recognitionId
        ) {
          return;
        }
        const resolved = applyHandwrittenFunctionAction({
          kind: "recognition-resolved",
          recognitionId,
          result,
        });
        if (resolved.kind !== "resolved") return;
        const interpreted = interpretMathInkRecognitionResult(result);
        setHandwrittenFunctionInterpretation(interpreted);
        const expression =
          interpreted.selected?.expression ??
          interpreted.candidates[0]?.expression ??
          "";
        setHandwrittenFunctionDraft(expression);
        setHandwrittenFunctionDiagnostic(
          interpreted.status === "accepted"
            ? null
            : interpreted.status === "ambiguous"
              ? "Проверьте выбранный вариант или исправьте выражение."
              : "Введите функцию вручную или повторите распознавание.",
        );
        setAccessibilityNotice(
          interpreted.status === "accepted"
            ? "Рукописная функция распознана"
            : "Результат распознавания требует проверки",
        );
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          isMathInkRecognitionAbortError(error)
        ) {
          return;
        }
        const current = handwrittenFunctionStateRef.current;
        if (
          current.kind !== "recognizing" ||
          current.recognitionId !== recognitionId
        ) {
          return;
        }
        applyHandwrittenFunctionAction({
          error: {
            code: "handwriting.recognition-failed",
            message:
              error instanceof Error
                ? error.message
                : "Распознавание завершилось ошибкой.",
            retryable: true,
          },
          kind: "recognition-failed",
          recognitionId,
        });
        setHandwrittenFunctionDiagnostic(
          error instanceof Error
            ? error.message
            : "Распознавание завершилось ошибкой.",
        );
        setAccessibilityNotice(
          "Распознавание завершилось ошибкой; штрихи сохранены",
        );
      })
      .finally(() => {
        if (handwrittenFunctionRecognitionAbortRef.current === controller) {
          handwrittenFunctionRecognitionAbortRef.current = null;
        }
      });
  }, [
    applyHandwrittenFunctionAction,
    materializeHandwrittenFunctionInk,
    mathInkRecognizer,
  ]);

  const buildHandwrittenFunctionPlot = useCallback(() => {
    const originals = handwrittenFunctionSourceObjectsRef.current;
    if (
      originals === null ||
      handwrittenFunctionPlotObject === null ||
      !handwrittenFunctionSourceStillApplies(documentRef.current, originals)
    ) {
      setHandwrittenFunctionDiagnostic(
        "Исходные штрихи изменились. Запустите ввод заново.",
      );
      return;
    }
    const result = commitCommand(
      createHandwrittenFunctionReplaceCommand(
        createCommandMetadata(),
        originals,
        handwrittenFunctionPlotObject,
      ),
    );
    if (!result.ok) {
      setHandwrittenFunctionDiagnostic(result.error.message);
      return;
    }
    closeHandwrittenFunctionState();
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [handwrittenFunctionPlotObject.id],
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setSelectionInspectorObjectId(null);
    setActiveTool(selectionToolId);
    setAccessibilityNotice("График рукописной функции построен");
  }, [
    closeHandwrittenFunctionState,
    commitCommand,
    createCommandMetadata,
    handwrittenFunctionPlotObject,
  ]);

  const activateTool = useCallback(
    (tool: ActiveToolId) => {
      if (
        activeTool === handwrittenFunctionToolId &&
        tool !== handwrittenFunctionToolId &&
        !preserveHandwrittenFunctionInk()
      ) {
        return;
      }
      applyDrawingAction({ kind: "cancel" });
      setSmartInkNotice(null);
      const selectionResult = reduceSelectionInteraction(
        selectionStateRef.current,
        { kind: "cancel" },
      );
      selectionStateRef.current = selectionResult.state;
      setSelectionState(selectionResult.state);
      setSelectionInspectorObjectId(null);
      if (tool !== laserToolId) {
        setLaserPoint(null);
        clearLaserTrail();
      }
      setActiveTool(tool);
    },
    [
      activeTool,
      applyDrawingAction,
      clearLaserTrail,
      preserveHandwrittenFunctionInk,
    ],
  );

  const beginCoordinatePlotEditing = useCallback(
    (objectId: BoardObjectId) => {
      if (
        coordinatePlotEditor !== null &&
        coordinatePlotEditor.objectId === objectId
      ) {
        return;
      }
      if (
        coordinatePlotEditor !== null &&
        coordinatePlotEditor.draft !== coordinatePlotEditor.expected
      ) {
        setAccessibilityNotice(
          "Сначала сохраните или закройте текущий редактор координатной плоскости.",
        );
        return;
      }
      const current = documentRef.current;
      const object = current.objects[objectId];
      const groupLocked =
        object?.groupId === null || object?.groupId === undefined
          ? false
          : current.groups[object.groupId]?.locked === true;
      if (
        object?.kind !== "math.coordinate-plot" ||
        object.source.kind !== "user" ||
        object.locked ||
        groupLocked
      ) {
        setBoardState((latest) => ({
          ...latest,
          commandError:
            "Для редактирования выберите разблокированную пользовательскую координатную плоскость.",
        }));
        return;
      }
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: [object.id],
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      activateTool(selectionToolId);
      setSelectionInspectorObjectId(null);
      setCoordinatePlotEditor({
        draft: object.definition,
        expected: object.definition,
        objectId: object.id,
        selectedSeriesId:
          object.definition.series.find(({ visible }) => visible)?.id ??
          object.definition.series[0]?.id ??
          null,
        zoomAxis: "both",
      });
    },
    [activateTool, coordinatePlotEditor],
  );

  const createCoordinatePlot = useCallback(() => {
    const current = documentRef.current;
    const workspace = workspaceRef.current?.getBoundingClientRect();
    const center =
      lastPointerWorldRef.current ??
      screenToWorld(
        {
          x: Math.max(1, workspace?.width ?? window.innerWidth) / 2,
          y: Math.max(1, workspace?.height ?? window.innerHeight) / 2,
        },
        current.viewport,
      );
    const token = crypto.randomUUID();
    let seriesSequence = 0;
    let parameterSequence = 0;
    const object = createDefaultCoordinatePlotObject({
      center,
      ids: {
        objectId: boardObjectId(`object:plot:${token}`),
        parameterId: () =>
          plotParameterId(`plot-parameter:${token}:${parameterSequence++}`),
        seriesId: () =>
          plotSeriesId(`plot-series:${token}:${seriesSequence++}`),
      },
    });
    const result = commitCommand({
      ...createCommandMetadata(),
      kind: "core.objects.add",
      objects: [object],
    });
    if (!result.ok) return;
    activateTool(selectionToolId);
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [object.id],
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setSelectionInspectorObjectId(null);
  }, [activateTool, commitCommand, createCommandMetadata]);

  const requestObjectSettings = useCallback(
    (objectId: BoardObjectId) => {
      const current = documentRef.current;
      const object = current.objects[objectId];
      if (object === undefined) return;
      if (object.kind === "math.coordinate-plot") {
        setSelectionInspectorObjectId(null);
        beginCoordinatePlotEditing(objectId);
        return;
      }
      activateTool(selectionToolId);
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: selectionStateRef.current.selectedObjectIds.includes(
          objectId,
        )
          ? selectionStateRef.current.selectedObjectIds
          : expandSelectionObjectIds(current, [objectId]),
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setCoordinatePlotEditor(null);
      setSelectionInspectorObjectId(objectId);
      setVertexConstructionObjectId(
        inspectTextShapeVertex(current, objectId)?.vertexObjectId ?? null,
      );
      setAccessibilityNotice("Настройки объекта открыты");
    },
    [activateTool, beginCoordinatePlotEditing],
  );

  const updateCoordinatePlotDraft = useCallback(
    (definition: CoordinatePlotDefinition) => {
      setCoordinatePlotEditor((current) =>
        current === null ? null : { ...current, draft: definition },
      );
    },
    [],
  );

  const selectCoordinatePlotSeries = useCallback(
    (objectId: BoardObjectId, seriesId: PlotSeriesId | null) => {
      setCoordinatePlotEditor((current) =>
        current === null || current.objectId !== objectId
          ? current
          : { ...current, selectedSeriesId: seriesId },
      );
    },
    [],
  );

  const updateCoordinatePlotViewport = useCallback(
    (
      objectId: BoardObjectId,
      viewport: CoordinatePlotDefinition["coordinateViewport"],
    ) => {
      setCoordinatePlotEditor((current) =>
        current === null || current.objectId !== objectId
          ? current
          : {
              ...current,
              draft: {
                ...current.draft,
                coordinateViewport: viewport,
              },
            },
      );
    },
    [],
  );

  const commitCoordinatePlotViewport = useCallback(
    (
      objectId: BoardObjectId,
      viewport: CoordinatePlotDefinition["coordinateViewport"],
    ): boolean => {
      const current = documentRef.current;
      const object = current.objects[objectId];
      if (
        readOnly ||
        object?.kind !== "math.coordinate-plot" ||
        object.source.kind !== "user" ||
        object.locked ||
        (object.groupId !== null &&
          current.groups[object.groupId]?.locked === true)
      ) {
        return false;
      }
      const expected = object.definition;
      const previous = expected.coordinateViewport;
      if (
        previous.equalScale === viewport.equalScale &&
        previous.xMax === viewport.xMax &&
        previous.xMin === viewport.xMin &&
        previous.yMax === viewport.yMax &&
        previous.yMin === viewport.yMin
      ) {
        return true;
      }
      const result = commitCommand({
        ...createCommandMetadata(),
        expected,
        kind: "core.coordinate-plot.update",
        objectId,
        replacement: { ...expected, coordinateViewport: viewport },
      });
      if (result.ok) {
        setAccessibilityNotice("Диапазон координатной плоскости изменён");
      }
      return result.ok;
    },
    [commitCommand, createCommandMetadata, readOnly],
  );

  const setCoordinatePlotZoomAxis = useCallback(
    (zoomAxis: CoordinatePlotZoomAxis) => {
      setCoordinatePlotEditor((current) =>
        current === null ? null : { ...current, zoomAxis },
      );
    },
    [],
  );

  const zoomCoordinatePlotEditor = useCallback((factor: number) => {
    setCoordinatePlotEditor((current) => {
      if (current === null) return null;
      const size = current.draft.size;
      return {
        ...current,
        draft: {
          ...current.draft,
          coordinateViewport: zoomCoordinatePlotViewportAt(
            current.draft.coordinateViewport,
            size,
            { x: size.width / 2, y: size.height / 2 },
            factor,
            current.zoomAxis,
          ),
        },
      };
    });
  }, []);

  const resetCoordinatePlotEditorViewport = useCallback(() => {
    setCoordinatePlotEditor((current) =>
      current === null
        ? null
        : { ...current, draft: resetCoordinatePlotViewport(current.draft) },
    );
  }, []);

  const fitCoordinatePlotEditorViewport = useCallback(() => {
    setCoordinatePlotEditor((current) =>
      current === null
        ? null
        : { ...current, draft: fitCoordinatePlotDefinition(current.draft) },
    );
  }, []);

  const saveCoordinatePlotEditor = useCallback((): boolean => {
    const session = coordinatePlotEditor;
    if (
      session === null ||
      readOnly ||
      session.draft === session.expected ||
      validateCoordinatePlotEditorDefinition(session.draft).some(
        ({ blocking }) => blocking,
      )
    ) {
      return false;
    }
    const result = commitCommand({
      ...createCommandMetadata(),
      expected: session.expected,
      kind: "core.coordinate-plot.update",
      objectId: session.objectId,
      replacement: session.draft,
    });
    if (!result.ok) return false;
    setCoordinatePlotEditor((current) =>
      current === null || current.objectId !== session.objectId
        ? current
        : {
            ...current,
            expected: session.draft,
          },
    );
    setAccessibilityNotice("Координатная плоскость сохранена");
    return true;
  }, [commitCommand, coordinatePlotEditor, createCommandMetadata, readOnly]);

  const addCoordinatePlotEditorSeries = useCallback(
    (kind: PlotSeries["kind"], expression?: string) => {
      const id = plotSeriesId(`plot-series:${crypto.randomUUID()}`);
      setCoordinatePlotEditor((current) => {
        if (current === null) return null;
        const added = addCoordinatePlotSeries(current.draft, kind, id);
        const draft =
          expression === undefined
            ? added
            : updateCoordinatePlotSeriesInput(added, id, expression);
        return {
          ...current,
          draft,
          selectedSeriesId: id,
        };
      });
    },
    [],
  );

  const addCoordinatePlotEditorParameter = useCallback((name?: string) => {
    const id = plotParameterId(`plot-parameter:${crypto.randomUUID()}`);
    setCoordinatePlotEditor((current) =>
      current === null
        ? null
        : {
            ...current,
            draft: addCoordinatePlotParameter(current.draft, id, name),
          },
    );
  }, []);

  const coordinatePlotInteraction = useMemo<CoordinatePlotRenderInteraction>(
    () => ({
      activeObjectId: coordinatePlotEditor?.objectId ?? null,
      selectedSeriesId: coordinatePlotEditor?.selectedSeriesId ?? null,
      zoomAxis: coordinatePlotEditor?.zoomAxis ?? "both",
      ...(coordinatePlotEditor === null
        ? {}
        : { definitionOverride: coordinatePlotEditor.draft }),
      onSelectedSeriesChange: selectCoordinatePlotSeries,
      onSettingsRequest: requestObjectSettings,
      onViewportChange: updateCoordinatePlotViewport,
      onViewportCommit: commitCoordinatePlotViewport,
    }),
    [
      commitCoordinatePlotViewport,
      coordinatePlotEditor,
      requestObjectSettings,
      selectCoordinatePlotSeries,
      updateCoordinatePlotViewport,
    ],
  );

  const importImageFiles = useCallback(
    async (files: readonly File[]) => {
      const candidates = files
        .filter(isSupportedEmbeddedImageCandidate)
        .slice(0, embeddedImageImportLimits.maxFilesPerBatch);
      if (candidates.length === 0) {
        setImageDiagnostic(
          "image.unsupported-format: Поддерживаются PNG, JPEG/JPG, SVG и GIF.",
        );
        return;
      }
      const totalBytes = candidates.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > embeddedImageImportLimits.maxBatchBytes) {
        setImageDiagnostic(
          "image.batch-too-large: Общий размер вставки превышает 24 МБ.",
        );
        return;
      }

      const current = documentRef.current;
      const workspace = workspaceRef.current?.getBoundingClientRect();
      const fallbackCenter = screenToWorld(
        {
          x: Math.max(1, workspace?.width ?? window.innerWidth) / 2,
          y: Math.max(1, workspace?.height ?? window.innerHeight) / 2,
        },
        current.viewport,
      );
      const baseCenter = lastPointerWorldRef.current ?? fallbackCenter;
      const objects = [];
      const diagnostics: string[] = [];
      for (const [index, file] of candidates.entries()) {
        const prepared = await prepareEmbeddedImageFile(file);
        if (prepared.status === "error") {
          diagnostics.push(`${file.name}: ${prepared.code}`);
          continue;
        }
        objects.push(
          createEmbeddedImageObject({
            center: {
              x: baseCenter.x + index * 24,
              y: baseCenter.y + index * 24,
            },
            id: boardObjectId(`object:${crypto.randomUUID()}`),
            prepared: prepared.value,
          }),
        );
      }

      if (objects.length === 0) {
        setImageDiagnostic(
          diagnostics.length > 0
            ? `Изображения отклонены: ${diagnostics.join("; ")}`
            : "Не удалось подготовить изображения.",
        );
        return;
      }
      const result = commitCommand({
        ...createCommandMetadata(),
        kind: "core.objects.add",
        objects,
      });
      if (!result.ok) {
        setImageDiagnostic(result.error.message);
        return;
      }
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: objects.map(({ id }) => id),
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setActiveTool(selectionToolId);
      setClipboardNotice(`Вставлено изображений: ${objects.length}`);
      setImageDiagnostic(
        diagnostics.length === 0
          ? null
          : `Часть файлов пропущена: ${diagnostics.join("; ")}`,
      );
    },
    [commitCommand, createCommandMetadata],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (editing) {
        return;
      }
      const files = [...(event.clipboardData?.items ?? [])].flatMap((item) => {
        if (item.kind !== "file") {
          return [];
        }
        const file = item.getAsFile();
        return file === null ? [] : [file];
      });
      const images = files.filter(isSupportedEmbeddedImageCandidate);
      event.preventDefault();
      if (images.length > 0) {
        void importImageFiles(images);
      } else {
        pasteClipboard();
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [importImageFiles, pasteClipboard]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        closeShortcuts();
        return;
      }
      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (event.key === "Escape" && geometryPromptOpen) {
        event.preventDefault();
        setGeometryPromptOpen(false);
        return;
      }
      if (event.key === "Escape" && selectionInspectorObjectId !== null) {
        event.preventDefault();
        setSelectionInspectorObjectId(null);
        return;
      }
      if (
        event.key === "Escape" &&
        selectionStateRef.current.interaction.kind !== "idle"
      ) {
        event.preventDefault();
        const result = reduceSelectionInteraction(selectionStateRef.current, {
          kind: "cancel",
        });
        selectionStateRef.current = result.state;
        setSelectionState(result.state);
        activateTool(navigationToolId);
        return;
      }
      if (
        event.key === "Escape" &&
        (activeTool === handwrittenFunctionToolId ||
          handwrittenFunctionState.kind !== "idle")
      ) {
        event.preventDefault();
        activateTool(navigationToolId);
        return;
      }
      if (event.key === "Escape" && coordinatePlotEditor !== null) {
        return;
      }
      const accelerator = event.ctrlKey || event.metaKey;
      if (accelerator && !event.altKey && !editing) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || (key === "z" && event.shiftKey)) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (key === "c") {
          event.preventDefault();
          copySelection();
          return;
        }
        if (key === "x") {
          event.preventDefault();
          cutSelection();
          return;
        }
        if (key === "v") {
          return;
        }
      }
      if (event.altKey || event.ctrlKey || event.metaKey || editing) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key.toLowerCase() === "h") {
        activateTool(navigationToolId);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        createCoordinatePlot();
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        activateTool(laserToolId);
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        environment.features.handwrittenFunctions &&
        !readOnly
      ) {
        event.preventDefault();
        activateTool(handwrittenFunctionToolId);
        return;
      }
      const arrowDelta = {
        ArrowDown: { x: 0, y: event.shiftKey ? 10 : 1 },
        ArrowLeft: { x: event.shiftKey ? -10 : -1, y: 0 },
        ArrowRight: { x: event.shiftKey ? 10 : 1, y: 0 },
        ArrowUp: { x: 0, y: event.shiftKey ? -10 : -1 },
      }[event.key];
      if (
        arrowDelta !== undefined &&
        selectionStateRef.current.selectedObjectIds.length > 0 &&
        selectionStateRef.current.interaction.kind === "idle" &&
        !selectionIsLocked(
          documentRef.current,
          selectionStateRef.current.selectedObjectIds,
        )
      ) {
        event.preventDefault();
        commitSelectionMove({
          delta: arrowDelta,
          objectIds: selectionStateRef.current.selectedObjectIds,
        });
        setAccessibilityNotice(
          `Выделение перемещено: ${arrowDelta.x}, ${arrowDelta.y}`,
        );
        return;
      }
      if (
        event.key.toLowerCase() === lassoSelectionTool.shortcut.toLowerCase()
      ) {
        activateTool(lassoSelectionToolId);
        return;
      }
      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {
        activateTool(selectionToolId);
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectionStateRef.current.selectedObjectIds.length > 0 &&
        selectionStateRef.current.interaction.kind === "idle"
      ) {
        event.preventDefault();
        const current = documentRef.current;
        commitCommand(
          createDeleteSelectionCommand(
            createCommandMetadata(),
            current,
            selectionStateRef.current.selectedObjectIds,
          ),
        );
        return;
      }
      const tool = drawingTools.find(
        (candidate) =>
          candidate.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (tool !== undefined) {
        activateTool(tool.id);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    activateTool,
    activeTool,
    closeShortcuts,
    coordinatePlotEditor,
    createCoordinatePlot,
    commitCommand,
    geometryPromptOpen,
    handwrittenFunctionState.kind,
    readOnly,
    selectionInspectorObjectId,
    settingsOpen,
    commitSelectionMove,
    copySelection,
    cutSelection,
    pasteClipboard,
    redo,
    createCommandMetadata,
    shortcutsOpen,
    undo,
  ]);

  useEffect(() => {
    const result = reduceSelectionInteraction(selectionStateRef.current, {
      availableObjectIds: document.order,
      kind: "prune",
    });
    selectionStateRef.current = result.state;
    setSelectionState(result.state);
  }, [document.order]);

  useEffect(() => {
    if (
      selectionInspectorObjectId !== null &&
      (!Object.hasOwn(document.objects, selectionInspectorObjectId) ||
        !selectionState.selectedObjectIds.includes(selectionInspectorObjectId))
    ) {
      setSelectionInspectorObjectId(null);
    }
  }, [
    document.objects,
    selectionInspectorObjectId,
    selectionState.selectedObjectIds,
  ]);
  useEffect(() => {
    if (
      vertexConstructionObjectId !== null &&
      inspectTextShapeVertex(document, vertexConstructionObjectId) === null
    ) {
      setVertexConstructionObjectId(null);
    }
  }, [document, vertexConstructionObjectId]);

  const startHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      let state = handwrittenFunctionStateRef.current;
      const point = {
        timeMs: performance.now(),
        x: sample.point.x,
        y: sample.point.y,
      };
      if (state.kind === "idle") {
        state = applyHandwrittenFunctionAction({
          kind: "begin",
          sessionId: `handwriting-session:${crypto.randomUUID()}`,
          startedAtMs: point.timeMs,
        });
      }
      if (state.kind !== "collecting") return;
      setHandwrittenFunctionDiagnostic(null);
      applyHandwrittenFunctionAction({
        kind: "start-stroke",
        point,
        pointerId: sample.pointerId,
        strokeId: `handwriting-stroke:${crypto.randomUUID()}`,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const moveHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      applyHandwrittenFunctionAction({
        kind: "append-point",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const finishHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      applyHandwrittenFunctionAction({
        kind: "finish-stroke",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const cancelHandwrittenFunctionStroke = useCallback(
    (pointerId: number) => {
      applyHandwrittenFunctionAction({ kind: "cancel-stroke", pointerId });
    },
    [applyHandwrittenFunctionAction],
  );

  const startDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === geometryPlacementToolId) {
        placePendingGeometryRef.current(sample.point);
        return;
      }
      if (activeTool === laserToolId) {
        stopLaserTrailFade();
        setLaserPoint(sample.point);
        setLaserTrailOpacity(1);
        setLaserTrailPoints([sample.point]);
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        startHandwrittenFunctionStroke(sample);
        return;
      }
      if (!isDrawingToolId(activeTool)) {
        return;
      }
      if (activeTool === "drawing.smart-ink") {
        setSmartInkNotice(null);
      }
      applyDrawingAction({
        kind: "start",
        objectId: boardObjectId(`object:${crypto.randomUUID()}`),
        point: sample.point,
        polygonSides,
        pointerId: sample.pointerId,
        style: styleFor(activeTool),
        text: textDraft,
        tool: activeTool,
      });
    },
    [
      activeTool,
      applyDrawingAction,
      polygonSides,
      startHandwrittenFunctionStroke,
      stopLaserTrailFade,
      styleFor,
      textDraft,
    ],
  );

  const moveDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === laserToolId) {
        setLaserPoint(sample.point);
        setLaserTrailPoints((points) =>
          appendLaserTrailPoint(points, sample.point),
        );
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        moveHandwrittenFunctionStroke(sample);
        return;
      }
      applyDrawingAction({
        kind: "move",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [activeTool, applyDrawingAction, moveHandwrittenFunctionStroke],
  );

  const moveDrawingBatch = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      if (samples.length === 0) return;
      if (activeTool === laserToolId) {
        const finalSample = samples.at(-1)!;
        setLaserPoint(finalSample.point);
        setLaserTrailPoints((points) =>
          samples.reduce(
            (trail, sample) => appendLaserTrailPoint(trail, sample.point),
            points,
          ),
        );
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        let state = handwrittenFunctionStateRef.current;
        let diagnostic: HandwrittenFunctionSessionDiagnosticCode | null = null;
        for (const sample of samples) {
          const result = reduceHandwrittenFunctionSession(state, {
            kind: "append-point",
            point: {
              timeMs: performance.now(),
              x: sample.point.x,
              y: sample.point.y,
            },
            pointerId: sample.pointerId,
          });
          state = result.state;
          diagnostic = result.diagnostic ?? diagnostic;
        }
        handwrittenFunctionStateRef.current = state;
        setHandwrittenFunctionState(state);
        if (diagnostic !== null) {
          setHandwrittenFunctionDiagnostic(
            handwrittenSessionDiagnosticMessage(diagnostic),
          );
        }
        return;
      }

      let state = drawingStateRef.current;
      let diagnostic: string | null = null;
      for (const sample of samples) {
        const result = reduceDrawingInteraction(state, {
          kind: "move",
          point: sample.point,
          pointerId: sample.pointerId,
        });
        state = result.state;
        diagnostic = result.diagnostic;
      }
      drawingStateRef.current = state;
      setDrawingState(state);
      setDrawingDiagnostic(diagnostic);
    },
    [activeTool],
  );

  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === laserToolId) {
        setLaserTrailPoints((points) =>
          appendLaserTrailPoint(points, sample.point),
        );
        setLaserPoint(null);
        fadeLaserTrail();
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        finishHandwrittenFunctionStroke(sample);
        return;
      }
      applyDrawingAction(
        {
          kind: "finish",
          point: sample.point,
          pointerId: sample.pointerId,
        },
        activeTool === "drawing.smart-ink",
      );
    },
    [
      activeTool,
      applyDrawingAction,
      fadeLaserTrail,
      finishHandwrittenFunctionStroke,
    ],
  );

  const cancelDrawing = useCallback(
    (pointerId: number) => {
      if (activeTool === laserToolId) {
        setLaserPoint(null);
        clearLaserTrail();
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        cancelHandwrittenFunctionStroke(pointerId);
        return;
      }
      applyDrawingAction({ kind: "cancel", pointerId });
    },
    [
      activeTool,
      applyDrawingAction,
      cancelHandwrittenFunctionStroke,
      clearLaserTrail,
    ],
  );

  const applySelectionAction = useCallback(
    (action: SelectionAction) => {
      const result = reduceSelectionInteraction(
        selectionStateRef.current,
        action,
      );
      selectionStateRef.current = result.state;
      setSelectionState(result.state);
      if (result.completedMove !== null) {
        commitSelectionMove(result.completedMove);
      }
    },
    [commitSelectionMove],
  );

  const startSelection = useCallback(
    (sample: SelectionPointerStartSample) => {
      if (sample.additive && sample.objectId !== null) {
        const command = createTextShapeContourPointCommand({
          document: documentRef.current,
          hitObjectId: sample.objectId,
          metadata: createCommandMetadata(),
          token: crypto.randomUUID(),
          worldPoint: sample.point,
        });
        if (command !== null) {
          contourPointPointerRef.current = sample.pointerId;
          if (commitCommand(command).ok) {
            const label = command.objects.find(
              (object) => object.kind === "drawing.text",
            );
            setAccessibilityNotice(
              `На контуре добавлена точка ${label?.text ?? ""}`.trim(),
            );
          }
          return;
        }
      }
      const vertex = inspectTextShapeVertexNearPoint({
        document: documentRef.current,
        hitObjectId: sample.objectId,
        maximumDistance: 18 / scene.viewport.zoom,
        point: sample.point,
        scene,
      });
      const effectiveObjectId =
        sample.objectId ?? vertex?.vertexObjectId ?? null;
      if (effectiveObjectId !== null && !isSelectionToolId(activeTool)) {
        activateTool(selectionToolId);
      }
      setVertexConstructionObjectId(vertex?.vertexObjectId ?? null);
      if (vertex !== null) {
        setSelectionInspectorObjectId(vertex.vertexObjectId);
      }
      const hitObjectIds =
        effectiveObjectId === null
          ? []
          : expandSelectionObjectIds(document, [effectiveObjectId]);
      applySelectionAction({
        additive: sample.additive,
        areaKind: activeTool === lassoSelectionToolId ? "lasso" : "marquee",
        areaOperation:
          sample.areaOperation ?? (sample.additive ? "add" : "replace"),
        hitObjectIds,
        kind: "start",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [
      activeTool,
      activateTool,
      applySelectionAction,
      commitCommand,
      createCommandMetadata,
      document,
      scene,
    ],
  );

  const moveSelection = useCallback(
    (sample: WorldPointerSample) => {
      applySelectionAction({
        kind: "move",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applySelectionAction],
  );

  const finishSelection = useCallback(
    (sample: WorldPointerSample) => {
      if (contourPointPointerRef.current === sample.pointerId) {
        contourPointPointerRef.current = null;
        return;
      }
      const interaction = selectionStateRef.current.interaction;
      const areaObjectIds =
        interaction.kind === "marquee"
          ? expandSelectionObjectIds(
              document,
              selectObjectIdsInRect(
                scene,
                normalizeRect(interaction.start, sample.point),
              ),
            )
          : interaction.kind === "lasso"
            ? expandSelectionObjectIds(
                document,
                selectObjectIdsInLasso(scene, [
                  ...interaction.points,
                  sample.point,
                ]),
              )
            : undefined;
      applySelectionAction({
        kind: "finish",
        ...(areaObjectIds === undefined ? {} : { areaObjectIds }),
        point: sample.point,
        pointerId: sample.pointerId,
      });
      if (interaction.kind === "lasso") {
        setAccessibilityNotice(
          `Лассо завершено: выбрано ${areaObjectIds?.length ?? 0}`,
        );
      }
    },
    [applySelectionAction, document, scene],
  );

  const cancelSelection = useCallback(
    (pointerId: number) => {
      if (contourPointPointerRef.current === pointerId) {
        contourPointPointerRef.current = null;
        return;
      }
      applySelectionAction({ kind: "cancel", pointerId });
    },
    [applySelectionAction],
  );

  const setSelectionLock = useCallback(
    (locked: boolean) => {
      const current = documentRef.current;
      commitCommand(
        createSetSelectionLockCommand(
          createCommandMetadata(),
          current,
          selectionStateRef.current.selectedObjectIds,
          locked,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const deleteSelection = useCallback(() => {
    const current = documentRef.current;
    commitCommand(
      createDeleteSelectionCommand(
        createCommandMetadata(),
        current,
        selectionStateRef.current.selectedObjectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata]);

  const setGeneratedFigureLabelsVisible = useCallback(
    (visible: boolean) => {
      const figure = inspectTextShapeFigure(
        documentRef.current,
        selectionStateRef.current.selectedObjectIds,
      );
      if (figure === null || figure.labelObjectIds.length === 0) return;
      commitCommand(
        createSetLayerVisibilityCommand(
          createCommandMetadata(),
          figure.labelObjectIds,
          visible,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const moveGeneratedFigureLabels = useCallback(
    (delta: Vec2) => {
      const current = documentRef.current;
      const figure = inspectTextShapeFigure(
        current,
        selectionStateRef.current.selectedObjectIds,
      );
      if (figure === null || figure.labelObjectIds.length === 0) return;
      if (
        commitCommand({
          ...createCommandMetadata(),
          delta,
          kind: "core.objects.move",
          objectIds: figure.labelObjectIds,
        }).ok
      ) {
        setAccessibilityNotice("Положение подписей вершин изменено");
      }
    },
    [commitCommand, createCommandMetadata],
  );

  const buildVertexConstruction = useCallback(
    (kind: VertexConstructionKind) => {
      const objectId = vertexConstructionObjectId;
      if (objectId === null) return;
      const command = createVertexConstructionCommand({
        document: documentRef.current,
        kind,
        metadata: createCommandMetadata(),
        token: crypto.randomUUID(),
        vertexObjectId: objectId,
      });
      if (command === null) return;
      const result = commitCommand(command);
      if (result.ok) {
        setAccessibilityNotice("Дополнительное построение добавлено");
      }
    },
    [commitCommand, createCommandMetadata, vertexConstructionObjectId],
  );

  const applyGeometryPromptResult = useCallback(
    (result: GeometryPromptResult) => {
      if (result.kind === "cancelled") {
        setGeometryPromptState({ kind: "idle" });
        return;
      }
      const lastRequestId = result.requestIds.at(-1);
      if (result.kind === "needs-clarification") {
        if (lastRequestId !== undefined) {
          setGeometryPromptState({
            kind: "needs-clarification",
            ambiguities: result.ambiguities,
            requestId: lastRequestId,
          });
        }
        return;
      }
      if (result.kind === "domain-error") {
        if (lastRequestId !== undefined) {
          setGeometryPromptState({
            kind: "domain-error",
            requestId: lastRequestId,
            warnings: result.warnings,
          });
        }
        return;
      }
      if (result.kind === "failure") {
        setGeometryPromptState(result);
        return;
      }

      const applied = commitCommand(result.command);
      if (!applied.ok) {
        setGeometryPromptState({
          kind: "failure",
          code: applied.error.code,
          requestId: lastRequestId ?? null,
          retryable: false,
          stage: "import",
        });
        return;
      }
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: [...result.command.importRecord.boardObjectIds],
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setActiveTool(selectionToolId);
      if (lastRequestId !== undefined) {
        setGeometryPromptState({
          kind: "success",
          objectCount: result.command.objects.length,
          requestId: lastRequestId,
        });
      }
    },
    [commitCommand],
  );

  const runGeometryPromptAt = useCallback(
    (targetWorldCenter: Vec2, prompt: string) => {
      if (geometryOsClient === undefined) return;
      geometryOperationRef.current?.cancel();
      const enrichedPrompt = `${prompt.trim()}. ${
        autoLabelGeometryVertices
          ? "Подпиши все вершины латинскими буквами."
          : "Оставь вершины без подписей."
      }`;
      lastGeometryOsPlacementRef.current = { point: targetWorldCenter, prompt };
      const operation = startGeometryPrompt({
        actorId: commandActorId,
        client: geometryOsClient,
        createToken: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        onProgress: (progress) => {
          setGeometryPromptState({ kind: "running", ...progress });
        },
        prompt: enrichedPrompt,
        targetWorldCenter,
      });
      geometryOperationRef.current = operation;
      void operation.result.then((result) => {
        if (geometryOperationRef.current !== operation) {
          return;
        }
        geometryOperationRef.current = null;
        applyGeometryPromptResult(result);
      });
    },
    [
      applyGeometryPromptResult,
      autoLabelGeometryVertices,
      commandActorId,
      geometryOsClient,
    ],
  );

  const armGeometryPlacement = useCallback(() => {
    const resolved = resolveTextShape(geometryPrompt);
    if (resolved !== undefined) {
      setPendingGeometryPlacement({ definition: resolved, kind: "catalog" });
      setGeometryPromptState({
        kind: "awaiting-placement",
        label: resolved.label,
        source: "catalog",
      });
      setActiveTool(geometryPlacementToolId);
      return;
    }
    if (geometryOsClient === undefined) {
      setGeometryPromptState({
        code: "geometryos.unavailable",
        kind: "failure",
        requestId: null,
        retryable: false,
        stage: "generate",
      });
      return;
    }
    const prompt = geometryPrompt.trim();
    setPendingGeometryPlacement({ kind: "geometryos", prompt });
    setGeometryPromptState({
      kind: "awaiting-placement",
      label: "Построение по тексту",
      source: "geometryos",
    });
    setActiveTool(geometryPlacementToolId);
  }, [geometryOsClient, geometryPrompt]);

  const placePendingGeometry = useCallback(
    (point: Vec2) => {
      const pending = pendingGeometryPlacement;
      if (pending === null) return;
      setPendingGeometryPlacement(null);
      if (pending.kind === "geometryos") {
        setActiveTool(navigationToolId);
        runGeometryPromptAt(point, pending.prompt);
        return;
      }
      const command = createTextShapePlacementCommand({
        autoLabelVertices: autoLabelGeometryVertices,
        definition: pending.definition,
        metadata: createCommandMetadata(),
        placement: point,
        token: crypto.randomUUID(),
      });
      const result = commitCommand(command);
      if (!result.ok) {
        setGeometryPromptState({
          code: result.error.code,
          kind: "failure",
          requestId: null,
          retryable: false,
          stage: "import",
        });
        return;
      }
      const selected: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds: command.objects.map(({ id }) => id),
      };
      selectionStateRef.current = selected;
      setSelectionState(selected);
      setSelectionInspectorObjectId(command.objects[0]?.id ?? null);
      setActiveTool(selectionToolId);
      setGeometryPromptOpen(false);
      setGeometryPromptState({
        kind: "success",
        objectCount: command.objects.length,
        requestId: null,
      });
      setAccessibilityNotice(`${pending.definition.label} построена`);
    },
    [
      autoLabelGeometryVertices,
      commitCommand,
      createCommandMetadata,
      pendingGeometryPlacement,
      runGeometryPromptAt,
    ],
  );
  placePendingGeometryRef.current = placePendingGeometry;

  const retryGeometryPrompt = useCallback(() => {
    const previous = lastGeometryOsPlacementRef.current;
    if (previous !== null) runGeometryPromptAt(previous.point, previous.prompt);
  }, [runGeometryPromptAt]);

  const resetViewport = () => {
    commitViewport({ offset: { x: 160, y: 90 }, zoom: 1 });
  };
  const firstObject = scene.items[0]?.object;
  const selectedObjects = selectionState.selectedObjectIds.flatMap((id) => {
    const object = document.objects[id];
    return object === undefined ? [] : [object];
  });
  const selectedTextShapeFigure = inspectTextShapeFigure(
    document,
    selectionState.selectedObjectIds,
  );
  const selectedTextShapeVertex =
    vertexConstructionObjectId === null
      ? null
      : inspectTextShapeVertex(document, vertexConstructionObjectId);
  const selectedStyle = scene.items.find(({ object }) =>
    selectionState.selectedObjectIds.includes(object.id),
  )?.object.style;
  const selectedTextId =
    selectionState.selectedObjectIds.length === 1
      ? selectionState.selectedObjectIds[0]
      : undefined;
  const selectedEditableText =
    selectedTextId === undefined ? undefined : document.objects[selectedTextId];
  const transformableObjectIds =
    coordinatePlotEditor === null &&
    isSelectionToolId(activeTool) &&
    selectionState.interaction.kind === "idle" &&
    selectedObjects.length > 0 &&
    selectedObjects.every(
      (object) =>
        !object.locked &&
        object.groupId === null &&
        object.source.kind === "user",
    )
      ? selectionState.selectedObjectIds
      : [];
  const canGroup =
    selectedObjects.length >= 2 &&
    selectedObjects.every(
      (object) => object.groupId === null && object.source.kind === "user",
    );
  const selectedGroupIds = [
    ...new Set(
      selectedObjects.flatMap(({ groupId }) =>
        groupId === null ? [] : [groupId],
      ),
    ),
  ];
  const importRootGroupIds = new Set(
    Object.values(document.geometryImports).flatMap((record) =>
      record === undefined ? [] : [record.rootGroupId],
    ),
  );
  const canUngroup =
    selectedGroupIds.length > 0 &&
    selectedGroupIds.every((id) => !importRootGroupIds.has(id));
  const handwrittenFunctionCanRecognize =
    handwrittenFunctionState.kind !== "idle" &&
    handwrittenFunctionState.kind !== "recognizing" &&
    handwrittenFunctionState.strokes.length > 0 &&
    (handwrittenFunctionState.kind !== "collecting" ||
      handwrittenFunctionState.activeStroke === null) &&
    (mathInkRecognizer !== undefined ||
      handwrittenFunctionSourceObjects === null);
  const handwrittenFunctionCanBuild =
    handwrittenFunctionState.kind !== "recognizing" &&
    handwrittenFunctionDraftCandidate !== null &&
    handwrittenFunctionPlotObject !== null &&
    handwrittenFunctionSourceApplies;
  const handwrittenFunctionPanelOpen =
    environment.features.handwrittenFunctions &&
    (activeTool === handwrittenFunctionToolId ||
      handwrittenFunctionState.kind !== "idle");
  const selectionInspectorOpen =
    coordinatePlotEditor === null &&
    selectionInspectorObjectId !== null &&
    selectionState.selectedObjectIds.includes(selectionInspectorObjectId);

  return (
    <main className="board-app board-app--minimal">
      <h1 className="visually-hidden">TutorBoard</h1>
      <section
        className="workspace board-workspace--minimal"
        aria-label="Рабочая область доски"
        ref={workspaceRef}
        tabIndex={-1}
      >
        {persistenceNotice === null ? null : (
          <div className="board-toast is-info" role="status">
            {persistenceNotice}
          </div>
        )}
        {imageDiagnostic === null ? null : (
          <div className="board-toast is-error" role="alert">
            {imageDiagnostic}
          </div>
        )}
        {clipboardNotice === null ? null : (
          <div className="board-toast is-info" role="status">
            {clipboardNotice}
          </div>
        )}
        {smartInkNotice === null ? null : (
          <div className="board-toast is-info" role="status">
            {smartInkNotice}
          </div>
        )}
        {persistenceStatus.kind === "error" ||
        persistenceStatus.kind === "conflict" ? (
          <div className="board-toast is-error" role="alert">
            <strong>{persistenceStatus.label}</strong>
            {persistenceStatus.detail === undefined ? null : (
              <span>{persistenceStatus.detail}</span>
            )}
            {persistenceStatus.retryable === true &&
            onRetryPersistence !== undefined ? (
              <button onClick={onRetryPersistence} type="button">
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
        <div aria-atomic="true" aria-live="polite" className="visually-hidden">
          {accessibilityNotice}
        </div>
        <BoardStage
          coordinatePlotInteraction={coordinatePlotInteraction}
          drawingModeKey={
            isDrawingToolId(activeTool) ||
            activeTool === handwrittenFunctionToolId ||
            activeTool === laserToolId ||
            activeTool === geometryPlacementToolId
              ? activeTool
              : null
          }
          laserActive={activeTool === laserToolId}
          laserPoint={laserPoint}
          laserTrailOpacity={laserTrailOpacity}
          laserTrailPoints={laserTrailPoints}
          onCanvasContextMenuRequest={(request) => {
            setClearCanvasConfirmationOpen(false);
            setCanvasContextMenu(request);
          }}
          onWorldPointerBatch={moveDrawingBatch}
          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}
          onWorldPointerHover={(cursor) => {
            lastPointerWorldRef.current = cursor;
            if (activeTool === laserToolId) setLaserPoint(cursor);
            onPresenceChange?.({
              cursor,
              selectedObjectIds: selectionStateRef.current.selectedObjectIds,
              viewport: {
                x: documentRef.current.viewport.offset.x,
                y: documentRef.current.viewport.offset.y,
                zoom: documentRef.current.viewport.zoom,
              },
            });
          }}
          onWorldPointerStart={startDrawing}
          onObjectSettingsRequest={requestObjectSettings}
          onPanModeRequest={() => activateTool(navigationToolId)}
          onSelectionPointerCancel={cancelSelection}
          onSelectionPointerFinish={finishSelection}
          onSelectionPointerMove={moveSelection}
          onSelectionPointerStart={startSelection}
          onSelectionTransform={commitSelectionTransform}
          onViewportCommit={commitViewport}
          panMode={activeTool === navigationToolId}
          previewItems={previewItems}
          registry={registry}
          remoteCursors={remoteCursors}
          scene={scene}
          selectedObjectIds={selectionState.selectedObjectIds}
          selectionBounds={selectionBounds}
          selectionLasso={selectionLasso}
          selectionMarquee={selectionMarquee}
          selectionModeKey={isSelectionToolId(activeTool) ? activeTool : null}
          selectionPreviewDelta={renderedSelectionPreviewDelta}
          transformableObjectIds={transformableObjectIds}
          wetInkStyle={wetInkStyle}
        />
        {canvasContextMenu === null ? null : (
          <CanvasContextMenu
            canClear={document.order.length > 0}
            canPaste={clipboard !== null}
            disabled={readOnly}
            onClearRequest={() => {
              setCanvasContextMenu(null);
              setClearCanvasConfirmationOpen(true);
            }}
            onClose={() => setCanvasContextMenu(null)}
            onPaste={() => {
              pasteClipboard();
              setCanvasContextMenu(null);
            }}
            onText={() => {
              insertTextAt(canvasContextMenu.worldPoint);
              setCanvasContextMenu(null);
            }}
            position={canvasContextMenu.clientPoint}
          />
        )}
        {clearCanvasConfirmationOpen ? (
          <ClearCanvasDialog
            objectCount={document.order.length}
            onCancel={() => setClearCanvasConfirmationOpen(false)}
            onConfirm={clearCanvas}
          />
        ) : null}
        {coordinatePlotEditor === null ? null : (
          <>
            <CoordinatePlotNavigationControls
              axis={coordinatePlotEditor.zoomAxis}
              onAxisChange={setCoordinatePlotZoomAxis}
              onFit={fitCoordinatePlotEditorViewport}
              onReset={resetCoordinatePlotEditorViewport}
              onZoomIn={() => zoomCoordinatePlotEditor(1 / 1.25)}
              onZoomOut={() => zoomCoordinatePlotEditor(1.25)}
            />
            <CoordinatePlotEditorPanel
              definition={coordinatePlotEditor.draft}
              fallbackFocusRef={workspaceRef}
              key={coordinatePlotEditor.objectId}
              dirty={
                coordinatePlotEditor.draft !== coordinatePlotEditor.expected
              }
              issues={validateCoordinatePlotEditorDefinition(
                coordinatePlotEditor.draft,
              )}
              onAddParameter={addCoordinatePlotEditorParameter}
              onAddSeries={addCoordinatePlotEditorSeries}
              onClose={() => setCoordinatePlotEditor(null)}
              onDefinitionChange={updateCoordinatePlotDraft}
              onSave={saveCoordinatePlotEditor}
              onSelectedSeriesChange={(seriesId) =>
                selectCoordinatePlotSeries(
                  coordinatePlotEditor.objectId,
                  seriesId,
                )
              }
              readOnly={readOnly}
              selectedSeriesId={coordinatePlotEditor.selectedSeriesId}
            />
          </>
        )}
        {handwrittenFunctionPanelOpen ? (
          <HandwrittenFunctionPanel
            canBuild={handwrittenFunctionCanBuild}
            canRecognize={handwrittenFunctionCanRecognize}
            diagnostic={handwrittenFunctionDiagnostic}
            draftCandidate={handwrittenFunctionDraftCandidate}
            draftExpression={handwrittenFunctionDraft}
            draftIssue={handwrittenFunctionDraftIssue}
            interpretation={handwrittenFunctionInterpretation}
            onBuild={buildHandwrittenFunctionPlot}
            onCandidateSelect={setHandwrittenFunctionDraft}
            onClear={clearHandwrittenFunction}
            onDraftChange={setHandwrittenFunctionDraft}
            onKeepInk={() => activateTool(navigationToolId)}
            onRecognize={recognizeHandwrittenFunction}
            recognizerAvailable={mathInkRecognizer !== undefined}
            session={handwrittenFunctionState}
            sourcePersisted={handwrittenFunctionSourceObjects !== null}
          />
        ) : null}
        {geometryPromptOpen ? (
          <GeometryPromptPanel
            autoLabelVertices={autoLabelGeometryVertices}
            onCancel={() => geometryOperationRef.current?.cancel()}
            onAutoLabelVerticesChange={setAutoLabelGeometryVertices}
            onChooseClarification={(option) => {
              setGeometryPrompt(option);
              setGeometryPromptState({ kind: "idle" });
            }}
            onPromptChange={(prompt) => {
              setGeometryPrompt(prompt);
              if (geometryPromptState.kind !== "running")
                setGeometryPromptState({ kind: "idle" });
            }}
            onRetry={retryGeometryPrompt}
            onSubmit={armGeometryPlacement}
            onSuggestionChoose={(definition) => {
              setGeometryPrompt(definition.label);
              setGeometryPromptState({ kind: "idle" });
            }}
            prompt={geometryPrompt}
            remoteAvailable={geometryOsClient !== undefined}
            state={geometryPromptState}
            suggestions={geometrySuggestions}
          />
        ) : null}
        <BoardToolDock
          activeStyle={
            isDrawingToolId(activeTool) ? styleFor(activeTool) : null
          }
          activeTool={activeTool}
          canRedo={historyEnabled && history.future.length > 0}
          canUndo={
            historyEnabled
              ? history.past.length > 0
              : collaborativeUndoAvailable
          }
          drawingTools={drawingTools}
          generatedFigureLabelsVisible={
            selectedTextShapeFigure?.labelsVisible ?? null
          }
          geometryAvailable
          geometryOpen={geometryPromptOpen}
          handwrittenFunctionsEnabled={
            environment.features.handwrittenFunctions
          }
          imageAccept={embeddedImageAccept}
          onActivate={(tool) => activateTool(tool as ActiveToolId)}
          onCreatePlot={createCoordinatePlot}
          onDeleteSelection={deleteSelection}
          onGeometryToggle={() => setGeometryPromptOpen((current) => !current)}
          onGeneratedFigureLabelsChange={setGeneratedFigureLabelsVisible}
          onGeneratedFigureLabelsMove={moveGeneratedFigureLabels}
          onImageFiles={(files) => void importImageFiles(files)}
          onOpenSettings={() => {
            setGeometryPromptOpen(false);
            setSettingsOpen(true);
          }}
          onPolygonSidesChange={setPolygonSides}
          onRedo={redo}
          canTransformSelection={
            transformableObjectIds.length > 0 ||
            selectedTextShapeFigure !== null
          }
          onSelectionLockChange={setSelectionLock}
          onSelectionStyleChange={updateSelectionStyle}
          onSelectedTextCommit={(text) => {
            if (isEditableTextObject(selectedEditableText)) {
              updateSelectedText(selectedEditableText.id, text);
            }
          }}
          onTransformSelection={transformSelectionBy}
          onVertexConstruction={buildVertexConstruction}
          onStyleChange={updateStyle}
          onTextDraftChange={setTextDraft}
          onUndo={undo}
          readOnly={readOnly}
          polygonSides={polygonSides}
          selectedCount={selectionState.selectedObjectIds.length}
          selectedLocked={selectedLocked}
          selectedStyle={selectedStyle}
          selectedText={
            isEditableTextObject(selectedEditableText)
              ? selectedEditableText.text
              : null
          }
          selectedVertexName={selectedTextShapeVertex?.vertexName ?? null}
          selectionInspectorOpen={selectionInspectorOpen}
          settingsOpen={settingsOpen}
          textDraft={textDraft}
          vertexConstructions={
            selectedTextShapeVertex?.availableConstructions ?? []
          }
        />
        <BoardSettingsDialog
          onClose={() => {
            if (!shortcutsOpen) setSettingsOpen(false);
          }}
          open={settingsOpen}
          statusKind={persistenceStatus.kind}
          statusLabel={persistenceStatus.label}
        >
          <section className="board-settings-section">
            <h3>Документ</h3>
            <p>{document.title}</p>
            <p>
              {persistenceStatus.label}
              {persistenceStatus.detail === undefined
                ? ""
                : ` · ${persistenceStatus.detail}`}
            </p>
            <div className="board-settings-actions">
              <button
                disabled={selectionState.selectedObjectIds.length === 0}
                onClick={copySelection}
                type="button"
              >
                Копировать
              </button>
              <button
                disabled={selectionState.selectedObjectIds.length === 0}
                onClick={cutSelection}
                type="button"
              >
                Вырезать
              </button>
              <button
                disabled={clipboard === null}
                onClick={pasteClipboard}
                type="button"
              >
                Вставить
              </button>
              {onImportDocument === undefined ? null : (
                <label className="board-settings-file">
                  Импорт JSON
                  <input
                    accept="application/json,.json"
                    aria-label="Импорт документа JSON"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file !== undefined) onImportDocument(file);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
              )}
              {onExportDocument === undefined ? null : (
                <button
                  onClick={() => onExportDocument(document)}
                  type="button"
                >
                  Экспорт JSON
                </button>
              )}
              {onExportSvgSnapshot === undefined ? null : (
                <button
                  onClick={() => onExportSvgSnapshot(document)}
                  type="button"
                >
                  Снимок SVG
                </button>
              )}
              {onExportPngSnapshot === undefined ? null : (
                <button
                  onClick={() => onExportPngSnapshot(document)}
                  type="button"
                >
                  Снимок PNG
                </button>
              )}
              {onExportPdfSnapshot === undefined ? null : (
                <button
                  onClick={() => onExportPdfSnapshot(document)}
                  type="button"
                >
                  Сохранить PDF
                </button>
              )}
              {onShareBoard === undefined ? (
                <button
                  disabled
                  title="Откройте доску из занятия, чтобы включить совместную работу"
                  type="button"
                >
                  Совместная ссылка
                </button>
              ) : (
                <button onClick={onShareBoard} type="button">
                  Копировать ссылку на доску
                </button>
              )}
            </div>
          </section>
          <section className="board-settings-section">
            <h3>
              Объекты и слои <span>{layers.length}</span>
            </h3>
            <div className="board-settings-actions">
              <button
                disabled={!canGroup}
                onClick={groupSelection}
                type="button"
              >
                Сгруппировать
              </button>
              <button
                disabled={!canUngroup}
                onClick={ungroupSelection}
                type="button"
              >
                Разгруппировать
              </button>
            </div>
            {layers.length === 0 ? (
              <p>На доске пока нет объектов.</p>
            ) : (
              <ol className="board-settings-layers">
                {layers.map((layer) => (
                  <li key={layer.id}>
                    <button
                      className="layer-name"
                      onClick={() => selectLayer(layer.id)}
                      type="button"
                    >
                      {layer.kind}
                    </button>
                    <button
                      aria-label={
                        layer.visible
                          ? `Скрыть ${layer.id}`
                          : `Показать ${layer.id}`
                      }
                      onClick={() =>
                        toggleLayerVisibility(layer.id, !layer.visible)
                      }
                      type="button"
                    >
                      {layer.visible ? "◉" : "○"}
                    </button>
                    <button
                      aria-label={
                        layer.locked
                          ? `Разблокировать слой ${layer.id}`
                          : `Заблокировать слой ${layer.id}`
                      }
                      onClick={() => toggleLayerLock(layer.id, !layer.locked)}
                      type="button"
                    >
                      {layer.locked ? "🔒" : "🔓"}
                    </button>
                    <button
                      aria-label={`На передний план ${layer.id}`}
                      onClick={() => reorderLayer(layer.id, "front")}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`На задний план ${layer.id}`}
                      onClick={() => reorderLayer(layer.id, "back")}
                      type="button"
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="board-settings-section">
            <h3>Вид</h3>
            <dl className="board-settings-facts">
              <div>
                <dt>Масштаб</dt>
                <dd>{Math.round(document.viewport.zoom * 100)}%</dd>
              </div>
              <div>
                <dt>Положение</dt>
                <dd>
                  x {Math.round(document.viewport.offset.x)} · y{" "}
                  {Math.round(document.viewport.offset.y)}
                </dd>
              </div>
            </dl>
            <button onClick={resetViewport} type="button">
              Центрировать доску
            </button>
          </section>
          {settingsExtra}
          <section className="board-settings-section">
            <h3>Справка и приложение</h3>
            <div className="board-settings-actions">
              <button
                aria-expanded={shortcutsOpen}
                aria-haspopup="dialog"
                onClick={() => setShortcutsOpen(true)}
                ref={shortcutsButtonRef}
                type="button"
              >
                Горячие клавиши
              </button>
              {onExportDiagnostics === undefined ? null : (
                <button onClick={onExportDiagnostics} type="button">
                  Диагностика
                </button>
              )}
              <a href="#/documents">Все документы</a>
              <a href="#/settings">Настройки приложения</a>
              {environment.features.developmentDiagnostics ? (
                <a href="#/diagnostics">Диагностика приложения</a>
              ) : null}
            </div>
            <p>
              BoardDocument {boardDocumentSchemaVersion} · {environment.stage}
            </p>
          </section>
        </BoardSettingsDialog>
        {shortcutsOpen ? (
          <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeShortcuts();
            }}
          >
            <section
              aria-labelledby="shortcuts-title"
              aria-modal="true"
              className="shortcuts-dialog"
              ref={shortcutsDialogRef}
              role="dialog"
            >
              <div className="dialog-heading">
                <h2 id="shortcuts-title">Горячие клавиши</h2>
                <button
                  aria-label="Закрыть горячие клавиши"
                  autoFocus
                  onClick={closeShortcuts}
                  type="button"
                >
                  ×
                </button>
              </div>
              <dl>
                <div>
                  <dt>H / V / A / P / I / L / R / E / N / T / F / G / K</dt>
                  <dd>Инструменты и график</dd>
                </div>
                <div>
                  <dt>Двойной щелчок правой кнопкой</dt>
                  <dd>Настройки объекта</dd>
                </div>
                <div>
                  <dt>Ctrl/Cmd + C, X, V</dt>
                  <dd>Буфер обмена</dd>
                </div>
                <div>
                  <dt>Ctrl/Cmd + Z / Shift+Z</dt>
                  <dd>Отмена и повтор</dd>
                </div>
                <div>
                  <dt>Delete / Escape / ?</dt>
                  <dd>Удалить, закрыть, открыть справку</dd>
                </div>
              </dl>
            </section>
          </div>
        ) : null}
        <div
          className="visually-hidden"
          data-testid="minimal-board-diagnostics"
        >
          <span>BoardDocument {boardDocumentSchemaVersion}</span>
          <span data-testid="first-object-position">
            Объект: {firstObject?.position.x ?? 0},{" "}
            {firstObject?.position.y ?? 0}
          </span>
          <span data-testid="first-object-transform">
            Масштаб: {firstObject?.scale.x ?? 1}, {firstObject?.scale.y ?? 1} ·
            Поворот: {firstObject?.rotation ?? 0}°
          </span>
          <span data-testid="object-count">
            {document.order.length} объекта
          </span>
          <span data-testid="interaction-state">{drawingState.kind}</span>
          <span data-testid="history-depth">
            {history.past.length}/{history.future.length}
          </span>
          <span data-testid="selection-count">
            {selectionState.selectedObjectIds.length} выбрано
          </span>
          <span data-testid="viewport-zoom">
            {Math.round(document.viewport.zoom * 100)}%
          </span>
          <span data-testid="viewport-offset">
            x {Math.round(document.viewport.offset.x)} · y{" "}
            {Math.round(document.viewport.offset.y)}
          </span>
          <span data-testid="geometry-import-count">
            {Object.keys(document.geometryImports).length} построений
          </span>
          <span data-testid="group-count">
            {Object.keys(document.groups).length} групп
          </span>
          <span data-testid="persistence-status">
            {persistenceStatus.label}
          </span>
          {layers.map((layer) => (
            <span key={layer.id}>{layer.kind}</span>
          ))}
          {drawingDiagnostic === null ? null : (
            <span data-testid="drawing-diagnostic">{drawingDiagnostic}</span>
          )}
          {commandError === null ? null : (
            <span role="alert">{commandError}</span>
          )}
        </div>
      </section>
    </main>
  );
}
