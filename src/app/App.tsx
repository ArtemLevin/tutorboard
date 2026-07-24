import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoardStage,
  createDefaultKonvaRendererRegistry,
  type WorldPointerSample,
} from "../adapters/canvas-konva/public";
import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  selectBoardScene,
  type BoardDocument,
  type BoardObject,
  type BoardRenderItem,
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
import { readEnvironment } from "./configuration/environment";
import "./styles.css";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");
const navigationToolId = "navigation.pan" as const;
type ActiveToolId = typeof navigationToolId | DrawingToolId;
const initialDrawingState: DrawingInteractionState = { kind: "idle" };

function createInitialDocument(): BoardDocument {
  const timestamp = new Date().toISOString();
  const empty = createEmptyBoardDocument({
    id: documentId("document:local-board"),
    title: "TutorBoard canvas",
    createdAt: timestamp,
  });
  const objects: readonly BoardObject[] = [
    {
      id: boardObjectId("object:welcome-card"),
      kind: "drawing.rectangle",
      groupId: null,
      locked: false,
      position: { x: 80, y: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: "#f7f2e8",
        opacity: 1,
        stroke: "#d5c8b1",
        strokeWidth: 2,
      },
      visible: true,
      size: { height: 210, width: 360 },
    },
    {
      id: boardObjectId("object:axis-line"),
      kind: "drawing.line",
      groupId: null,
      locked: false,
      position: { x: -160, y: 360 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: null,
        opacity: 0.8,
        stroke: "#536b78",
        strokeWidth: 4,
      },
      visible: true,
      end: { x: 680, y: -210 },
    },
    {
      id: boardObjectId("object:focus-point"),
      kind: "drawing.ellipse",
      groupId: null,
      locked: false,
      position: { x: -80, y: 220 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: "#ee6f57",
        opacity: 1,
        stroke: "#ffffff",
        strokeWidth: 3,
      },
      visible: true,
      radius: { x: 12, y: 12 },
    },
    {
      id: boardObjectId("object:welcome-title"),
      kind: "drawing.text",
      groupId: null,
      locked: false,
      position: { x: 116, y: 118 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: "#1c2a33",
        opacity: 1,
        stroke: null,
        strokeWidth: 0,
      },
      visible: true,
      text: "Бесконечное полотно\nготово к работе",
    },
  ];
  const added = reduceBoardDocument(empty, {
    id: commandId("command:initial-objects"),
    actorId: localActorId,
    timestamp,
    kind: "core.objects.add",
    objects,
  });
  if (!added.ok) {
    throw new Error(added.error.message);
  }

  const positioned = reduceBoardDocument(added.document, {
    id: commandId("command:initial-viewport"),
    actorId: localActorId,
    timestamp,
    kind: "core.viewport.set",
    viewport: { offset: { x: 160, y: 90 }, zoom: 1 },
  });
  if (!positioned.ok) {
    throw new Error(positioned.error.message);
  }

  return positioned.document;
}

export function App() {
  const [boardState, setBoardState] = useState(() => ({
    commandError: null as string | null,
    document: createInitialDocument(),
  }));
  const [activeTool, setActiveTool] = useState<ActiveToolId>(navigationToolId);
  const [drawingState, setDrawingState] = useState(initialDrawingState);
  const drawingStateRef = useRef<DrawingInteractionState>(initialDrawingState);
  const [drawingDiagnostic, setDrawingDiagnostic] = useState<string | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState("Новый текст");
  const { commandError, document } = boardState;
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

      <section className="workspace" aria-label="Рабочая область доски">
        <BoardStage
          drawingModeKey={isDrawingToolId(activeTool) ? activeTool : null}
          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}
          onWorldPointerStart={startDrawing}
          onViewportCommit={commitViewport}
          panMode={activeTool === navigationToolId}
          previewItems={previewItems}
          registry={registry}
          scene={scene}
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
            {activeTool === navigationToolId ? "Навигация" : "Создание объекта"}
          </strong>
          <span>
            {activeTool === navigationToolId
              ? "Потяните полотно для перемещения"
              : "Потяните или нажмите на полотно"}
          </span>
          <span>Space / средняя кнопка — временное перемещение</span>
          <span>Escape — отменить действие</span>
        </aside>

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
          BoardDocument 0.1
        </span>
        <span data-testid="first-object-position">
          Объект: {firstObject?.position.x ?? 0}, {firstObject?.position.y ?? 0}
        </span>
        <span data-testid="object-count">{document.order.length} объекта</span>
        <span data-testid="interaction-state">{drawingState.kind}</span>
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
