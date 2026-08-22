import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("../adapters/canvas-konva/public", () => ({
  BoardCanvasAdapter: ({
    onBackgroundDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  }: {
    onBackgroundDoubleClick?: (event: unknown) => void;
    onPointerDown?: (event: unknown) => void;
    onPointerMove?: (event: unknown) => void;
    onPointerUp?: (event: unknown) => void;
    onWheel?: (event: unknown) => void;
  }) => (
    <div aria-label="Бесконечное полотно TutorBoard" role="application">
      <button
        onClick={() =>
          onBackgroundDoubleClick?.({
            button: 0,
            buttons: 0,
            clientPoint: { x: 100, y: 100 },
            modifiers: { alt: false, ctrl: false, meta: false, shift: false },
            pointerId: 1,
            pointerType: "mouse",
            pressure: 0,
            screenPoint: { x: 100, y: 100 },
            timeStamp: 1,
            worldPoint: { x: 100, y: 100 },
          })
        }
        type="button"
      >
        Двойной клик
      </button>
      <button
        onClick={() => {
          onPointerDown?.({
            button: 0,
            buttons: 1,
            clientPoint: { x: 100, y: 100 },
            modifiers: { alt: false, ctrl: false, meta: false, shift: false },
            pointerId: 1,
            pointerType: "mouse",
            pressure: 0.5,
            screenPoint: { x: 100, y: 100 },
            timeStamp: 1,
            worldPoint: { x: 100, y: 100 },
          });
          onPointerMove?.({
            button: 0,
            buttons: 1,
            clientPoint: { x: 120, y: 120 },
            modifiers: { alt: false, ctrl: false, meta: false, shift: false },
            pointerId: 1,
            pointerType: "mouse",
            pressure: 0.5,
            screenPoint: { x: 120, y: 120 },
            timeStamp: 2,
            worldPoint: { x: 120, y: 120 },
          });
          onPointerUp?.({
            button: 0,
            buttons: 0,
            clientPoint: { x: 120, y: 120 },
            modifiers: { alt: false, ctrl: false, meta: false, shift: false },
            pointerId: 1,
            pointerType: "mouse",
            pressure: 0,
            screenPoint: { x: 120, y: 120 },
            timeStamp: 3,
            worldPoint: { x: 120, y: 120 },
          });
        }}
        type="button"
      >
        Завершить жест
      </button>
      <button
        onClick={() =>
          onWheel?.({
            button: 0,
            buttons: 0,
            clientPoint: { x: 100, y: 100 },
            deltaX: 0,
            deltaY: -120,
            modifiers: { alt: false, ctrl: false, meta: false, shift: false },
            pointerId: 1,
            pointerType: "mouse",
            pressure: 0,
            screenPoint: { x: 100, y: 100 },
            timeStamp: 4,
            worldPoint: { x: 100, y: 100 },
          })
        }
        type="button"
      >
        Колесо
      </button>
    </div>
  ),
  canvasAdapterContractVersion: "test",
  createDefaultKonvaRendererRegistry: () => ({}),
}));

vi.mock("../adapters/canvas-konva/CoordinatePlotRenderer", () => ({
  CoordinatePlotRenderer: ({
    object,
    ...props
  }: {
    object: { id: string };
    coordinatePlotInteraction?: {
      onViewportCommit?: (
        objectId: string,
        viewport: {
          equalScale: boolean;
          xMax: number;
          xMin: number;
          yMax: number;
          yMin: number;
        },
      ) => boolean;
    };
  }) => {
    const objectId = object.id;
    return (
      <div>
        <button
          onClick={() => {
            props.coordinatePlotInteraction?.onViewportCommit?.(objectId, {
              equalScale: true,
              xMax: 8,
              xMin: -12,
              yMax: 11,
              yMin: -9,
            });
          }}
          type="button"
        >
          Переместить график
        </button>
      </div>
    );
  },
  createDefaultKonvaRendererRegistry: () => ({}),
}));

afterEach(cleanup);

function chooseTool(menu: string, tool: string): void {
  fireEvent.click(screen.getByRole("button", { name: menu }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: tool }));
}

describe("App", () => {
  it("composes the infinite canvas workspace", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "TutorBoard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Рабочая область доски" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("application", {
        name: "Бесконечное полотно TutorBoard",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Перемещение/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("BoardDocument 1.4")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Фигуры" }),
    ).not.toBeInTheDocument();
  });

  it("exposes board export through a dedicated toolbar icon", () => {
    const onExportPdfSnapshot = vi.fn();
    const onExportPngSnapshot = vi.fn();
    const onExportSvgSnapshot = vi.fn();
    render(
      <App
        onExportPdfSnapshot={onExportPdfSnapshot}
        onExportPngSnapshot={onExportPngSnapshot}
        onExportSvgSnapshot={onExportSvgSnapshot}
      />,
    );

    const exportButton = screen.getByRole("button", { name: "Экспорт доски" });
    expect(exportButton).toHaveAttribute("aria-haspopup", "menu");
    expect(exportButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(exportButton);
    expect(exportButton).toHaveAttribute("aria-expanded", "true");

    expect(
      screen.getByRole("menu", { name: "Форматы экспорта" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "PNG — изображение" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "PDF — документ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "SVG — вектор" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "PNG — изображение" }),
    );
    expect(onExportPngSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "document:local-board" }),
    );
    expect(exportButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("menu", { name: "Форматы экспорта" }),
    ).not.toBeInTheDocument();
  });

  it("composes a drawing gesture into one document command", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(screen.getByTestId("object-count")).toHaveText("1 объекта");
  });

  it("zooms the viewport from the wheel", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Колесо" }));

    expect(screen.getByTestId("viewport-zoom")).not.toHaveTextContent("100%");
  });

  it("opens the text editor from a board double click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Двойной клик" }));

    expect(screen.getByRole("textbox", { name: "Текст на доске" })).toBeVisible();
  });

  it("switches drawing tools from the dock", () => {
    render(<App />);

    chooseTool("Рисование", "Прямоугольник (R)");

    expect(
      screen.getByRole("button", { name: "Рисование" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
