import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardDocument, BoardObject, BoardObjectId } from "../core/public";
import { App } from "./App";

vi.mock("../adapters/canvas-konva/public", () => ({
  BoardStage: (props: {
    readonly onObjectSettingsRequest?:
      ((objectId: BoardObjectId) => void) | undefined;
    readonly scene: {
      readonly items: readonly {
        readonly object: { readonly id: BoardObjectId };
      }[];
    };
  }) => (
    <div aria-label="Бесконечное полотно TutorBoard" role="application">
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
    </div>
  ),
  createDefaultKonvaRendererRegistry: () => ({}),
}));

afterEach(cleanup);

function coordinatePlot(document: BoardDocument) {
  const object = Object.values(document.objects).find(
    (
      candidate,
    ): candidate is Extract<
      BoardObject,
      { readonly kind: "math.coordinate-plot" }
    > => candidate !== undefined && candidate.kind === "math.coordinate-plot",
  );
  if (object === undefined) throw new Error("Coordinate plot was not created.");
  return object;
}

describe("coordinate plot editor application workflow", () => {
  it("creates, explicitly opens, previews, saves and undoes one semantic plot edit", async () => {
    const onCommandCommitted = vi.fn();
    const onDocumentChange = vi.fn();
    render(
      <App
        onCommandCommitted={onCommandCommitted}
        onDocumentChange={onDocumentChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Создать координатную плоскость (G)",
      }),
    );

    expect(
      screen.queryByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(onCommandCommitted.mock.calls[0]?.[0]).toMatchObject({
      kind: "core.objects.add",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть настройки объекта" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Формула явной функции"), {
      target: { value: "x^3-2*x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onCommandCommitted).toHaveBeenCalledTimes(2));
    expect(onCommandCommitted.mock.calls[1]?.[0]).toMatchObject({
      kind: "core.coordinate-plot.update",
      replacement: {
        series: [
          expect.objectContaining({
            expression: "x^3-2*x",
            kind: "explicit",
          }),
        ],
      },
    });
    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");

    const savedDocument = onDocumentChange.mock.calls.at(
      -1,
    )?.[0] as BoardDocument;
    expect(coordinatePlot(savedDocument).definition.series[0]).toMatchObject({
      expression: "x^3-2*x",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Закрыть редактор графика" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Отменить/ }));

    await waitFor(() => {
      const reverted = onDocumentChange.mock.calls.at(-1)?.[0] as BoardDocument;
      expect(coordinatePlot(reverted).definition.series[0]).toMatchObject({
        expression: "2*x+a",
      });
    });
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/1");
  });

  it("keeps the selected coordinate plot editor closed on Enter", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "g" });
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
});
