import { useEffect, useRef } from "react";

import { eraserToolId } from "../../../modules/eraser/public";
import {
  laserToolId,
  spotlightToolId,
  type ActiveToolId,
} from "../active-tool";
import "./BoardLessonModeControls.css";

export interface BoardLessonModeControlsProps {
  readonly activeTool: ActiveToolId;
  readonly fullscreen: boolean;
  readonly onActivate: (tool: ActiveToolId) => void;
  readonly onExit: () => void;
  readonly onToggleFullscreen: () => void;
}

export function BoardLessonModeControls({
  activeTool,
  fullscreen,
  onActivate,
  onExit,
  onToggleFullscreen,
}: BoardLessonModeControlsProps) {
  const penRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    penRef.current?.focus();
  }, []);

  return (
    <div
      aria-label="Инструменты режима занятия"
      className="board-lesson-controls"
      role="toolbar"
    >
      <span className="board-lesson-label">Занятие</span>
      <button
        aria-label="Перо — режим занятия"
        aria-pressed={activeTool === "drawing.pen"}
        onClick={() => onActivate("drawing.pen")}
        ref={penRef}
        title="Перо (P)"
        type="button"
      >
        <span aria-hidden="true">✎</span>
        <span>Перо</span>
      </button>
      <button
        aria-label="Ластик — режим занятия"
        aria-pressed={activeTool === eraserToolId}
        onClick={() => onActivate(eraserToolId)}
        title="Ластик (X)"
        type="button"
      >
        <span aria-hidden="true">⌫</span>
        <span>Ластик</span>
      </button>
      <button
        aria-label="Лазерная указка — режим занятия"
        aria-pressed={activeTool === laserToolId}
        onClick={() => onActivate(laserToolId)}
        title="Лазерная указка (K)"
        type="button"
      >
        <span aria-hidden="true">●</span>
        <span>Указка</span>
      </button>
      <button
        aria-label="Фонарь — режим занятия"
        aria-pressed={activeTool === spotlightToolId}
        onClick={() => onActivate(spotlightToolId)}
        title="Фонарь (Shift+K)"
        type="button"
      >
        <span aria-hidden="true">◉</span>
        <span>Фонарь</span>
      </button>
      <button
        aria-label={
          fullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
        }
        aria-pressed={fullscreen}
        onClick={onToggleFullscreen}
        title="Полноэкранный режим"
        type="button"
      >
        <span aria-hidden="true">{fullscreen ? "⤢" : "⛶"}</span>
      </button>
      <button
        aria-label="Завершить режим занятия"
        className="board-lesson-exit"
        onClick={onExit}
        title="Вернуть обычный интерфейс (Esc)"
        type="button"
      >
        Выйти
      </button>
    </div>
  );
}
