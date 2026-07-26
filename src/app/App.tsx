import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoardStage,
  createDefaultKonvaRendererRegistry,
  type SelectionPointerStartSample,
  type WorldPointerSample,
} from "../adapters/canvas-konva/public";
import {
  actorId,
  boardDocumentSchemaVersion,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  geometryImportId,
  groupId,
  reduceBoardDocument,
  screenToWorld,
  selectBoardScene,
  type BoardDocument,
  type BoardCommand,
  type BoardObjectId,
  type BoardRenderItem,
  type GeometryOsClient,
  type CommandMetadata,
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
  createGroupSelectionCommand,
  createReorderLayersCommand,
  createSetLayerVisibilityCommand,
  createUngroupSelectionCommand,
  selectLayers,
} from "../modules/layers/public";
import {
  createAddSvgObjectCommand,
  createSvgObject,
  svgImportLimits,
} from "../modules/svg-import/public";
import {
  createDeleteSelectionCommand,
  createMoveSelectionCommand,
  createSetSelectionLockCommand,
  expandSelectionObjectIds,
  getSelectionMarquee,
  getSelectionPreviewDelta,
  initialSelectionState,
  normalizeRect,
  reduceSelectionInteraction,
  selectionIsLocked,
  selectionTool,
  selectionToolId,
  selectObjectIdsInRect,
  selectSelectionBounds,
  type CompletedSelectionMove,
  type SelectionAction,
  type SelectionState,
} from "../modules/selection/public";
import { createSetSelectionStyleCommand } from "../modules/styling/public";
import {
  createUpdateTextCommand,
  isEditableTextObject,
} from "../modules/text-editing/public";
import { readEnvironment } from "./configuration/environment";
import {
  GeometryPromptPanel,
  type GeometryPromptViewState,
} from "./GeometryPromptPanel";
import "./styles.css";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");
const navigationToolId = "navigation.pan" as const;
type ActiveToolId =
  typeof navigationToolId | typeof selectionToolId | DrawingToolId;
const initialDrawingState: DrawingInteractionState = { kind: "idle" };

function createLocalCommandMetadata(): CommandMetadata {
  return {
    actorId: localActorId,
    id: commandId(`command:${crypto.randomUUID()}`),
    timestamp: new Date().toISOString(),
  };
}

export interface AppPersistenceStatus {
  readonly detail?: string;
  readonly kind:
    "conflict" | "error" | "idle" | "saved" | "saving" | "scheduled";
  readonly label: string;
  readonly retryable?: boolean;
}

export interface AppProps {
  readonly geometryOsClient?: GeometryOsClient;
  readonly initialDocument?: BoardDocument;
  readonly onDocumentChange?: (document: BoardDocument) => void;
  readonly onExportDiagnostics?: () => void;
  readonly onImportDocument?: (file: File) => void;
  readonly onRetryPersistence?: () => void;
  readonly persistenceNotice?: string | null;
  readonly persistenceStatus?: AppPersistenceStatus;
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
  geometryOsClient,
  initialDocument,
  onDocumentChange,
  onExportDiagnostics,
  onImportDocument,
  onRetryPersistence,
  persistenceNotice = null,
  persistenceStatus = { kind: "idle", label: "Локальное сохранение" },
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
  const [selectionState, setSelectionState] = useState(initialSelectionState);
  const selectionStateRef = useRef<SelectionState>(initialSelectionState);
  const [textDraft, setTextDraft] = useState("Новый текст");
  const [svgDiagnostic, setSvgDiagnostic] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<BoardClipboardPayload | null>(
    null,
  );
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [geometryPrompt, setGeometryPrompt] = useState(
    "Построй треугольник ABC и высоту AH",
  );
  const [geometryPromptState, setGeometryPromptState] =
    useState<GeometryPromptViewState>({ kind: "idle" });
  const geometryOperationRef = useRef<GeometryPromptOperation | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
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
  const scene = useMemo(() => selectBoardScene(document), [document]);
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

