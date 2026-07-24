import { useCallback, useMemo, useState } from "react";

import {
  BoardStage,
  createDefaultKonvaRendererRegistry,
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
  type ViewportState,
} from "../core/public";
import { readEnvironment } from "./configuration/environment";
import "./styles.css";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");

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
  const [panMode, setPanMode] = useState(true);
  const { commandError, document } = boardState;
  const registry = useMemo(() => createDefaultKonvaRendererRegistry(), []);
  const scene = useMemo(() => selectBoardScene(document), [document]);

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
            aria-pressed={panMode}
            className={panMode ? "tool-button is-active" : "tool-button"}
            onClick={(event) => {
              setPanMode((active) => !active);
              event.currentTarget.blur();
            }}
            type="button"
          >
            <span aria-hidden="true">✋</span>
            Перемещение
          </button>
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
          onViewportCommit={commitViewport}
          panMode={panMode}
          registry={registry}
          scene={scene}
        />

        <aside className="canvas-help" aria-label="Подсказка по навигации">
          <strong>Навигация</strong>
          <span>Колесо — масштаб</span>
          <span>Space / средняя кнопка — перемещение</span>
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
        <span>{document.order.length} объекта</span>
        {commandError === null ? null : (
          <span className="command-error" role="alert">
            {commandError}
          </span>
        )}
      </footer>
    </main>
  );
}
