import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
  type CoordinatePlotDefinition,
} from "../core/public";
import { createDefaultCoordinatePlotObject } from "../modules/coordinate-plot-editor/public";
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
        onSave={vi.fn()}
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
        onSave={vi.fn()}
        onSelectedSeriesChange={vi.fn()}
        readOnly={false}
        selectedSeriesId={plotSeriesId("panel-series")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ y=f(x)" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Параметрическая" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить параметр" }));

    expect(onAddSeries.mock.calls).toEqual([["explicit"], ["parametric"]]);
    expect(onAddParameter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });
});