  const undo = useCallback(() => {
    setBoardState((current) => {
      const next = undoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, []);

  const redo = useCallback(() => {
    setBoardState((current) => {
      const next = redoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, []);

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
    const timestamp = new Date().toISOString();
    const result = reduceBoardDocument(
      current,
      createCutContentCommand(copied.payload, {
        actorId: localActorId,
        id: commandId(`command:${crypto.randomUUID()}`),
        timestamp,
      }),
    );
    if (!result.ok) {
      setClipboardNotice(result.error.message);
      return;
    }
    setClipboard(copied.payload);
    setClipboardNotice(`Вырезано: ${copied.payload.order.length}`);
    setBoardState((latest) => ({
      commandError: null,
      history: commitDocumentHistory(latest.history, result.document),
    }));
    const cleared: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [],
    };
    selectionStateRef.current = cleared;
    setSelectionState(cleared);
  }, []);

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
        actorId: localActorId,
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
    const result = reduceBoardDocument(documentRef.current, command);
    if (!result.ok) {
      setClipboardNotice(result.error.message);
      return;
    }
    setBoardState((latest) => ({
      commandError: null,
      history: commitDocumentHistory(latest.history, result.document),
    }));
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: command.objects.map(({ id }) => id),
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setActiveTool(selectionToolId);
    setClipboardNotice(`Вставлено: ${command.objects.length}`);
  }, [clipboard]);

  const commitCommand = useCallback((command: BoardCommand) => {
    const result = reduceBoardDocument(documentRef.current, command);
    if (!result.ok) {
      setBoardState((current) => ({
        ...current,
        commandError: result.error.message,
      }));
      return false;
    }
    setBoardState((current) => ({
      commandError: null,
      history: commitDocumentHistory(current.history, result.document),
    }));
    return true;
  }, []);

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
        createReorderLayersCommand(
          createLocalCommandMetadata(),
          [objectId],
          mode,
        ),
      );
    },
    [commitCommand],
  );

  const toggleLayerVisibility = useCallback(
    (objectId: BoardObjectId, visible: boolean) => {
      commitCommand(
        createSetLayerVisibilityCommand(
          createLocalCommandMetadata(),
          [objectId],
          visible,
        ),
      );
    },
    [commitCommand],
  );

  const toggleLayerLock = useCallback(
    (objectId: BoardObjectId, locked: boolean) => {
      const current = documentRef.current;
      commitCommand(
        createSetSelectionLockCommand(
          createLocalCommandMetadata(),
          current,
          expandSelectionObjectIds(current, [objectId]),
          locked,
        ),
      );
    },
    [commitCommand],
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
        createLocalCommandMetadata(),
        groupId(`group:${crypto.randomUUID()}`),
        objectIds,
      ),
    );
  }, [commitCommand]);

  const ungroupSelection = useCallback(() => {
    const current = documentRef.current;
    commitCommand(
      createUngroupSelectionCommand(
        createLocalCommandMetadata(),
        current,
        selectionStateRef.current.selectedObjectIds,
      ),
    );
  }, [commitCommand]);

  const updateSelectionStyle = useCallback(
    (style: VisualStyleOverride) => {
      if (selectionStateRef.current.selectedObjectIds.length === 0) {
        return;
      }
      commitCommand(
        createSetSelectionStyleCommand(
          createLocalCommandMetadata(),
          selectionStateRef.current.selectedObjectIds,
          style,
        ),
      );
    },
    [commitCommand],
  );

  const updateSelectedText = useCallback(
    (objectId: BoardObjectId, text: string) => {
      const object = documentRef.current.objects[objectId];
      if (!isEditableTextObject(object) || object.text === text) {
        return;
      }
      commitCommand(
        createUpdateTextCommand(createLocalCommandMetadata(), objectId, text),
      );
    },
    [commitCommand],
  );

  const commitViewport = useCallback((viewport: ViewportState) => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(current.history.present, {
        id: commandId(crypto.randomUUID()),
        actorId: localActorId,
        timestamp,
        kind: "core.viewport.set",
        viewport,
      });
      if (!result.ok) {
        return { ...current, commandError: result.error.message };
      }

      return {
        commandError: null,
        history: commitDocumentHistory(current.history, result.document),
      };
    });
  }, []);

  const commitDrawingObject = useCallback((object: UserDrawingObject) => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(
        current.history.present,
        createAddDrawingObjectCommand(
          {
            actorId: localActorId,
            id: commandId(`command:${crypto.randomUUID()}`),
            timestamp,
          },
          object,
        ),
      );
      if (!result.ok) {
        return { ...current, commandError: result.error.message };
      }

      return {
        commandError: null,
        history: commitDocumentHistory(current.history, result.document),
      };
    });
  }, []);

  const commitSelectionMove = useCallback(
    (completed: CompletedSelectionMove) => {
      const timestamp = new Date().toISOString();
      setBoardState((current) => {
        const result = reduceBoardDocument(
          current.history.present,
          createMoveSelectionCommand(
            {
              actorId: localActorId,
              id: commandId(`command:${crypto.randomUUID()}`),
              timestamp,
            },
            current.history.present,
            completed.objectIds,
            completed.delta,
          ),
        );
        if (!result.ok) {
          return { ...current, commandError: result.error.message };
        }
        return {
          commandError: null,
          history: commitDocumentHistory(current.history, result.document),
        };
      });
    },
    [],
  );

  const applyDrawingAction = useCallback(
    (action: DrawingAction) => {
      const result = reduceDrawingInteraction(drawingStateRef.current, action);
      drawingStateRef.current = result.state;
      setDrawingState(result.state);
      setDrawingDiagnostic(result.diagnostic);
      if (result.completedObject !== null) {
        commitDrawingObject(result.completedObject);
      }
    },
    [commitDrawingObject],
  );

  const activateTool = useCallback(
    (tool: ActiveToolId) => {
      applyDrawingAction({ kind: "cancel" });
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
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
          event.preventDefault();
          pasteClipboard();
          return;
        }
      }
      if (event.altKey || event.ctrlKey || event.metaKey || editing) {
        return;
      }

      if (event.key.toLowerCase() === "h") {
        activateTool(navigationToolId);
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
        const timestamp = new Date().toISOString();
        setBoardState((current) => {
          const result = reduceBoardDocument(
            current.history.present,
            createDeleteSelectionCommand(
              {
                actorId: localActorId,
                id: commandId(`command:${crypto.randomUUID()}`),
                timestamp,
              },
              current.history.present,
              selectionStateRef.current.selectedObjectIds,
            ),
          );
          return result.ok
            ? {
                commandError: null,
                history: commitDocumentHistory(
                  current.history,
                  result.document,
                ),
              }
            : { ...current, commandError: result.error.message };
        });
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
  }, [activateTool, copySelection, cutSelection, pasteClipboard, redo, undo]);

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
      applyDrawingAction({
        kind: "finish",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applyDrawingAction],
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
      const hitObjectIds =
        sample.objectId === null
          ? []
          : expandSelectionObjectIds(document, [sample.objectId]);
      applySelectionAction({
        additive: sample.additive,
        hitObjectIds,
        kind: "start",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applySelectionAction, document],
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
      const marqueeObjectIds =
        interaction.kind === "marquee"
          ? expandSelectionObjectIds(
              document,
              selectObjectIdsInRect(
                scene,
                normalizeRect(interaction.start, sample.point),
              ),
            )
          : undefined;
      applySelectionAction({
        kind: "finish",
        ...(marqueeObjectIds === undefined ? {} : { marqueeObjectIds }),
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applySelectionAction, document, scene],
  );

  const cancelSelection = useCallback(
    (pointerId: number) => {
      applySelectionAction({ kind: "cancel", pointerId });
    },
    [applySelectionAction],
  );

  const setSelectionLock = useCallback((locked: boolean) => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(
        current.history.present,
        createSetSelectionLockCommand(
          {
            actorId: localActorId,
            id: commandId(`command:${crypto.randomUUID()}`),
            timestamp,
          },
          current.history.present,
          selectionStateRef.current.selectedObjectIds,
          locked,
        ),
      );
      return result.ok
        ? {
            commandError: null,
            history: commitDocumentHistory(current.history, result.document),
          }
        : { ...current, commandError: result.error.message };
    });
  }, []);

  const deleteSelection = useCallback(() => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(
        current.history.present,
        createDeleteSelectionCommand(
          {
            actorId: localActorId,
            id: commandId(`command:${crypto.randomUUID()}`),
            timestamp,
          },
          current.history.present,
          selectionStateRef.current.selectedObjectIds,
        ),
      );
      return result.ok
        ? {
            commandError: null,
            history: commitDocumentHistory(current.history, result.document),
          }
        : { ...current, commandError: result.error.message };
    });
  }, []);

  const importSvgFile = useCallback(async (file: File) => {
    if (file.size > svgImportLimits.maxInputBytes) {
      setSvgDiagnostic("svg.input-too-large: SVG превышает допустимый размер.");
      return;
    }

    let source: string;
    try {
      source = await file.text();
    } catch {
      setSvgDiagnostic("svg.read-failed: Не удалось прочитать SVG-файл.");
      return;
    }

    const current = documentRef.current;
    const workspace = workspaceRef.current?.getBoundingClientRect();
    const center = screenToWorld(
      {
        x: Math.max(1, workspace?.width ?? window.innerWidth) / 2,
        y: Math.max(1, workspace?.height ?? window.innerHeight) / 2,
      },
      current.viewport,
    );
    const objectId = boardObjectId(`object:${crypto.randomUUID()}`);
    const created = createSvgObject({ center, id: objectId, source });
    if (created.status === "error") {
      setSvgDiagnostic(
        `${created.diagnostic.code}: SVG содержит небезопасные или неподдерживаемые данные.`,
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const result = reduceBoardDocument(
      current,
      createAddSvgObjectCommand(
        {
          actorId: localActorId,
          id: commandId(`command:${crypto.randomUUID()}`),
          timestamp,
        },
        created.object,
      ),
    );
    if (!result.ok) {
      setBoardState((latest) => ({
        ...latest,
        commandError: result.error.message,
      }));
      return;
    }

    documentRef.current = result.document;
    setBoardState((latest) => ({
      commandError: null,
      history: commitDocumentHistory(latest.history, result.document),
    }));
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [objectId],
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setActiveTool(selectionToolId);
    setSvgDiagnostic(null);
  }, []);

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

      const current = documentRef.current;
      const applied = reduceBoardDocument(current, result.command);
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
      documentRef.current = applied.document;
      setBoardState((latest) => ({
        commandError: null,
        history: commitDocumentHistory(latest.history, applied.document),
      }));
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
    [],
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
      actorId: localActorId,
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
  }, [applyGeometryPromptResult, geometryOsClient, geometryPrompt]);

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
  const selectedTextId =
    selectionState.selectedObjectIds.length === 1
      ? selectionState.selectedObjectIds[0]
      : undefined;
  const selectedEditableText =
    selectedTextId === undefined ? undefined : document.objects[selectedTextId];
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

        <div className="canvas-actions" aria-label="Управление полотном">
          <button
            aria-label="Отменить (Ctrl+Z)"
            className="tool-button"
            disabled={history.past.length === 0}
            onClick={undo}
            type="button"
          >
            Отменить
          </button>
          <button
            aria-label="Повторить (Ctrl+Shift+Z)"
            className="tool-button"
            disabled={history.future.length === 0}
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
          </button>
          <label className="tool-button file-tool-button">
            Вставить SVG
            <input
              accept="image/svg+xml,.svg"
              aria-label="Вставить SVG"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) {
                  void importSvgFile(file);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
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

      <section
        className="workspace"
        aria-label="Рабочая область доски"
        ref={workspaceRef}
      >
        {persistenceNotice === null ? null : (
          <div className="persistence-notice" role="status">
            {persistenceNotice}
          </div>
        )}
        {svgDiagnostic === null ? null : (
          <div className="persistence-alert" role="alert">
            <strong>SVG не вставлен</strong>
            <span>{svgDiagnostic}</span>
          </div>
        )}
        {clipboardNotice === null ? null : (
          <div className="clipboard-notice" role="status">
            {clipboardNotice}
          </div>
        )}
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
          drawingModeKey={isDrawingToolId(activeTool) ? activeTool : null}
          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}
          onWorldPointerStart={startDrawing}
          onSelectionPointerCancel={cancelSelection}
          onSelectionPointerFinish={finishSelection}
          onSelectionPointerMove={moveSelection}
          onSelectionPointerStart={startSelection}
          onViewportCommit={commitViewport}
          panMode={activeTool === navigationToolId}
          previewItems={previewItems}
          registry={registry}
          scene={scene}
          selectedObjectIds={selectionState.selectedObjectIds}
          selectionBounds={selectionBounds}
          selectionMarquee={selectionMarquee}
          selectionModeKey={
            activeTool === selectionToolId ? selectionToolId : null
          }
          selectionPreviewDelta={renderedSelectionPreviewDelta}
        />

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
            {activeTool === navigationToolId
              ? "Навигация"
              : activeTool === selectionToolId
                ? "Выделение"
                : "Создание объекта"}
          </strong>
          <span>
            {activeTool === navigationToolId
              ? "Потяните полотно для перемещения"
              : activeTool === selectionToolId
                ? "Клик, Shift+клик или рамка выделения"
                : "Потяните или нажмите на полотно"}
          </span>
          <span>Space / средняя кнопка — временное перемещение</span>
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
                ? "Перемещение заблокировано"
                : "Перетащите выделение для перемещения"}
            </span>
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
                <label>
                  Заливка
                  <input
                    aria-label="Заливка выделения"
                    onChange={(event) =>
                      updateSelectionStyle({
                        fill:
                          event.currentTarget.value.trim() === ""
                            ? null
                            : event.currentTarget.value,
                      })
                    }
                    value={selectedStyle.fill ?? ""}
                  />
                </label>
                <label>
                  Обводка
                  <input
                    aria-label="Обводка выделения"
                    onChange={(event) =>
                      updateSelectionStyle({
                        stroke:
                          event.currentTarget.value.trim() === ""
                            ? null
                            : event.currentTarget.value,
                      })
                    }
                    value={selectedStyle.stroke ?? ""}
                  />
                </label>
                <label>
                  Толщина
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
