import { describe, expect, it } from "vitest";

import {
  coordinatePlotExpressionLanguage,
  validateCoordinatePlotDefinition,
  type CoordinatePlotDefinition,
} from "./coordinate-plot";
import { plotParameterId, plotSeriesId } from "./identifiers";

function definition(): CoordinatePlotDefinition {
  return {
    axes: {
      showArrows: true,
      showLabels: true,
      showXAxis: true,
      showYAxis: true,
      xLabel: "x",
      yLabel: "y",
    },
    coordinateViewport: {
      equalScale: true,
      xMax: 10,
      xMin: -10,
      yMax: 8,
      yMin: -8,
    },
    expressionLanguage: coordinatePlotExpressionLanguage,
    grid: {
      automaticStep: true,
      majorVisible: true,
      minorVisible: false,
      visible: true,
      xStep: null,
      yStep: null,
    },
    legend: { position: "top-right", visible: true },
    parameters: [
      {
        id: plotParameterId("parameter-a"),
        max: 10,
        min: -10,
        name: "a",
        step: 0.1,
        value: 2,
      },
    ],
    series: [
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "a*x^2",
        id: plotSeriesId("series-parabola"),
        kind: "explicit",
        name: "Парабола",
        style: {
          lineStyle: "solid",
          opacity: 1,
          stroke: "#2563eb",
          strokeWidth: 3,
        },
        visible: true,
      },
      {
        closed: true,
        id: plotSeriesId("series-circle"),
        kind: "parametric",
        name: "Окружность",
        parameterName: "t",
        range: { maxExpression: "2*pi", minExpression: "0" },
        style: {
          lineStyle: "dashed",
          opacity: 0.9,
          stroke: "#059669",
          strokeWidth: 2,
        },
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      },
    ],
    size: { height: 420, width: 640 },
  };
}

describe("coordinate plot domain", () => {
  it("accepts explicit and parametric series on one plane", () => {
    expect(validateCoordinatePlotDefinition(definition())).toEqual([]);
  });

  it("rejects duplicate series IDs and invalid ranges", () => {
    const source = definition();
    const invalid: CoordinatePlotDefinition = {
      ...source,
      coordinateViewport: { ...source.coordinateViewport, xMin: 10 },
      series: [
        source.series[0]!,
        { ...source.series[1]!, id: source.series[0]!.id },
      ],
    };
    expect(
      validateCoordinatePlotDefinition(invalid).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "plot.invalid-viewport",
        "plot.duplicate-series-id",
      ]),
    );
  });

  it("rejects duplicate parameter names and invalid manual grid steps", () => {
    const source = definition();
    const invalid: CoordinatePlotDefinition = {
      ...source,
      grid: { ...source.grid, automaticStep: false, xStep: null },
      parameters: [
        source.parameters[0]!,
        { ...source.parameters[0]!, id: plotParameterId("parameter-b") },
      ],
    };
    expect(
      validateCoordinatePlotDefinition(invalid).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "plot.duplicate-parameter-name",
        "plot.invalid-grid-step",
      ]),
    );
  });
});
