import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BoardStageProps,
  SelectionPointerStartSample,
  WorldPointerSample,
} from "../adapters/canvas-konva/public";
import { App } from "./App";

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
      objectId:
        "object:welcome-card" as SelectionPointerStartSample["objectId"],
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
    expect(screen.getByText("BoardDocument 0.2")).toBeInTheDocument();
  });

  it("composes a drawing gesture into one document command", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Прямоугольник (R)" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));

    expect(screen.getByTestId("object-count")).toHaveTextContent("5 объекта");
    expect(screen.getByTestId("interaction-state")).toHaveTextContent("idle");
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

  it("inserts a safe SVG as one selected board object", async () => {
    render(<App />);
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40" /></svg>',
      ],
      "shape.svg",
      { type: "image/svg+xml" },
    );

    fireEvent.change(screen.getByLabelText("Вставить SVG"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByTestId("object-count")).toHaveTextContent("5 объекта"),
    );
    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "1 выбрано",
    );
  });

  it("selects and moves one object through one document command", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Выделение (V)" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Переместить выделение" }),
    );

    expect(screen.getByTestId("selection-count")).toHaveTextContent(
      "1 выбрано",
    );
    expect(screen.getByTestId("first-object-position")).toHaveTextContent(
      "Объект: 100, 90",
    );
    expect(
      screen.getByRole("complementary", { name: "Выделенные объекты" }),
    ).toBeInTheDocument();
  });
});
