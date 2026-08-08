import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import generateSuccessJson from "../../contracts/geometryos/fixtures/generate-success.response.json?raw";
import layoutSuccessJson from "../../contracts/geometryos/fixtures/layout-success.response.json?raw";
import type {
  BoardStageProps,
  SelectionPointerStartSample,
  WorldPointerSample,
} from "../adapters/canvas-konva/public";
import { createGeometryOsHttpClient } from "../adapters/geometryos-http/public";
import { actorId, geometryOsRequestId } from "../core/public";
import {
  createFakeMathInkRecognizer,
  mathInkRecognitionResultSchemaVersion,
} from "../modules/handwritten-function/public";
import { App } from "./App";

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

vi.mock("../adapters/canvas-konva/public", () => ({
  BoardStage: (props: BoardStageProps) => {
    const start: WorldPointerSample = {
      point: { x: 10, y: 20 },
      pointerId: 1,
      pressure: 0.5,
    };
    const finish: WorldPointerSample = {
      point: { x: 70, y: 80 },
      pointerId: 1,
      pressure: 0.5,
    };
    const selectionStart: SelectionPointerStartSample = {
      additive: false,
      objectId: props.scene.items[0]?.object.id ?? null,
      point: { x: 80, y: 80 },
      pointerId: 2,
      pressure: 0,
    };
    const selectionFinish: WorldPointerSample = {
      point: { x: 100, y: 90 },
      pointerId: 2,
      pressure: 0,
    };
    return (
      <div
        aria-label="Бесконечное полотно TutorBoard"
        data-laser-active={props.laserActive}
        data-laser-point={
          props.laserPoint === null || props.laserPoint === undefined
            ? "none"
            : `${props.laserPoint.x},${props.laserPoint.y}`
        }
        data-laser-trail-opacity={props.laserTrailOpacity}
        data-laser-trail-points={props.laserTrailPoints?.length ?? 0}
        role="application"
      >
        <button
          onClick={() => props.onWorldPointerHover?.(finish.point)}
          type="button"
        >
          Навести указку
        </button>
        <button
          onClick={() => {
            props.onWorldPointerStart(start);
            props.onWorldPointerMove(finish);
          }}
          type="button"
        >
          Провести указкой
        </button>
        <button
          onClick={() => props.onWorldPointerFinish(finish)}
          type="button"
        >
          Отпустить указку
        </button>
        <button
          onClick={() => {
            props.onWorldPointerStart(start);
            props.onWorldPointerMove(finish);
            props.onWorldPointerFinish(finish);
          }}
          type="button"
        >
          Завершить жест
        </button>
        <button
          onClick={() => {
            props.onSelectionPointerStart(selectionStart);
            props.onSelectionPointerMove(selectionFinish);
            props.onSelectionPointerFinish(selectionFinish);
          }}
          type="button"
        >
          Переместить выделение
        </button>
        <button
          onClick={() => {
            const objectId = props.scene.items[0]?.object.id;
            if (objectId !== undefined) {
              props.onObjectSettingsRequest?.(objectId);
            }
          }}
          type="button"
        >
          Открыть настройки объекта
        </button>
        <button
          onClick={() =>
            props.onCanvasContextMenuRequest?.({
              clientPoint: { x: 180, y: 140 },
              objectId: null,
              worldPoint: { x: 42, y: 56 },
            })
          }
          type="button"
        >
          Открыть меню холста
        </button>
        <button
          onClick={() => {
            const objectId = props.scene.items.find(
              ({ object }) => object.kind === "math.coordinate-plot",
            )?.object.id;
            if (objectId !== undefined) {
              props.coordinatePlotInteraction?.onViewportCommit?.(objectId, {
                equalScale: true,
                xMax: 8,
                xMin: -12,
                yMax: 11,
                yMin: -9,
              });
            }
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
    expect(screen.getByText("BoardDocument 1.3")).toBeInTheDocument();
  });

  it("composes a drawing gesture into one document command", () => {
    render(<App />);

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByTestId("interaction-state")).toHaveTextContent("idle");
  });

  it("opens every compact tool menu exclusively and closes it with Escape", () => {
    render(<App />);

    const expected = [
      ["Выделение", "Меню выделения"],
      ["Рисование", "Меню рисования"],
      ["Фигуры", "Меню фигур"],
      ["Математика", "Меню математики"],
      ["ИИ-инструменты", "Меню ИИ"],
      ["Медиа", "Меню медиа"],
    ] as const;
    for (const [trigger, menu] of expected) {
      fireEvent.click(screen.getByRole("button", { name: trigger }));
      expect(screen.getByRole("menu", { name: menu })).toBeInTheDocument();
      expect(screen.getAllByRole("menu")).toHaveLength(1);
    }
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("creates preset and configurable regular polygons", () => {
    const onCommandCommitted = vi.fn();
    render(<App onCommandCommitted={onCommandCommitted} />);

    chooseTool("Фигуры", "Шестиугольник");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    const firstCommand = onCommandCommitted.mock.calls[0]?.[0] as {
      readonly objects: readonly {
        readonly kind: string;
        readonly points: readonly unknown[];
      }[];
    };
    expect(firstCommand.objects[0]).toMatchObject({
      kind: "drawing.pen-stroke",
    });
    expect(firstCommand.objects[0]?.points).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: "Фигуры" }));
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "Количество сторон многоугольника",
      }),
      { target: { value: "9" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Выбрать" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    const secondCommand = onCommandCommitted.mock.calls[1]?.[0] as {
      readonly objects: readonly { readonly points: readonly unknown[] }[];
    };
    expect(secondCommand.objects[0]?.points).toHaveLength(10);
  });

  it("uses an ephemeral laser pointer without changing the document", () => {
    render(<App />);
    const canvas = screen.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Лазерная указка (K)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Навести указку" }));
    expect(canvas).toHaveAttribute("data-laser-active", "true");
    expect(canvas).toHaveAttribute("data-laser-point", "70,80");
    fireEvent.click(screen.getByRole("button", { name: "Провести указкой" }));
    expect(canvas).toHaveAttribute("data-laser-trail-points", "2");
    expect(canvas).toHaveAttribute("data-laser-trail-opacity", "1");
    fireEvent.click(screen.getByRole("button", { name: "Отпустить указку" }));
    expect(canvas).toHaveAttribute("data-laser-trail-points", "2");
    expect(screen.getByTestId("object-count")).toHaveTextContent("0 объекта");

    fireEvent.keyDown(window, { key: "h" });
    expect(canvas).toHaveAttribute("data-laser-active", "false");
    expect(canvas).toHaveAttribute("data-laser-point", "none");
    expect(canvas).toHaveAttribute("data-laser-trail-points", "0");
  });

  it("exposes PDF export and board sharing from document settings", () => {
    const onExportPdfSnapshot = vi.fn();
    const onShareBoard = vi.fn();
    render(
      <App
        onExportPdfSnapshot={onExportPdfSnapshot}
        onShareBoard={onShareBoard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Настройки доски" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить PDF" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Копировать ссылку на доску" }),
    );
    expect(onExportPdfSnapshot).toHaveBeenCalledTimes(1);
    expect(onShareBoard).toHaveBeenCalledTimes(1);
  });

  it("emits successful mutations with the authenticated command actor", () => {
    const onCommandCommitted = vi.fn();
    render(
      <App
        commandActorId={actorId("user:server-tutor")}
        historyEnabled={false}
        onCommandCommitted={onCommandCommitted}
      />,
    );

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(onCommandCommitted).toHaveBeenCalledTimes(1);
    expect(onCommandCommitted.mock.calls[0]?.[0]).toMatchObject({
      actorId: "user:server-tutor",
      kind: "core.objects.add",
    });
    expect(screen.getByRole("button", { name: /Отменить/ })).toBeDisabled();
  });

  it("undoes and redoes one completed gesture as one history item", () => {
    render(<App />);

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/0");

    fireEvent.click(screen.getByRole("button", { name: /Отменить/ }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("0 объекта");
    expect(screen.getByTestId("history-depth")).toHaveTextContent("0/1");

    fireEvent.keyDown(window, { ctrlKey: true, key: "z", shiftKey: true });
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/0");
  });

  it("automatically accepts and atomically undoes a recognized Smart Ink figure", () => {
    render(<App />);

    chooseTool("ИИ-инструменты", "Smart Ink (I)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(
      screen.queryByRole("complementary", {
        name: "Предложение Smart Ink",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("drawing.line")).toBeInTheDocument();
    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");

    fireEvent.keyDown(window, { ctrlKey: true, key: "z" });
    expect(screen.getByText("drawing.pen-stroke")).toBeInTheDocument();
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/1");
  });

  it("captures, recognizes, builds and atomically undoes a handwritten function", async () => {
    const onCommandCommitted = vi.fn();
    const recognizer = createFakeMathInkRecognizer({
      result: {
        candidates: [
          {
            confidence: 0.98,
            expression: "x^2-1",
            format: "plot-expression",
          },
        ],
        diagnostics: [],
        recognizerId: "test.handwriting",
        recognizerVersion: "1",
        schemaVersion: mathInkRecognitionResultSchemaVersion,
        status: "recognized",
      },
    });
    render(
      <App
        mathInkRecognizer={recognizer}
        onCommandCommitted={onCommandCommitted}
      />,
    );

    chooseTool("ИИ-инструменты", "Рукописная функция (F)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    expect(screen.getByText("Штрихов: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Распознать" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Функция y =" })).toHaveValue(
        "x^2-1",
      ),
    );
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(recognizer.getRequests()).toHaveLength(1);

    fireEvent.change(screen.getByRole("textbox", { name: "Функция y =" }), {
      target: { value: "a*x^2+b" },
    });
    expect(screen.getByText("a, b")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Построить график" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("math.coordinate-plot")).toBeInTheDocument();
    expect(onCommandCommitted.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "core.objects.replace",
    });
    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");

    fireEvent.keyDown(window, { ctrlKey: true, key: "z" });
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(screen.getAllByText("drawing.pen-stroke")).toHaveLength(2);
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/1");
  });

  it("copies, pastes and cuts a deterministic selection closure", () => {
    render(<App />);

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    chooseTool("Выделение", "Выделение (V)");
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Настройки доски" }));
    fireEvent.click(screen.getByRole("button", { name: "Копировать" }));
    fireEvent.click(screen.getByRole("button", { name: "Вставить" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(screen.getByText("Вставлено: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вырезать" }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
  });

  it("creates text, pastes and clears the board from the canvas menu", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть меню холста" }),
    );
    const menu = screen.getByRole("menu", { name: "Меню холста" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Вставить" })).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Очистить холст" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Текст" }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("drawing.text")).toBeInTheDocument();

    fireEvent.keyDown(window, { ctrlKey: true, key: "c" });
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть меню холста" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Вставить" }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть меню холста" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Очистить холст" }));
    const dialog = screen.getByRole("alertdialog", { name: "Очистить холст?" });
    expect(dialog).toHaveTextContent("Будут удалены все объекты (2)");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть меню холста" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Очистить холст" }));
    fireEvent.click(screen.getByRole("button", { name: /^Очистить$/ }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("0 объекта");
    fireEvent.keyDown(window, { ctrlKey: true, key: "z" });
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
  });

  it("reports document changes and visible persistence status", () => {
    const onDocumentChange = vi.fn();
    render(
      <App
        onDocumentChange={onDocumentChange}
        persistenceStatus={{ kind: "saved", label: "Сохранено локально" }}
      />,
    );

    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("persistence-status")).toHaveTextContent(
      "Сохранено локально",
    );
  });

  it("inserts a safe SVG as one selected embedded image", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Медиа" }));
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40" /></svg>',
      ],
      "shape.svg",
      { type: "image/svg+xml" },
    );

    fireEvent.change(screen.getByLabelText("Вставить изображения"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта"),
    );
    expect(screen.getByText("image.embedded")).toBeInTheDocument();
    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "1 выбрано",
    );
  });

  it("selects and moves one object through one document command", () => {
    render(<App />);

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    chooseTool("Выделение", "Выделение (V)");
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );

    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "1 выбрано",
    );
    expect(screen.getByTestId("first-object-position")).toHaveTextContent(
      "Объект: 30, 30",
    );
    expect(
      screen.queryByRole("region", { name: "Первичные настройки выделения" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть настройки объекта" }),
    );
    expect(
      screen.getByRole("region", { name: "Первичные настройки выделения" }),
    ).toBeInTheDocument();
  });

  it("creates a graph without opening its editor and opens it on settings request", () => {
    render(<App />);

    chooseTool("Математика", "Координатная плоскость (G)");
    expect(
      screen.queryByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(
      screen.queryByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть настройки объекта" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).toBeInTheDocument();
  });

  it("commits a closed coordinate plot pan as one semantic history item", () => {
    const onCommandCommitted = vi.fn();
    render(<App onCommandCommitted={onCommandCommitted} />);

    chooseTool("Математика", "Координатная плоскость (G)");
    fireEvent.click(screen.getByRole("button", { name: "Переместить график" }));

    expect(onCommandCommitted).toHaveBeenCalledTimes(2);
    expect(onCommandCommitted.mock.calls[1]?.[0]).toMatchObject({
      kind: "core.coordinate-plot.update",
      replacement: {
        coordinateViewport: { xMin: -12, xMax: 8, yMin: -9, yMax: 11 },
      },
    });
    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");
  });

  it("moves a selection by keyboard and closes shortcut help with Escape", () => {
    render(<App />);

    chooseTool("Фигуры", "Прямоугольник (R)");
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    chooseTool("Выделение", "Выделение (V)");
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("first-object-position")).toHaveTextContent(
      "Объект: 31, 30",
    );

    fireEvent.click(screen.getByRole("button", { name: "Настройки доски" }));
    const trigger = screen.getByRole("button", { name: "Горячие клавиши" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Горячие клавиши" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Горячие клавиши" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("runs the GeometryOS vertical flow and selects one atomic import", async () => {
    const requestId = geometryOsRequestId("tutorboard-request:unit");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/ready")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              checks: [
                { name: "lifecycle", status: "pass" },
                { name: "executor", status: "pass" },
              ],
              status: "ready",
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "X-Request-ID": requestId,
              },
              status: 200,
            },
          ),
        );
      }
      if (url.endsWith("/api/v1/generate")) {
        return Promise.resolve(
          new Response(generateSuccessJson, {
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": requestId,
            },
            status: 200,
          }),
        );
      }
      if (url.endsWith("/api/v1/layout")) {
        return Promise.resolve(
          new Response(layoutSuccessJson, {
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": requestId,
            },
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    const client = createGeometryOsHttpClient({
      baseUrl: "https://geometryos.example.test",
      createRequestId: () => requestId,
      fetch: fetchMock,
    });
    render(<App geometryOsClient={client} />);

    chooseTool("ИИ-инструменты", "Построение по тексту");
    fireEvent.change(screen.getByLabelText("Текст построения"), {
      target: { value: "Построй треугольник ABC" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать для размещения" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Провести указкой" }));

    await waitFor(() =>
      expect(screen.getByTestId("object-count")).toHaveTextContent(
        "12 объекта",
      ),
    );
    expect(screen.getByTestId("geometry-import-count")).toHaveTextContent(
      "1 построений",
    );
    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "12 выбрано",
    );
  });
});
