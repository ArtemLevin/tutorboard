import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

import type { ObjectStyle } from "../../core/public";
import {
  isDrawingToolId,
  type DrawingToolDefinition,
  type DrawingToolId,
} from "../../modules/drawing/public";
import {
  lassoSelectionTool,
  lassoSelectionToolId,
  selectionTool,
  selectionToolId,
} from "../../modules/selection/public";
import { ColorPalette } from "../ColorPalette";
import { StrokeStylePalette } from "../StrokeStylePalette";

interface BoardToolDockProps {
  readonly activeStyle: ObjectStyle | null;
  readonly activeTool: string;
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly drawingTools: readonly DrawingToolDefinition[];
  readonly geometryAvailable: boolean;
  readonly geometryOpen: boolean;
  readonly handwrittenFunctionsEnabled: boolean;
  readonly imageAccept: string;
  readonly onActivate: (tool: string) => void;
  readonly onCreatePlot: () => void;
  readonly onGeometryToggle: () => void;
  readonly onImageFiles: (files: readonly File[]) => void;
  readonly onOpenSettings: () => void;
  readonly onRedo: () => void;
  readonly onStyleChange: (
    tool: DrawingToolId,
    patch: Partial<ObjectStyle>,
  ) => void;
  readonly onUndo: () => void;
  readonly readOnly: boolean;
  readonly selectedCount: number;
  readonly selectedLocked: boolean;
  readonly selectedStyle: ObjectStyle | undefined;
  readonly selectionInspectorOpen: boolean;
  readonly onDeleteSelection: () => void;
  readonly onSelectionLockChange: (locked: boolean) => void;
  readonly onSelectionStyleChange: (patch: Partial<ObjectStyle>) => void;
  readonly canTransformSelection: boolean;
  readonly onSelectedTextCommit: (value: string) => void;
  readonly onTransformSelection: (
    scaleFactor: number,
    rotationDelta: number,
  ) => void;
  readonly selectedText: string | null;
  readonly settingsOpen: boolean;
  readonly textDraft: string;
  readonly onTextDraftChange: (value: string) => void;
}

function ToolButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active ? "dock-tool is-active" : "dock-tool"}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function StyleControls({
  allowFill,
  onChange,
  style,
}: {
  readonly allowFill: boolean;
  readonly onChange: (patch: Partial<ObjectStyle>) => void;
  readonly style: ObjectStyle;
}) {
  return (
    <div className="dock-style-controls">
      <ColorPalette
        label="Цвет"
        onChange={(stroke) => onChange({ stroke })}
        value={style.stroke ?? "#1c2a33"}
      />
      {allowFill ? (
        <ColorPalette
          allowNone
          label="Заливка"
          onChange={(fill) => onChange({ fill })}
          value={style.fill}
        />
      ) : null}
      {style.stroke !== null ? (
        <StrokeStylePalette
          onChange={(strokeStyle) => onChange({ strokeStyle })}
          value={style.strokeStyle ?? "thin"}
        />
      ) : null}
      <label className="dock-number-control">
        <span>Толщина</span>
        <input
          aria-label="Толщина инструмента"
          max="64"
          min="0"
          onChange={(event) =>
            onChange({ strokeWidth: event.currentTarget.valueAsNumber })
          }
          step="0.5"
          type="number"
          value={style.strokeWidth}
        />
      </label>
      <label className="dock-range-control">
        <span>Прозрачность</span>
        <input
          aria-label="Прозрачность инструмента"
          max="1"
          min="0"
          onChange={(event) =>
            onChange({ opacity: event.currentTarget.valueAsNumber })
          }
          step="0.05"
          type="range"
          value={style.opacity}
        />
      </label>
    </div>
  );
}

