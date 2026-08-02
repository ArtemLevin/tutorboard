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
  WorldPointerSample,
} from "../adapters/canvas-konva/public";
import type { MathInkRecognizer } from "../modules/handwritten-function/public";
import { App } from "./App";

vi.mock("../adapters/canvas-konva/public", () => ({
  BoardStage: (props: BoardStageProps) => {
    const start: WorldPointerSample = {
      point: { x: 20, y: 30 },
      pointerId: 7,
      pressure: 0.5,
    };
    const finish: WorldPointerSample = {
      point: { x: 90, y: 70 },
      pointerId: 7,
      pressure: 0.5,
    };
    return (
      <button
        onClick={() => {
          props.onWorldPointerStart(start);
          props.onWorldPointerMove(finish);
          props.onWorldPointerFinish(finish);
        }}
        type="button"
      >
        Нарисовать штрих
      </button>
    );
  },
  createDefaultKonvaRendererRegistry: () => ({}),
}));

afterEach(cleanup);

describe("handwritten function workflow safeguards", () => {
  it("disables the tool for a read-only board", () => {
    render(<App readOnly />);

    expect(
      screen.getByRole("button", { name: "Рукописная функция (F)" }),
    ).toBeDisabled();
  });

  it("keeps completed ink when Escape closes the workflow", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Рукописная функция (F)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Нарисовать штрих" }));
    expect(screen.getByText("Штрихов: 1")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("complementary", { name: "Рукописная функция" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("drawing.pen-stroke")).toBeInTheDocument();
  });

  it("preserves source ink when recognition fails", async () => {
    const recognizer: MathInkRecognizer = {
      id: "test.failing-recognizer",
      recognize: () =>
        Promise.reject(new Error("Recognition service unavailable")),
      version: "1",
    };
    render(<App mathInkRecognizer={recognizer} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Рукописная функция (F)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Нарисовать штрих" }));
    fireEvent.click(screen.getByRole("button", { name: "Распознать" }));

    await waitFor(() =>
      expect(
        screen.getByText("Recognition service unavailable"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("Штрихи сохранены")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Функция y =" })).toBeEnabled();
  });
});
