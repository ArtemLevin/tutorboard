import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
  type CoordinatePlotDefinition,
} from "../core/public";
import {
  addCoordinatePlotParameter,
  createDefaultCoordinatePlotObject,
  validateCoordinatePlotEditorDefinition,
} from "../modules/coordinate-plot-editor/public";
import { CoordinatePlotEditorPanel } from "./CoordinatePlotEditorPanel";

afterEach(cleanup);

function createDefinition() {
  return createDefaultCoordinatePlotObject({
    center: { x: 320, y: 210 },
    ids: {
      objectId: boardObjectId("panel-plot"),
      parameterId: () => plotParameterId("panel-parameter"),
      seriesId: () => plotSeriesId("panel-series"),
    },
  }).definition;
}

function PanelHarness({ initialDefinition = createDefinition() }) {
  const [definition, setDefinition] = useState(initialDefinition);
  let parameterSequence = definition.parameters.length;
  return (
    <CoordinatePlotEditorPanel
      definition={definition}
      dirty
      issues={validateCoordinatePlotEditorDefinition(definition)}
      onAddParameter={(name) => {
        setDefinition((current) =>
          addCoordinatePlotParameter(
            current,
            plotParameterId(`harness-parameter-${parameterSequence++}`),
            name,
          ),
        );
      }}
      onAddSeries={vi.fn()}
      onClose={vi.fn()}
      onDefinitionChange={setDefinition}
      onSave={vi.fn(() => true)}
      onSelectedSeriesChange={vi.fn()}
      readOnly={false}
      selectedSeriesId={plotSeriesId("panel-series")}
    />
  );
}

describe("CoordinatePlotEditorPanel", () => {
  it("edits the selected formula and surfaces local diagnostics", () => {
    const onDefinitionChange =
      vi.fn<(definition: CoordinatePlotDefinition) => void>();
    render(
      <CoordinatePlotEditorPanel
        definition={createDefinition()}
        dirty
        issues={[
          {
            blocking: false,
            code: "expression.unknown-identifier",
            end: 1,
            field: "series.0.expression",
            message: "Unknown identifier q.",
            start: 0,
          },
        ]}
        onAddParameter={vi.fn()}
        onAddSeries={vi.fn()}
        onClose={vi.fn()}
        onDefinitionChange={onDefinitionChange}
        onSave={vi.fn(() => true)}
        onSelectedSeriesChange={vi.fn()}
        readOnly={false}
        selectedSeriesId={plotSeriesId("panel-series")}
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Редактор координатной плоскости",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unknown identifier q.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Формула явной функции"), {
      target: { value: "sin(x)" },
    });

    expect(onDefinitionChange).toHaveBeenCalledTimes(1);
    const changedDefinition = onDefinitionChange.mock.calls[0]?.[0];
    expect(changedDefinition?.series[0]).toMatchObject({
      expression: "sin(x)",
      kind: "explicit",
    });
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it("routes series and parameter creation through explicit callbacks", () => {
    const onAddParameter = vi.fn();
    const onAddSeries = vi.fn();
    render(
      <CoordinatePlotEditorPanel
        definition={createDefinition()}
        dirty={false}
        issues={[]}
        onAddParameter={onAddParameter}
        onAddSeries={onAddSeries}
        onClose={vi.fn()}
        onDefinitionChange={vi.fn()}
        onSave={vi.fn(() => false)}
        onSelectedSeriesChange={vi.fn()}
        readOnly={false}
        selectedSeriesId={plotSeriesId("panel-series")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Явная функция" }));
    fireEvent.click(
      screen.getByRole("button", { name: "+ Параметрическая кривая" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Параметры (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить параметр" }));

    expect(onAddSeries.mock.calls).toEqual([["explicit"], ["parametric"]]);
    expect(onAddParameter).toHaveBeenCalledWith();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("supports WAI-ARIA tabs and localized enum values", () => {
    render(<PanelHarness />);

    const functions = screen.getByRole("tab", { name: "Функции" });
    const parameters = screen.getByRole("tab", { name: "Параметры (0)" });
    const view = screen.getByRole("tab", { name: "Вид" });
    expect(functions).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(functions, { key: "ArrowRight" });
    expect(parameters).toHaveAttribute("aria-selected", "true");
    expect(parameters).toHaveFocus();

    fireEvent.keyDown(parameters, { key: "End" });
    expect(view).toHaveAttribute("aria-selected", "true");
    expect(view).toHaveFocus();

    fireEvent.click(functions);
    const lineStyle = screen.getByLabelText("Стиль линии");
    expect(lineStyle).toHaveTextContent("Сплошная");
    expect(lineStyle).toHaveTextContent("Штриховая");
    expect(lineStyle).toHaveTextContent("Штрихпунктирная");

    fireEvent.click(view);
    const legend = screen.getByLabelText("Положение легенды");
    expect(legend).toHaveTextContent("Сверху справа");
    expect(screen.getByText("X: от")).toBeInTheDocument();
    expect(screen.getByText("Y: до")).toBeInTheDocument();
  });

  it("inserts functions around the selected expression and explains radians", async () => {
    render(<PanelHarness />);

    const formula = screen.getByLabelText("Формула явной функции");
    fireEvent.change(formula, { target: { value: "x+1" } });
    formula.focus();
    formula.setSelectionRange(0, 1);
    fireEvent.click(screen.getByRole("button", { name: "Вставить sin" }));

    await waitFor(() => expect(formula).toHaveValue("sin(x)+1"));
    expect(formula).toHaveFocus();
    expect(
      screen.getByText(/Тригонометрические функции используют радианы/),
    ).toBeInTheDocument();

    formula.setSelectionRange(formula.value.length, formula.value.length);
    fireEvent.click(screen.getByRole("button", { name: "Вставить pi" }));
    await waitFor(() => expect(formula).toHaveValue("sin(x)+1pi"));
  });

  it("creates an unknown parameter, opens its tab and focuses its name", async () => {
    const initial = createDefinition();
    const series = initial.series[0];
    if (series?.kind !== "explicit") throw new Error("Expected explicit series");
    render(
      <PanelHarness
        initialDefinition={{
          ...initial,
          series: [{ ...series, expression: "q*x" }],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Создать параметр «q»" }),
    );

    const parameters = screen.getByRole("tab", { name: "Параметры (1)" });
    expect(parameters).toHaveAttribute("aria-selected", "true");
    const name = await screen.findByLabelText("Имя параметра harness-parameter-0");
    expect(name).toHaveValue("q");
    await waitFor(() => expect(name).toHaveFocus());
  });
});