export function BoardToolDock(props: BoardToolDockProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const activeDrawingTool = isDrawingToolId(props.activeTool)
    ? props.activeTool
    : null;
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [
      ...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = Math.max(
      0,
      buttons.indexOf(document.activeElement as HTMLButtonElement),
    );
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[index]?.focus();
  };
  const imageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    if (files.length > 0) props.onImageFiles(files);
    event.currentTarget.value = "";
  };
  const allowFill =
    activeDrawingTool === "drawing.rectangle" ||
    activeDrawingTool === "drawing.ellipse";

  return (
    <div className="board-tool-dock-shell">
      {props.selectionInspectorOpen && props.selectedStyle !== undefined ? (
        <section
          aria-label="Первичные настройки выделения"
          className="dock-primary-settings"
        >
          <div className="dock-primary-heading">
            <strong>Выделено: {props.selectedCount}</strong>
            <div>
              <button
                onClick={() =>
                  props.onSelectionLockChange(!props.selectedLocked)
                }
                type="button"
              >
                {props.selectedLocked ? "Разблокировать" : "Заблокировать"}
              </button>
              <button onClick={props.onDeleteSelection} type="button">
                Удалить
              </button>
            </div>
          </div>
          {props.selectedText === null ? null : (
            <label className="dock-text-control">
              <span>Текст или формула</span>
              <textarea
                aria-label="Редактор выбранного текста"
                defaultValue={props.selectedText}
                key={props.selectedText}
                maxLength={100_000}
                onBlur={(event) =>
                  props.onSelectedTextCommit(event.currentTarget.value)
                }
                rows={2}
              />
            </label>
          )}
          {props.canTransformSelection ? (
            <div className="dock-transform-actions">
              <button
                aria-label="Уменьшить выделение на 10%"
                onClick={() => props.onTransformSelection(0.9, 0)}
                type="button"
              >
                −10%
              </button>
              <button
                aria-label="Увеличить выделение на 10%"
                onClick={() => props.onTransformSelection(1.1, 0)}
                type="button"
              >
                +10%
              </button>
              <button
                aria-label="Повернуть выделение на 15 градусов"
                onClick={() => props.onTransformSelection(1, 15)}
                type="button"
              >
                ↻ 15°
              </button>
            </div>
          ) : null}
          <StyleControls
            allowFill
            onChange={props.onSelectionStyleChange}
            style={props.selectedStyle}
          />
        </section>
      ) : activeDrawingTool !== null && props.activeStyle !== null ? (
        <section
          aria-label="Первичные настройки инструмента"
          className="dock-primary-settings"
        >
          <div className="dock-primary-heading">
            <strong>
              {props.drawingTools.find(({ id }) => id === activeDrawingTool)
                ?.label ?? "Инструмент"}
            </strong>
          </div>
          {activeDrawingTool === "drawing.text" ? (
            <label className="dock-text-control">
              <span>Текст</span>
              <input
                aria-label="Содержимое текста"
                maxLength={100_000}
                onChange={(event) =>
                  props.onTextDraftChange(event.currentTarget.value)
                }
                value={props.textDraft}
              />
            </label>
          ) : null}
          <StyleControls
            allowFill={allowFill}
            onChange={(patch) => props.onStyleChange(activeDrawingTool, patch)}
            style={props.activeStyle}
          />
        </section>
      ) : null}
      <div
        aria-label="Инструменты доски"
        className="board-tool-dock"
        onKeyDown={handleKeys}
        ref={toolbarRef}
        role="toolbar"
      >
        <div className="dock-fixed-group">
          <ToolButton
            disabled={!props.canUndo}
            icon="↶"
            label="Отменить (Ctrl+Z)"
            onClick={props.onUndo}
          />
          <ToolButton
            disabled={!props.canRedo}
            icon="↷"
            label="Повторить (Ctrl+Shift+Z)"
            onClick={props.onRedo}
          />
        </div>
        <span aria-hidden="true" className="dock-divider" />
        <div className="dock-scroll-group">
          <ToolButton
            active={props.activeTool === "navigation.pan"}
            icon="✋"
            label="Перемещение (H)"
            onClick={() => props.onActivate("navigation.pan")}
          />
          <ToolButton
            active={props.activeTool === selectionToolId}
            icon={selectionTool.icon}
            label={`${selectionTool.label} (${selectionTool.shortcut})`}
            onClick={() => props.onActivate(selectionToolId)}
          />
          <ToolButton
            active={props.activeTool === lassoSelectionToolId}
            icon={lassoSelectionTool.icon}
            label={`${lassoSelectionTool.label} (${lassoSelectionTool.shortcut})`}
            onClick={() => props.onActivate(lassoSelectionToolId)}
          />
          <span aria-hidden="true" className="dock-divider" />
          {props.drawingTools.map((tool) => (
            <ToolButton
              active={props.activeTool === tool.id}
              disabled={props.readOnly}
              icon={tool.icon}
              key={tool.id}
              label={`${tool.label} (${tool.shortcut})`}
              onClick={() => props.onActivate(tool.id)}
            />
          ))}
          <span aria-hidden="true" className="dock-divider" />
          <ToolButton
            disabled={props.readOnly}
            icon="📈"
            label="Создать координатную плоскость (G)"
            onClick={props.onCreatePlot}
          />
          {props.handwrittenFunctionsEnabled ? (
            <ToolButton
              active={props.activeTool === "math.handwritten-function"}
              disabled={props.readOnly}
              icon="ƒ"
              label="Рукописная функция (F)"
              onClick={() => props.onActivate("math.handwritten-function")}
            />
          ) : null}
          {props.geometryAvailable ? (
            <ToolButton
              active={props.geometryOpen}
              icon="✧"
              label="Построение GeometryOS"
              onClick={props.onGeometryToggle}
            />
          ) : null}
          <label
            className={
              props.readOnly ? "dock-file-tool is-disabled" : "dock-file-tool"
            }
            title="Вставить изображения"
          >
            <span aria-hidden="true">▧</span>
            <span className="visually-hidden">Вставить изображения</span>
            <input
              accept={props.imageAccept}
              aria-label="Вставить изображения"
              disabled={props.readOnly}
              multiple
              onChange={imageChange}
              type="file"
            />
          </label>
        </div>
        <span aria-hidden="true" className="dock-divider" />
        <div className="dock-fixed-group">
          <ToolButton
            active={props.settingsOpen}
            icon="⚙"
            label="Настройки доски"
            onClick={props.onOpenSettings}
          />
        </div>
      </div>
    </div>
  );
}
