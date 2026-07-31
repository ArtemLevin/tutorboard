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
      <div aria-label="Бесконечное полотно TutorBoard" role="application">
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
      </div>
    );
  },
  createDefaultKonvaRendererRegistry: () => ({}),
}));

afterEach(cleanup);

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
    expect(screen.getByText("BoardDocument 1.0")).toBeInTheDocument();
  });

  it("composes a drawing gesture into one document command", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByTestId("interaction-state")).toHaveTextContent("idle");
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

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Smart Ink (I)" }));
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

  it("copies, pastes and cuts a deterministic selection closure", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    fireEvent.click(screen.getByRole("button", { name: "Выделение (V)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Копировать" }));
    fireEvent.click(screen.getByRole("button", { name: "Вставить" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(screen.getByText("Вставлено: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вырезать" }));
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
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

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    fireEvent.click(screen.getByRole("button", { name: "Выделение (V)" }));
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
      screen.getByRole("complementary", { name: "Выделенные объекты" }),
    ).toBeInTheDocument();
  });

  it("moves a selection by keyboard and restores focus after shortcut help", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    fireEvent.click(screen.getByRole("button", { name: "Выделение (V)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("first-object-position")).toHaveTextContent(
      "Объект: 31, 30",
    );

    const trigger = screen.getByRole("button", { name: "Горячие клавиши" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Горячие клавиши TutorBoard" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("runs the GeometryOS vertical flow and selects one atomic import", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/api/v1/generate")) {
        return Promise.resolve(
          new Response(generateSuccessJson, {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }),
        );
      }
      if (url.endsWith("/api/v1/layout")) {
        return Promise.resolve(
          new Response(layoutSuccessJson, {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    const client = createGeometryOsHttpClient({
      baseUrl: "https://geometryos.example.test",
      fetchImpl: fetchMock,
    });
    render(
      <App
        geometryOsClient={client}
        requestIdFactory={() => geometryOsRequestId("request:unit")}
      />,
    );

    fireEvent.change(screen.getByLabelText("Запрос GeometryOS"), {
      target: { value: "Построй треугольник ABC" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Построить" }));

    await waitFor(() =>
      expect(screen.getByTestId("object-count")).toHaveTextContent(
        "7 объектов",
      ),
    );
    expect(screen.getByTestId("geometry-import-count")).toHaveTextContent(
      "1 построений",
    );
    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "7 выбрано",
    );
  });
});
