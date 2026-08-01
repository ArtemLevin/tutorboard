import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
} from "../../../../src/core/public";
import {
  addCoordinatePlotParameter,
  addCoordinatePlotSeries,
  createDefaultCoordinatePlotObject,
  fitCoordinatePlotDefinition,
  replaceCoordinatePlotSeriesKind,
  validateCoordinatePlotEditorDefinition,
} from "../../../../src/modules/coordinate-plot-editor/public";

function createPlot() {
  let seriesIndex = 0;
  return createDefaultCoordinatePlotObject({
    center: { x: 400, y: 300 },
    ids: {
      objectId: boardObjectId("plot-editor-test"),
      parameterId: () => plotParameterId("parameter-test"),
      seriesId: () => plotSeriesId(`series-${seriesIndex++}`),
    },
  });
}

describe("coordinate plot editor model", () => {
  it("creates a useful coordinate plane with one editable explicit series", () => {
    const plot = createPlot();

    expect(plot.kind).toBe("math.coordinate-plot");
    expect(plot.definition.series).toHaveLength(1);
    expect(plot.definition.series[0]).toMatchObject({
      expression: "x^2",
      kind: "explicit",
      visible: true,
    });
    expect(plot.position).toEqual({ x: 80, y: 90 });
  });

  it("adds series and parameters with stable local identities", () => {
    const plot = createPlot();
    const withSeries = addCoordinatePlotSeries(
      plot.definition,
      "parametric",
      plotSeriesId("circle"),
    );
    const withParameter = addCoordinatePlotParameter(
      withSeries,
      plotParameterId("parameter-a"),
    );

    expect(withParameter.series[1]).toMatchObject({
      id: "circle",
      kind: "parametric",
      xExpression: "3*cos(t)",
      yExpression: "3*sin(t)",
    });
    expect(withParameter.parameters[0]).toMatchObject({
      id: "parameter-a",
      name: "a",
      value: 1,
    });
  });

  it("creates a parameter with an explicitly requested identifier", () => {
    const plot = createPlot();
    const definition = addCoordinatePlotParameter(
      plot.definition,
      plotParameterId("parameter-k"),
      "k",
    );

    expect(definition.parameters[0]).toMatchObject({
      id: "parameter-k",
      name: "k",
      value: 1,
    });
  });

  it("falls back to a generated name for duplicate or invalid requests", () => {
    const plot = createPlot();
    const withA = addCoordinatePlotParameter(
      plot.definition,
      plotParameterId("parameter-a"),
      "a",
    );
    const duplicate = addCoordinatePlotParameter(
      withA,
      plotParameterId("parameter-duplicate"),
      "a",
    );
    const invalid = addCoordinatePlotParameter(
      duplicate,
      plotParameterId("parameter-invalid"),
      "1bad",
    );

    expect(duplicate.parameters[1]?.name).toBe("b");
    expect(invalid.parameters[2]?.name).toBe("c");
  });

  it("switches a series kind while preserving identity and style", () => {
    const plot = createPlot();
    const original = plot.definition.series[0]!;
    const converted = replaceCoordinatePlotSeriesKind(
      plot.definition,
      original.id,
      "parametric",
    );

    expect(converted.series[0]).toMatchObject({
      id: original.id,
      kind: "parametric",
      name: original.name,
      style: original.style,
    });
  });

  it("separates blocking domain issues from editable formula diagnostics", () => {
    const plot = createPlot();
    const explicit = plot.definition.series[0]!;
    if (explicit.kind !== "explicit")
      throw new Error("Expected explicit series.");
    const definition = {
      ...plot.definition,
      coordinateViewport: {
        ...plot.definition.coordinateViewport,
        xMax: -10,
      },
      series: [{ ...explicit, expression: "q*x" }],
    };
    const issues = validateCoordinatePlotEditorDefinition(definition);

    expect(issues.some(({ blocking }) => blocking)).toBe(true);
    expect(
      issues.some(
        ({ blocking, code }) =>
          !blocking && code === "expression.unknown-identifier",
      ),
    ).toBe(true);
  });

  it("fits sampled geometry with padding", () => {
    const plot = createPlot();
    const fitted = fitCoordinatePlotDefinition(plot.definition);

    expect(fitted.coordinateViewport.xMin).toBeLessThan(0);
    expect(fitted.coordinateViewport.xMax).toBeGreaterThan(0);
    expect(fitted.coordinateViewport.yMin).toBeLessThanOrEqual(0);
    expect(fitted.coordinateViewport.yMax).toBeGreaterThan(0);
  });
});
