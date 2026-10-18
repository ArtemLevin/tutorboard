import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drawingTools } from "../../modules/drawing/public";
import { BoardToolDock } from "./BoardToolDock";
import { defaultDrawingToolStyle } from "./tool-preferences";

type DockProps = ComponentProps<typeof BoardToolDock>;

function fixture(): DockProps {
  const pen = defaultDrawingToolStyle("drawing.pen");
  return {
    activeStyle: pen,
    activeTool: "drawing.pen",
    spotlightRadiusPx: 170,
    spotlightDimPercent: 75,
    onSpotlightRadiusChange: vi.fn(),
    onSpotlightDimChange: vi.fn(),
    canRedo: false,
    canUndo: false,
    drawingTools,
    favoriteTools: ["drawing.pen", "editing.eraser"],
    penPresets: [pen, pen, pen],
    lastSelectedPenPreset: 0,
    onToggleFavorite: vi.fn(),
    onApplyPenPreset: vi.fn(),
    onSavePenPreset: vi.fn(),
    stylusEraserEnabled: false,
    onStylusEraserEnabledChange: vi.fn(),
    eraserDiameterPx: 24,
    geometryAvailable: true,
    geometryOpen: false,
    handwrittenFunctionsEnabled: true,
    imageAccept: "image/png",
    onActivate: vi.fn(),
    onCreatePlot: vi.fn(),
    onExportPngSnapshot: vi.fn(),
    onEraserDiameterChange: vi.fn(),
    onGeometryToggle: vi.fn(),
    onImageFiles: vi.fn(),
    onOpenSettings: vi.fn(),
    onEnterLessonMode: vi.fn(),
    lessonModeAvailable: true,
    onRedo: vi.fn(),
    onStyleChange: vi.fn(),
    onUndo: vi.fn(),
    readOnly: false,
    selectedCount: 0,
    selectedLocked: false,
    selectedStyle: undefined,
    selectionInspectorOpen: false,
    onDeleteSelection: vi.fn(),
    canOpenSolid3D: false,
    onOpenSolid3D: vi.fn(),
    onSelectionLockChange: vi.fn(),
    onSelectionStyleChange: vi.fn(),
    onGeneratedFigureLabelsChange: vi.fn(),
    onGeneratedFigureLabelsMove: vi.fn(),
    onVertexConstruction: vi.fn(),
    canTransformSelection: false,
    onSelectedTextCommit: vi.fn(),
    onTransformSelection: vi.fn(),
    selectedText: null,
    generatedFigureLabelsVisible: null,
    selectedVertexName: null,
    vertexConstructions: [],
    settingsOpen: false,
    textDraft: "",
    onTextDraftChange: vi.fn(),
  };
}

