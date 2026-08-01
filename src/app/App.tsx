import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoardStage,
  createDefaultKonvaRendererRegistry,
  type BoardObjectTransformSnapshot,
  type CoordinatePlotRenderInteraction,
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
  type PlotSeriesId,
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
  createAcceptSmartInkProposalCommand,
  proposeSmartInkReplacement,
  smartInkProposalStillApplies,
} from "../modules/smart-ink/public";
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
  validateCoordinatePlotEditorDefinition,
} from "../modules/coordinate-plot-editor/public";
import { ColorPalette } from "./ColorPalette";
import { CoordinatePlotEditorPanel } from "./CoordinatePlotEditorPanel";
import {
  createEmbeddedImageObject,
  embeddedImageAccept,
  embeddedImageImportLimits,
  isSupportedEmbeddedImageCandidate,
  prepareEmbeddedImageFile,
} from "./image-import";
import { StrokeStylePalette } from "./StrokeStylePalette";
import { readEnvironment } from "./configuration/environment";
import {
  GeometryPromptPanel,
  type GeometryPromptViewState,
} from "./GeometryPromptPanel";
import "./styles.css";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");
const navigationToolId = "navigation.pan" as const;
type ActiveToolId = typeof navigationToolId | SelectionToolId | DrawingToolId;
const initialDrawingState: DrawingInteractionState = { kind: "idle" };

