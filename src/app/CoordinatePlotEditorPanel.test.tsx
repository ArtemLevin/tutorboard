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

function inputByLabel(label: string): HTMLInputElement {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected an input labelled ${label}.`);
  }
  return element;
}

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
  it("shows a compact formula and primary parameter before advanced settings", () => {
    render(<PanelHarness />);

    expect(screen.getByLabelText("Формула явной функции")).toHaveValue("2*x+a");
    expect(screen.getByLabelText("Ползунок параметра a")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Расширенные настройки графика" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    const advanced = screen.getByRole("dialog", {
      name: "Расширенные настройки графика",
    });
    expect(advanced).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Расширенные настройки/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "К базовым настройкам" }),
    );
    expect(advanced).not.toBeInTheDocument();
    expect(screen.getByLabelText("Формула явной функции")).toHaveValue("2*x+a");
  });

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

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Явная функция" }));
    fireEvent.click(
      screen.getByRole("button", { name: "+ Параметрическая кривая" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Параметры (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить параметр" }));

    expect(onAddSeries.mock.calls).toEqual([["explicit"], ["parametric"]]);
    expect(onAddParameter).toHaveBeenCalledWith();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("supports WAI-ARIA tabs and localized enum values", async () => {
    render(<PanelHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );

    const functions = screen.getByRole("tab", { name: "Функции" });
    const parameters = screen.getByRole("tab", { name: "Параметры (1)" });
    const view = screen.getByRole("tab", { name: "Вид" });
    expect(functions).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(functions, { key: "ArrowRight" });
    expect(parameters).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(parameters).toHaveFocus());

    fireEvent.keyDown(parameters, { key: "End" });
    expect(view).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(view).toHaveFocus());

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

  it("preserves intermediate numeric text until the field is committed", () => {
    render(<PanelHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Вид" }));
    const minimumX = inputByLabel("Минимальная граница X");

    fireEvent.change(minimumX, { target: { value: "-" } });
    expect(minimumX).toHaveValue("-");
    fireEvent.change(minimumX, { target: { value: "-12.5" } });
    fireEvent.blur(minimumX);
    expect(minimumX).toHaveValue("-12.5");
  });

  it("inserts functions around the selected expression and explains radians", async () => {
    render(<PanelHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    const formula = inputByLabel("Формула явной функции");
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
    if (series?.kind !== "explicit")
      throw new Error("Expected explicit series");
    render(
      <PanelHarness
        initialDefinition={{
          ...initial,
          series: [{ ...series, expression: "q*x" }],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Формула явной функции")).toHaveFocus(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Создать параметр «q»" }),
    );

    const parameters = screen.getByRole("tab", { name: "Параметры (2)" });
    expect(parameters).toHaveAttribute("aria-selected", "true");
    const name = await screen.findByLabelText(
      "Имя параметра harness-parameter-1",
    );
    expect(name).toHaveValue("q");
    await waitFor(() => expect(name).toHaveFocus());
  });
});
