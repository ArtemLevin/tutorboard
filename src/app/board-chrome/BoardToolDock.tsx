import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import type { ObjectStyle } from "../../core/public";
import {
  isDrawingToolId,
  type DrawingToolDefinition,
  type DrawingToolId,
} from "../../modules/drawing/public";
import {
  lassoSelectionTool,
  lassoSelectionToolId,
  isSelectionToolId,
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
  readonly onPolygonSidesChange: (sides: number) => void;
  readonly onStyleChange: (
    tool: DrawingToolId,
    patch: Partial<ObjectStyle>,
  ) => void;
  readonly onUndo: () => void;
  readonly readOnly: boolean;
  readonly polygonSides: number;
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
  expanded,
  disabled = false,
  hasPopup,
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly hasPopup?: "menu";
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
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

type DockMenuId = "ai" | "drawing" | "math" | "media" | "selection" | "shapes";

function MenuItem({
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
      aria-checked={active}
      className={active ? "dock-menu-item is-active" : "dock-menu-item"}
      disabled={disabled}
      onClick={onClick}
      role="menuitemradio"
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
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
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<DockMenuId | null>(null);
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
    activeDrawingTool === "drawing.ellipse" ||
    activeDrawingTool === "drawing.polygon";

  useEffect(() => {
    if (openMenu === null) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };
    const closeFromEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpenMenu(null);
      menuTriggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromEscape, true);
    };
  }, [openMenu]);

  const toggleMenu = (menu: DockMenuId) => {
    const trigger = document.activeElement;
    menuTriggerRef.current =
      trigger instanceof HTMLButtonElement ? trigger : null;
    setOpenMenu((current) => (current === menu ? null : menu));
  };
  const chooseTool = (tool: string) => {
    if (props.geometryOpen) props.onGeometryToggle();
    props.onActivate(tool);
    setOpenMenu(null);
  };
  const tool = (id: DrawingToolId) =>
    props.drawingTools.find((candidate) => candidate.id === id);
  const drawingActive = [
    "drawing.pen",
    "drawing.line",
    "drawing.text",
  ].includes(props.activeTool);
  const shapesActive = [
    "drawing.rectangle",
    "drawing.ellipse",
    "drawing.polygon",
  ].includes(props.activeTool);
  const aiActive =
    props.activeTool === "drawing.smart-ink" ||
    props.activeTool === "math.handwritten-function" ||
    props.geometryOpen;

  const drawingMenuItems = [
    tool("drawing.pen"),
    tool("drawing.line"),
    tool("drawing.text"),
  ].filter((item): item is DrawingToolDefinition => item !== undefined);

  return (
    <div className="board-tool-dock-shell" ref={rootRef}>
      {openMenu === "selection" ? (
        <section aria-label="Меню выделения" className="dock-menu" role="menu">
          <MenuItem
            active={props.activeTool === selectionToolId}
            icon={selectionTool.icon}
            label={`${selectionTool.label} (${selectionTool.shortcut})`}
            onClick={() => chooseTool(selectionToolId)}
          />
          <MenuItem
            active={props.activeTool === lassoSelectionToolId}
            icon={lassoSelectionTool.icon}
            label={`${lassoSelectionTool.label} (${lassoSelectionTool.shortcut})`}
            onClick={() => chooseTool(lassoSelectionToolId)}
          />
        </section>
      ) : openMenu === "drawing" ? (
        <section aria-label="Меню рисования" className="dock-menu" role="menu">
          {drawingMenuItems.map((item) => (
            <MenuItem
              active={props.activeTool === item.id}
              disabled={props.readOnly}
              icon={item.icon}
              key={item.id}
              label={`${item.label} (${item.shortcut})`}
              onClick={() => chooseTool(item.id)}
            />
          ))}
        </section>
      ) : openMenu === "shapes" ? (
        <section aria-label="Меню фигур" className="dock-menu" role="menu">
          <MenuItem
            active={props.activeTool === "drawing.ellipse"}
            disabled={props.readOnly}
            icon="○"
            label="Круг или эллипс (E)"
            onClick={() => chooseTool("drawing.ellipse")}
          />
          <MenuItem
            active={props.activeTool === "drawing.rectangle"}
            disabled={props.readOnly}
            icon="□"
            label="Прямоугольник (R)"
            onClick={() => chooseTool("drawing.rectangle")}
          />
          {[3, 5, 6].map((sides) => (
            <MenuItem
              active={
                props.activeTool === "drawing.polygon" &&
                props.polygonSides === sides
              }
              disabled={props.readOnly}
              icon={sides === 3 ? "△" : sides === 5 ? "⬠" : "⬡"}
              key={sides}
              label={`${sides === 3 ? "Треугольник" : sides === 5 ? "Пятиугольник" : "Шестиугольник"}`}
              onClick={() => {
                props.onPolygonSidesChange(sides);
                chooseTool("drawing.polygon");
              }}
            />
          ))}
          <label className="dock-menu-number">
            <span>N‑угольник</span>
            <input
              aria-label="Количество сторон многоугольника"
              disabled={props.readOnly}
              max="24"
              min="3"
              onChange={(event) =>
                props.onPolygonSidesChange(
                  Math.min(
                    24,
                    Math.max(3, event.currentTarget.valueAsNumber || 3),
                  ),
                )
              }
              type="number"
              value={props.polygonSides}
            />
            <button
              disabled={props.readOnly}
              onClick={() => chooseTool("drawing.polygon")}
              type="button"
            >
              Выбрать
            </button>
          </label>
        </section>
      ) : openMenu === "math" ? (
        <section aria-label="Меню математики" className="dock-menu" role="menu">
          <MenuItem
            disabled={props.readOnly}
            icon="📈"
            label="Координатная плоскость (G)"
            onClick={() => {
              props.onCreatePlot();
              setOpenMenu(null);
            }}
          />
        </section>
      ) : openMenu === "ai" ? (
        <section aria-label="Меню ИИ" className="dock-menu" role="menu">
          {tool("drawing.smart-ink") === undefined ? null : (
            <MenuItem
              active={props.activeTool === "drawing.smart-ink"}
              disabled={props.readOnly}
              icon="✦"
              label="Smart Ink (I)"
              onClick={() => chooseTool("drawing.smart-ink")}
            />
          )}
          {props.handwrittenFunctionsEnabled ? (
            <MenuItem
              active={props.activeTool === "math.handwritten-function"}
              disabled={props.readOnly}
              icon="ƒ"
              label="Рукописная функция (F)"
              onClick={() => chooseTool("math.handwritten-function")}
            />
          ) : null}
          {props.geometryAvailable ? (
            <MenuItem
              active={props.geometryOpen}
              icon="✧"
              label="Построение GeometryOS"
              onClick={() => {
                props.onGeometryToggle();
                setOpenMenu(null);
              }}
            />
          ) : null}
        </section>
      ) : openMenu === "media" ? (
        <section aria-label="Меню медиа" className="dock-menu" role="menu">
          <label
            className={
              props.readOnly ? "dock-menu-file is-disabled" : "dock-menu-file"
            }
          >
            <span aria-hidden="true">▧</span>
            <span>Изображение или GIF</span>
            <input
              accept={props.imageAccept}
              aria-label="Вставить изображения"
              disabled={props.readOnly}
              multiple
              onChange={(event) => {
                imageChange(event);
                setOpenMenu(null);
              }}
              type="file"
            />
          </label>
          <p className="dock-menu-hint">
            PNG, JPEG, SVG и анимированные GIF до 8 МБ.
          </p>
        </section>
      ) : props.selectionInspectorOpen && props.selectedStyle !== undefined ? (
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
            active={isSelectionToolId(props.activeTool)}
            expanded={openMenu === "selection"}
            hasPopup="menu"
            icon="⌖"
            label="Выделение"
            onClick={() => toggleMenu("selection")}
          />
          <span aria-hidden="true" className="dock-divider" />
          <ToolButton
            active={drawingActive}
            disabled={props.readOnly}
            expanded={openMenu === "drawing"}
            hasPopup="menu"
            icon="✎"
            label="Рисование"
            onClick={() => toggleMenu("drawing")}
          />
          <ToolButton
            active={shapesActive}
            disabled={props.readOnly}
            expanded={openMenu === "shapes"}
            hasPopup="menu"
            icon="◇"
            label="Фигуры"
            onClick={() => toggleMenu("shapes")}
          />
          <ToolButton
            expanded={openMenu === "math"}
            hasPopup="menu"
            icon="∑"
            label="Математика"
            onClick={() => toggleMenu("math")}
          />
          <ToolButton
            active={aiActive}
            expanded={openMenu === "ai"}
            hasPopup="menu"
            icon="✦"
            label="ИИ-инструменты"
            onClick={() => toggleMenu("ai")}
          />
          <ToolButton
            expanded={openMenu === "media"}
            hasPopup="menu"
            icon="▧"
            label="Медиа"
            onClick={() => toggleMenu("media")}
          />
          <ToolButton
            active={props.activeTool === "presentation.laser"}
            icon="●"
            label="Лазерная указка (K)"
            onClick={() => chooseTool("presentation.laser")}
          />
        </div>
        <span aria-hidden="true" className="dock-divider" />
        <div className="dock-fixed-group">
          <ToolButton
            active={props.settingsOpen}
            icon="⚙"
            label="Настройки доски"
            onClick={() => {
              setOpenMenu(null);
              props.onOpenSettings();
            }}
          />
        </div>
      </div>
    </div>
  );
}