interface CoordinatePlotEditorSession {
  readonly draft: CoordinatePlotDefinition;
  readonly expected: CoordinatePlotDefinition;
  readonly objectId: BoardObjectId;
  readonly selectedSeriesId: PlotSeriesId | null;
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
  readonly onExportSvgSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportDiagnostics?: () => void;
  readonly onImportDocument?: (file: File) => void;
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
  initialDocument,
  onCommandCommitted,
  onCollaborativeUndo,
  onDocumentChange,
  onExportDocument,
  onExportPngSnapshot,
  onExportSvgSnapshot,
  onExportDiagnostics,
  onImportDocument,
  onPresenceChange,
  onRetryPersistence,
  persistenceNotice = null,
  persistenceStatus = { kind: "idle", label: "Локальное сохранение" },
  readOnly = false,
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
  const [selectionState, setSelectionState] = useState(initialSelectionState);
  const selectionStateRef = useRef<SelectionState>(initialSelectionState);
  const [coordinatePlotEditor, setCoordinatePlotEditor] =
    useState<CoordinatePlotEditorSession | null>(null);
  const [textDraft, setTextDraft] = useState("Новый текст");
  const [imageDiagnostic, setImageDiagnostic] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<BoardClipboardPayload | null>(
    null,
  );
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [accessibilityNotice, setAccessibilityNotice] = useState<string | null>(
    null,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsDialogRef = useRef<HTMLElement>(null);
  const [geometryPrompt, setGeometryPrompt] = useState(
    "Построй треугольник ABC и высоту AH",
  );
  const [geometryPromptState, setGeometryPromptState] =
    useState<GeometryPromptViewState>({ kind: "idle" });
  const geometryOperationRef = useRef<GeometryPromptOperation | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const lastPointerWorldRef = useRef<Vec2 | null>(null);
  const { commandError, history } = boardState;
  const document = history.present;
  const documentRef = useRef(document);
  useEffect(() => {
    documentRef.current = document;
  }, [document]);
  useEffect(
    () => () => {
      geometryOperationRef.current?.cancel();
    },
    [],
  );
  const registry = useMemo(() => createDefaultKonvaRendererRegistry(), []);
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
  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () =>
      drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }],
    [drawingPreview],
  );
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
    [commitSelectionTransform],
  );

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    queueMicrotask(() => shortcutsButtonRef.current?.focus());
  }, []);

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
                : "Smart Ink: фигура не распознана, исходный штрих сохранён.",
            );
          }
        }
      }
    },
    [commitCommand, commitDrawingObject, createCommandMetadata],
  );

  const activateTool = useCallback(
    (tool: ActiveToolId) => {
      applyDrawingAction({ kind: "cancel" });
      setSmartInkNotice(null);
      const selectionResult = reduceSelectionInteraction(
        selectionStateRef.current,
        { kind: "cancel" },
      );
      selectionStateRef.current = selectionResult.state;
      setSelectionState(selectionResult.state);
      setActiveTool(tool);
    },
    [applyDrawingAction],
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
      setCoordinatePlotEditor({
        draft: object.definition,
        expected: object.definition,
        objectId: object.id,
        selectedSeriesId:
          object.definition.series.find(({ visible }) => visible)?.id ??
          object.definition.series[0]?.id ??
          null,
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
    if (result.ok) beginCoordinatePlotEditing(object.id);
  }, [beginCoordinatePlotEditing, commitCommand, createCommandMetadata]);

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
    (kind: "explicit" | "parametric") => {
      const id = plotSeriesId(`plot-series:${crypto.randomUUID()}`);
      setCoordinatePlotEditor((current) => {
        if (current === null) return null;
        const draft = addCoordinatePlotSeries(current.draft, kind, id);
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
      ...(coordinatePlotEditor === null
        ? {}
        : { definitionOverride: coordinatePlotEditor.draft }),
      onEditRequest: beginCoordinatePlotEditing,
      onSelectedSeriesChange: selectCoordinatePlotSeries,
      onViewportChange: updateCoordinatePlotViewport,
    }),
    [
      beginCoordinatePlotEditing,
      coordinatePlotEditor,
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
      if (event.key === "Escape" && coordinatePlotEditor !== null) {
        return;
      }
      if (
        event.key === "Enter" &&
        !editing &&
        selectionStateRef.current.selectedObjectIds.length === 1
      ) {
        const objectId = selectionStateRef.current.selectedObjectIds[0]!;
        if (
          documentRef.current.objects[objectId]?.kind === "math.coordinate-plot"
        ) {
          event.preventDefault();
          beginCoordinatePlotEditing(objectId);
          return;
        }
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

      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        closeShortcuts();
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
    beginCoordinatePlotEditing,
    closeShortcuts,
    coordinatePlotEditor,
    createCoordinatePlot,
    commitCommand,
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

  const startDrawing = useCallback(
    (sample: WorldPointerSample) => {
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
        pointerId: sample.pointerId,
        text: textDraft,
        tool: activeTool,
      });
    },
    [activeTool, applyDrawingAction, textDraft],
  );

  const moveDrawing = useCallback(
    (sample: WorldPointerSample) => {
      applyDrawingAction({
        kind: "move",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applyDrawingAction],
  );

  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {
      applyDrawingAction(
        {
          kind: "finish",
          point: sample.point,
          pointerId: sample.pointerId,
        },
        activeTool === "drawing.smart-ink",
      );
    },
    [activeTool, applyDrawingAction],
  );

  const cancelDrawing = useCallback(
    (pointerId: number) => {
      applyDrawingAction({ kind: "cancel", pointerId });
    },
    [applyDrawingAction],
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
      if (sample.objectId !== null && !isSelectionToolId(activeTool)) {
        activateTool(selectionToolId);
      }
      const hitObjectIds =
        sample.objectId === null
          ? []
          : expandSelectionObjectIds(document, [sample.objectId]);
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
    [activeTool, activateTool, applySelectionAction, document],
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

  const runGeometryPrompt = useCallback(() => {
    if (geometryOsClient === undefined) {
      return;
    }
    geometryOperationRef.current?.cancel();
    const current = documentRef.current;
    const workspace = workspaceRef.current?.getBoundingClientRect();
    const targetWorldCenter = screenToWorld(
      {
        x: Math.max(1, workspace?.width ?? window.innerWidth) / 2,
        y: Math.max(1, workspace?.height ?? window.innerHeight) / 2,
      },
      current.viewport,
    );
    const operation = startGeometryPrompt({
      actorId: commandActorId,
      client: geometryOsClient,
      createToken: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
      onProgress: (progress) => {
        setGeometryPromptState({ kind: "running", ...progress });
      },
      prompt: geometryPrompt,
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
  }, [
    applyGeometryPromptResult,
    commandActorId,
    geometryOsClient,
    geometryPrompt,
  ]);

  const resetViewport = () => {
    commitViewport({ offset: { x: 160, y: 90 }, zoom: 1 });
  };
  const firstObject = scene.items[0]?.object;
  const selectedObjects = selectionState.selectedObjectIds.flatMap((id) => {
    const object = document.objects[id];
    return object === undefined ? [] : [object];
  });
  const selectedStyle = scene.items.find(({ object }) =>
    selectionState.selectedObjectIds.includes(object.id),
  )?.object.style;
  const selectedCoordinatePlot =
    selectedObjects.length === 1 &&
    selectedObjects[0]?.kind === "math.coordinate-plot"
      ? selectedObjects[0]
      : null;
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

  return (
    <main className="board-app">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <div>
            <h1>TutorBoard</h1>
            <p>Интерактивное полотно · {environment.stage}</p>
          </div>
        </div>

        <div
          className="canvas-actions"
          aria-label="Управление полотном"
          role="toolbar"
        >
          <button
            aria-label="Отменить (Ctrl+Z)"
            className="tool-button"
            disabled={
              historyEnabled
                ? history.past.length === 0
                : !collaborativeUndoAvailable
            }
            onClick={undo}
            type="button"
          >
            Отменить
          </button>
          <button
            aria-label="Повторить (Ctrl+Shift+Z)"
            className="tool-button"
            disabled={!historyEnabled || history.future.length === 0}
            onClick={redo}
            type="button"
          >
            Повторить
          </button>
          <button
            className="tool-button"
            disabled={selectionState.selectedObjectIds.length === 0}
            onClick={copySelection}
            type="button"
          >
            Копировать
          </button>
          <button
            className="tool-button"
            disabled={selectionState.selectedObjectIds.length === 0}
            onClick={cutSelection}
            type="button"
          >
            Вырезать
          </button>
          <button
            className="tool-button"
            disabled={clipboard === null}
            onClick={pasteClipboard}
            type="button"
          >
            Вставить
          </button>{" "}
          <label className="tool-button file-tool-button">
            Вставить изображение
            <input
              accept={embeddedImageAccept}
              aria-label="Вставить изображения"
              disabled={readOnly}
              multiple
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                if (files.length > 0) {
                  void importImageFiles(files);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <button
            aria-label="Создать координатную плоскость (G)"
            className="tool-button"
            disabled={readOnly}
            onClick={createCoordinatePlot}
            type="button"
          >
            График
          </button>
          {onImportDocument === undefined ? null : (
            <label className="tool-button file-tool-button">
              Импорт JSON
              <input
                accept="application/json,.json"
                aria-label="Импорт документа JSON"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined) {
                    onImportDocument(file);
                  }
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          )}
          {onExportDocument === undefined ? null : (
            <button
              className="tool-button"
              onClick={() => onExportDocument(document)}
              type="button"
            >
              Экспорт JSON
            </button>
          )}
          {onExportSvgSnapshot === undefined ? null : (
            <button
              className="tool-button"
              onClick={() => onExportSvgSnapshot(document)}
              type="button"
            >
              Снимок SVG
            </button>
          )}
          {onExportPngSnapshot === undefined ? null : (
            <button
              className="tool-button"
              onClick={() => onExportPngSnapshot(document)}
              type="button"
            >
              Снимок PNG
            </button>
          )}
          <button
            aria-expanded={shortcutsOpen}
            aria-haspopup="dialog"
            className="tool-button"
            onClick={() => setShortcutsOpen(true)}
            ref={shortcutsButtonRef}
            type="button"
          >
            Горячие клавиши
          </button>
          {onExportDiagnostics === undefined ? null : (
            <button
              className="tool-button"
              onClick={onExportDiagnostics}
              type="button"
            >
              Диагностика
            </button>
          )}
          <button
            className="tool-button"
            onClick={(event) => {
              resetViewport();
              event.currentTarget.blur();
            }}
            type="button"
          >
            Центрировать
          </button>
        </div>
      </header>

      {shortcutsOpen ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeShortcuts();
            }
          }}
        >
          <section
            aria-labelledby="shortcuts-title"
            aria-modal="true"
            className="shortcuts-dialog"
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                shortcutsDialogRef.current
                  ?.querySelector<HTMLButtonElement>("button")
                  ?.focus();
              }
            }}
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
                <dt>V / L / H / P / I / R / E / T / G</dt>
                <dd>Выбор инструмента и создание графика</dd>
              </div>
              <div>
                <dt>Enter / двойной щелчок / Escape</dt>
                <dd>Открыть или закрыть редактор координатной плоскости</dd>
              </div>
              <div>
                <dt>Стрелки / Shift+стрелки</dt>
                <dd>Перемещение выделения на 1 / 10 единиц</dd>
              </div>
              <div>
                <dt>Маркеры рамки выделения</dt>
                <dd>Изменение размера и поворот</dd>
              </div>
              <div>
                <dt>Ctrl/Cmd + C, X, V</dt>
                <dd>Копирование объектов и вставка объектов или изображений</dd>
              </div>
              <div>
                <dt>Ctrl/Cmd + Z / Shift+Z</dt>
                <dd>Отмена и повтор</dd>
              </div>
              <div>
                <dt>Delete / Escape / ?</dt>
                <dd>Удаление, отмена действия и эта справка</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}

      <section
        className="workspace"
        aria-label="Рабочая область доски"
        ref={workspaceRef}
        tabIndex={-1}
      >
        {persistenceNotice === null ? null : (
          <div className="persistence-notice" role="status">
            {persistenceNotice}
          </div>
        )}{" "}
        {imageDiagnostic === null ? null : (
          <div className="persistence-alert" role="alert">
            <strong>Изображение не вставлено</strong>
            <span>{imageDiagnostic}</span>
          </div>
        )}
        {clipboardNotice === null ? null : (
          <div className="clipboard-notice" role="status">
            {clipboardNotice}
          </div>
        )}
        {smartInkNotice === null ? null : (
          <div className="smart-ink-notice" role="status">
            {smartInkNotice}
          </div>
        )}
        <div aria-atomic="true" aria-live="polite" className="visually-hidden">
          {accessibilityNotice}
        </div>
        {persistenceStatus.kind === "error" ||
        persistenceStatus.kind === "conflict" ? (
          <div className="persistence-alert" role="alert">
            <strong>{persistenceStatus.label}</strong>
            {persistenceStatus.detail === undefined ? null : (
              <span>{persistenceStatus.detail}</span>
            )}
            {persistenceStatus.retryable === true &&
            onRetryPersistence !== undefined ? (
              <button onClick={onRetryPersistence} type="button">
                Повторить сохранение
              </button>
            ) : null}
          </div>
        ) : null}
        <BoardStage
          coordinatePlotInteraction={coordinatePlotInteraction}
          drawingModeKey={isDrawingToolId(activeTool) ? activeTool : null}
          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}
          onWorldPointerHover={(cursor) => {
            lastPointerWorldRef.current = cursor;
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
        />
        {coordinatePlotEditor === null ? null : (
          <CoordinatePlotEditorPanel
            definition={coordinatePlotEditor.draft}
            fallbackFocusRef={workspaceRef}
            key={coordinatePlotEditor.objectId}
            dirty={coordinatePlotEditor.draft !== coordinatePlotEditor.expected}
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
        )}
        <GeometryPromptPanel
          available={geometryOsClient !== undefined}
          onCancel={() => geometryOperationRef.current?.cancel()}
          onChooseClarification={(option) => {
            setGeometryPrompt(option);
            setGeometryPromptState({ kind: "idle" });
          }}
          onPromptChange={(prompt) => {
            setGeometryPrompt(prompt);
            if (geometryPromptState.kind !== "running") {
              setGeometryPromptState({ kind: "idle" });
            }
          }}
          onRetry={runGeometryPrompt}
          onSubmit={runGeometryPrompt}
          prompt={geometryPrompt}
          state={geometryPromptState}
        />
        <aside aria-label="Слои" className="layers-panel">
          <div className="layers-panel-header">
            <strong>Слои</strong>
            <span>{layers.length}</span>
          </div>
          <div className="layers-group-actions">
            <button disabled={!canGroup} onClick={groupSelection} type="button">
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
            <p>На доске пока нет объектов</p>
          ) : (
            <ol className="layers-list">
              {layers.map((layer) => (
                <li key={layer.id}>
                  <button
                    aria-pressed={selectionState.selectedObjectIds.includes(
                      layer.id,
                    )}
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
        </aside>
        <div
          aria-label="Инструменты рисования"
          className="drawing-toolbar"
          role="toolbar"
        >
          <button
            aria-label="Перемещение (H)"
            aria-pressed={activeTool === navigationToolId}
            className={
              activeTool === navigationToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(navigationToolId)}
            title="Перемещение · H"
            type="button"
          >
            <span aria-hidden="true">✋</span>
          </button>
          <button
            aria-label={`${selectionTool.label} (${selectionTool.shortcut})`}
            aria-pressed={activeTool === selectionToolId}
            className={
              activeTool === selectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(selectionToolId)}
            title={`${selectionTool.label} · ${selectionTool.shortcut}`}
            type="button"
          >
            <span aria-hidden="true">{selectionTool.icon}</span>
          </button>
          <button
            aria-label={`${lassoSelectionTool.label} (${lassoSelectionTool.shortcut})`}
            aria-pressed={activeTool === lassoSelectionToolId}
            className={
              activeTool === lassoSelectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(lassoSelectionToolId)}
            title={`${lassoSelectionTool.label} · ${lassoSelectionTool.shortcut}`}
            type="button"
          >
            <span aria-hidden="true">{lassoSelectionTool.icon}</span>
          </button>
          <span aria-hidden="true" className="toolbar-divider" />
          {drawingTools.map((tool) => (
            <button
              aria-label={`${tool.label} (${tool.shortcut})`}
              aria-pressed={activeTool === tool.id}
              className={
                activeTool === tool.id
                  ? "drawing-tool is-active"
                  : "drawing-tool"
              }
              key={tool.id}
              onClick={() => activateTool(tool.id)}
              title={`${tool.label} · ${tool.shortcut}`}
              type="button"
            >
              <span aria-hidden="true">{tool.icon}</span>
            </button>
          ))}
          {activeTool === "drawing.text" ? (
            <label className="text-tool-input">
              <span>Текст</span>
              <input
                aria-label="Содержимое текста"
                maxLength={100_000}
                onChange={(event) => setTextDraft(event.target.value)}
                value={textDraft}
              />
            </label>
          ) : null}
        </div>
        <aside className="canvas-help" aria-label="Подсказка по навигации">
          <strong>
            {coordinatePlotEditor !== null
              ? "Редактор графика"
              : activeTool === navigationToolId
                ? "Навигация"
                : activeTool === selectionToolId
                  ? "Выделение"
                  : activeTool === lassoSelectionToolId
                    ? "Лассо"
                    : activeTool === "drawing.smart-ink"
                      ? "Smart Ink"
                      : "Создание объекта"}
          </strong>
          <span>
            {coordinatePlotEditor !== null
              ? "Тяните внутри плоскости; колесо меняет внутренний масштаб"
              : activeTool === navigationToolId
                ? "Потяните полотно для перемещения"
                : activeTool === selectionToolId
                  ? "Клик, Shift+клик или рамка выделения"
                  : activeTool === lassoSelectionToolId
                    ? "Обведите объекты; Shift добавляет, Alt исключает"
                    : activeTool === "drawing.smart-ink"
                      ? "Нарисуйте фигуру одним непрерывным штрихом"
                      : "Потяните или нажмите на полотно"}
          </span>
          <span>Правая кнопка / Space / средняя кнопка — перемещение</span>
          <span>Escape — отменить действие</span>
        </aside>
        {selectionState.selectedObjectIds.length === 0 ? null : (
          <aside
            className="selection-inspector"
            aria-label="Выделенные объекты"
          >
            <strong>Выделено: {selectionState.selectedObjectIds.length}</strong>
            <span>
              {selectedLocked
                ? "Трансформация заблокирована"
                : transformableObjectIds.length > 0
                  ? "Тяните маркеры рамки для размера и поворота"
                  : "Перетащите выделение для перемещения"}
            </span>
            {transformableObjectIds.length === 0 ? null : (
              <div className="transform-actions">
                <button
                  aria-label="Уменьшить выделение на 10%"
                  onClick={() => transformSelectionBy(0.9, 0)}
                  type="button"
                >
                  −10%
                </button>
                <button
                  aria-label="Увеличить выделение на 10%"
                  onClick={() => transformSelectionBy(1.1, 0)}
                  type="button"
                >
                  +10%
                </button>
                <button
                  aria-label="Повернуть выделение на 15 градусов"
                  onClick={() => transformSelectionBy(1, 15)}
                  type="button"
                >
                  ↻ 15°
                </button>
              </div>
            )}
            <div>
              <button
                onClick={() => setSelectionLock(!selectedLocked)}
                type="button"
              >
                {selectedLocked ? "Разблокировать" : "Заблокировать"}
              </button>
              <button onClick={deleteSelection} type="button">
                Удалить
              </button>
            </div>
            {selectedCoordinatePlot === null ||
            selectedCoordinatePlot.source.kind !== "user" ? null : (
              <button
                onClick={() =>
                  beginCoordinatePlotEditing(selectedCoordinatePlot.id)
                }
                type="button"
              >
                Редактировать график
              </button>
            )}
            {selectedStyle === undefined ? null : (
              <div className="style-inspector">
                {isEditableTextObject(selectedEditableText) ? (
                  <label className="text-content-editor">
                    Текст или формула
                    <textarea
                      aria-label="Редактор текста"
                      defaultValue={selectedEditableText.text}
                      key={`${selectedEditableText.id}:${selectedEditableText.text}`}
                      maxLength={100_000}
                      onBlur={(event) =>
                        updateSelectedText(
                          selectedEditableText.id,
                          event.currentTarget.value,
                        )
                      }
                      rows={3}
                    />
                  </label>
                ) : null}
                <ColorPalette
                  allowNone
                  label="Заливка"
                  onChange={(fill) => updateSelectionStyle({ fill })}
                  value={selectedStyle.fill}
                />
                <ColorPalette
                  label="Обводка"
                  onChange={(stroke) => updateSelectionStyle({ stroke })}
                  value={selectedStyle.stroke}
                />
                <StrokeStylePalette
                  onChange={(strokeStyle) =>
                    updateSelectionStyle({ strokeStyle })
                  }
                  value={selectedStyle.strokeStyle}
                />
                <label>
                  Пользовательская толщина
                  <input
                    aria-label="Толщина обводки"
                    min="0"
                    onChange={(event) => {
                      if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                        updateSelectionStyle({
                          strokeWidth: event.currentTarget.valueAsNumber,
                        });
                      }
                    }}
                    step="0.5"
                    type="number"
                    value={selectedStyle.strokeWidth}
                  />
                </label>
                <label>
                  Прозрачность
                  <input
                    aria-label="Прозрачность выделения"
                    max="1"
                    min="0"
                    onChange={(event) =>
                      updateSelectionStyle({
                        opacity: event.currentTarget.valueAsNumber,
                      })
                    }
                    step="0.05"
                    type="range"
                    value={selectedStyle.opacity}
                  />
                </label>
              </div>
            )}
          </aside>
        )}
        <div className="coordinate-chip" aria-live="polite">
          <span data-testid="viewport-zoom">
            {Math.round(document.viewport.zoom * 100)}%
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="viewport-offset">
            x {Math.round(document.viewport.offset.x)} · y{" "}
            {Math.round(document.viewport.offset.y)}
          </span>
        </div>
      </section>

      <footer className="statusbar">
        <span>
          <i className="status-dot" aria-hidden="true" />
          BoardDocument {boardDocumentSchemaVersion}
        </span>
        <span data-testid="first-object-position">
          Объект: {firstObject?.position.x ?? 0}, {firstObject?.position.y ?? 0}
        </span>
        <span data-testid="first-object-transform">
          Масштаб: {firstObject?.scale.x ?? 1}, {firstObject?.scale.y ?? 1} ·
          Поворот: {firstObject?.rotation ?? 0}°
        </span>
        <span data-testid="object-count">{document.order.length} объекта</span>
        <span data-testid="interaction-state">{drawingState.kind}</span>
        <span data-testid="history-depth">
          {history.past.length}/{history.future.length}
        </span>
        <span data-testid="selection-count">
          {selectionState.selectedObjectIds.length} выбрано
        </span>
        <span data-testid="geometry-import-count">
          {Object.keys(document.geometryImports).length} построений
        </span>
        <span data-testid="group-count">
          {Object.keys(document.groups).length} групп
        </span>
        <span data-testid="persistence-status">{persistenceStatus.label}</span>
        {drawingDiagnostic === null ? null : (
          <span data-testid="drawing-diagnostic">{drawingDiagnostic}</span>
        )}
        {commandError === null ? null : (
          <span className="command-error" role="alert">
            {commandError}
          </span>
        )}
      </footer>
    </main>
  );
}