function advance(ms: number) {
  // React processes this synchronous fake-timer callback within the act scope.
  void act(() => vi.advanceTimersByTime(ms));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dock popup inactivity contract", () => {
  it("reuses the laser button for Spotlight without shifting dock buttons", () => {
    const props = fixture();
    const onActivate = vi.fn();
    const view = render(
      <BoardToolDock
        {...props}
        activeTool="navigation.pan"
        onActivate={onActivate}
      />,
    );
    const toolbar = screen.getByRole("toolbar", {
      name: "Инструменты доски",
    });
    const initialCount = toolbar.querySelectorAll("button").length;

    fireEvent.click(screen.getByRole("button", { name: "Лазерная указка (K)" }));
    expect(onActivate).toHaveBeenLastCalledWith("presentation.laser");
    view.rerender(
      <BoardToolDock
        {...props}
        activeTool="presentation.laser"
        onActivate={onActivate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Лазерная указка (K)" }));
    expect(onActivate).toHaveBeenLastCalledWith("presentation.spotlight");
    view.rerender(
      <BoardToolDock
        {...props}
        activeTool="presentation.spotlight"
        onActivate={onActivate}
      />,
    );
    const spotlightButton = screen.getByRole("button", {
      name: "Фонарь (Shift+K)",
    });
    expect(spotlightButton).toHaveAttribute("aria-pressed", "true");
    expect(toolbar.querySelectorAll("button")).toHaveLength(initialCount);
  });

  it.each([
    ["drawing.pen", "Первичные настройки инструмента"],
    ["drawing.smart-ink", "Первичные настройки инструмента"],
    ["drawing.line", "Первичные настройки инструмента"],
    ["drawing.text", "Первичные настройки инструмента"],
    ["editing.eraser", "Первичные настройки ластика"],
    ["presentation.laser", "Настройки лазерной указки"],
    ["presentation.spotlight", "Настройки фонаря"],
  ])("dismisses %s after exactly two idle seconds", (tool, label) => {
    render(<BoardToolDock {...fixture()} activeTool={tool} />);
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    advance(1_999);
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    advance(1);
    expect(
      screen.queryByRole("region", { name: label }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["Выделение", "Меню выделения"],
    ["Избранное", "Меню избранных инструментов"],
    ["Рисование", "Меню рисования"],
    ["Математика", "Меню математики"],
    ["ИИ-инструменты", "Меню ИИ"],
    ["Медиа", "Меню медиа"],
    ["Экспорт доски", "Форматы экспорта"],
  ])("dismisses the %s menu and resets aria-expanded", (trigger, label) => {
    render(<BoardToolDock {...fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    expect(screen.getByRole("menu", { name: label })).toBeInTheDocument();
    advance(2_000);
    expect(screen.queryByRole("menu", { name: label })).toBeNull();
    expect(screen.getByRole("button", { name: trigger })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    expect(screen.getByRole("menu", { name: label })).toBeInTheDocument();
  });

  it("counts interaction from the latest pointer, keyboard and input event", () => {
    render(<BoardToolDock {...fixture()} />);
    const panel = screen.getByRole("region", {
      name: "Первичные настройки инструмента",
    });
    advance(1_500);
    fireEvent.pointerMove(panel);
    advance(1_500);
    expect(panel).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("spinbutton", { name: "Толщина инструмента" }),
      { key: "ArrowUp" },
    );
    advance(1_500);
    expect(panel).toBeInTheDocument();
    fireEvent.input(
      screen.getByRole("slider", { name: "Прозрачность инструмента" }),
    );
    advance(1_999);
    expect(panel).toBeInTheDocument();
    advance(1);
    expect(panel).not.toBeInTheDocument();
  });

  it("pauses during a slider drag and resumes after release outside the dock", () => {
    render(<BoardToolDock {...fixture()} />);
    const panel = screen.getByRole("region", {
      name: "Первичные настройки инструмента",
    });
    fireEvent.pointerDown(
      screen.getByRole("slider", { name: "Прозрачность инструмента" }),
    );
    advance(3_000);
    expect(panel).toBeInTheDocument();
    fireEvent.pointerUp(window);
    advance(1_999);
    expect(panel).toBeInTheDocument();
    advance(1);
    expect(panel).not.toBeInTheDocument();
  });

  it("reopens the pen panel when reselecting its active tool or preset", () => {
    render(<BoardToolDock {...fixture()} />);
    advance(2_000);
    expect(
      screen.queryByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Рисование" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Перо/ }));
    expect(
      screen.getByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeInTheDocument();
    advance(2_000);
    fireEvent.click(
      screen.getByRole("button", { name: "Применить стиль пера А" }),
    );
    expect(
      screen.getByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeInTheDocument();
  });

  it("does not reveal the underlying pen settings when a dock menu expires", () => {
    render(<BoardToolDock {...fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Рисование" }));
    advance(2_000);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeNull();
    advance(2_000);
    expect(
      screen.queryByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Применить стиль пера А" }),
    );
    expect(
      screen.getByRole("region", { name: "Первичные настройки инструмента" }),
    ).toBeInTheDocument();
  });

  it("remounts the selection panel for another selection and cleans up timers", () => {
    const props = fixture();
    const selectedStyle = defaultDrawingToolStyle("drawing.pen");
    const view = render(
      <BoardToolDock
        {...props}
        selectedCount={1}
        selectedStyle={selectedStyle}
        selectionInspectorOpen
        selectionKey="object:a"
      />,
    );
    const label = "Первичные настройки выделения";
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    advance(2_000);
    expect(screen.queryByRole("region", { name: label })).toBeNull();
    view.rerender(
      <BoardToolDock
        {...props}
        selectedCount={1}
        selectedStyle={selectedStyle}
        selectionInspectorOpen
        selectionKey="object:b"
      />,
    );
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
