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
  reduceBoardDocument,
  screenToWorld,
  selectBoardScene,
  type BoardDocument,
  type BoardRenderItem,
  type GeometryOsClient,
  type ViewportState,
} from "../core/public";
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
    document: initialDocument ?? createInitialDocument(),
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
  const [geometryPrompt, setGeometryPrompt] = useState(
    "Построй треугольник ABC и высоту AH",
  );
  const [geometryPromptState, setGeometryPromptState] =
    useState<GeometryPromptViewState>({ kind: "idle" });
  const geometryOperationRef = useRef<GeometryPromptOperation | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const { commandError, document } = boardState;
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

  const commitViewport = useCallback((viewport: ViewportState) => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(current.document, {
        id: commandId(crypto.randomUUID()),
        actorId: localActorId,
        timestamp,
        kind: "core.viewport.set",
        viewport,
      });
      if (!result.ok) {
        return { ...current, commandError: result.error.message };
      }

      return { commandError: null, document: result.document };
    });
  }, []);

  const commitDrawingObject = useCallback((object: UserDrawingObject) => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(
        current.document,
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

      return { commandError: null, document: result.document };
    });
  }, []);

  const commitSelectionMove = useCallback(
    (completed: CompletedSelectionMove) => {
      const timestamp = new Date().toISOString();
      setBoardState((current) => {
        const result = reduceBoardDocument(
          current.document,
          createMoveSelectionCommand(
            {
              actorId: localActorId,
              id: commandId(`command:${crypto.randomUUID()}`),
              timestamp,
            },
            current.document,
            completed.objectIds,
            completed.delta,
          ),
        );
        if (!result.ok) {
          return { ...current, commandError: result.error.message };
        }
        return { commandError: null, document: result.document };
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
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
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
            current.document,
            createDeleteSelectionCommand(
              {
                actorId: localActorId,
                id: commandId(`command:${crypto.randomUUID()}`),
                timestamp,
              },
              current.document,
              selectionStateRef.current.selectedObjectIds,
            ),
          );
          return result.ok
            ? { commandError: null, document: result.document }
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
  }, [activateTool]);

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
        current.document,
        createSetSelectionLockCommand(
          {
            actorId: localActorId,
            id: commandId(`command:${crypto.randomUUID()}`),
            timestamp,
          },
          current.document,
          selectionStateRef.current.selectedObjectIds,
          locked,
        ),
      );
      return result.ok
        ? { commandError: null, document: result.document }
        : { ...current, commandError: result.error.message };
    });
  }, []);

  const deleteSelection = useCallback(() => {
    const timestamp = new Date().toISOString();
    setBoardState((current) => {
      const result = reduceBoardDocument(
        current.document,
        createDeleteSelectionCommand(
          {
            actorId: localActorId,
            id: commandId(`command:${crypto.randomUUID()}`),
            timestamp,
          },
          current.document,
          selectionStateRef.current.selectedObjectIds,
        ),
      );
      return result.ok
        ? { commandError: null, document: result.document }
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
    setBoardState({ commandError: null, document: result.document });
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
      setBoardState({ commandError: null, document: applied.document });
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
        <span data-testid="selection-count">
          {selectionState.selectedObjectIds.length} выбрано
        </span>
        <span data-testid="geometry-import-count">
          {Object.keys(document.geometryImports).length} построений
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
