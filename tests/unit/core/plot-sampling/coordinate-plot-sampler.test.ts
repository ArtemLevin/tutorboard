import { describe, expect, it } from "vitest";

import {
  plotParameterId,
  plotSeriesId,
  type CoordinatePlotDefinition,
  type PlotSeriesStyle,
} from "../../../../src/core/public";
import {
  createPlotSamplingCache,
  sampleCoordinatePlotDefinition,
} from "../../../../src/core/plot-sampling/public";

const style: PlotSeriesStyle = {
  lineStyle: "solid",
  opacity: 1,
  stroke: "#111827",
  strokeWidth: 2,
};

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
      equalScale: false,
      xMax: 5,
      xMin: -5,
      yMax: 5,
      yMin: -5,
    },
    expressionLanguage: "tutorboard-expression/1",
    grid: {
      automaticStep: true,
      majorVisible: true,
      minorVisible: true,
      visible: true,
      xStep: null,
      yStep: null,
    },
    legend: { position: "top-right", visible: true },
    parameters: [
      {
        id: plotParameterId("parameter-a"),
        max: null,
        min: null,
        name: "a",
        step: null,
        value: 2,
      },
    ],
    series: [
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "a*x^2",
        id: plotSeriesId("series-parabola"),
        kind: "explicit",
        name: "Parabola",
        style,
        visible: true,
      },
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "bad(",
        id: plotSeriesId("series-invalid"),
        kind: "explicit",
        name: "Invalid",
        style,
        visible: true,
      },
      {
        closed: true,
        id: plotSeriesId("series-circle"),
        kind: "parametric",
        name: "Circle",
        parameterName: "t",
        range: { maxExpression: "2*pi", minExpression: "0" },
        style,
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      },
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "x",
        id: plotSeriesId("series-hidden"),
        kind: "explicit",
        name: "Hidden",
        style,
        visible: false,
      },
    ],
    size: { height: 420, width: 640 },
  };
}

const baseInput = {
  boardZoom: 1,
  pixelSize: { height: 420, width: 640 },
};

describe("coordinate plot sampling orchestration", () => {
  it("isolates invalid series while sampling valid siblings", () => {
    const result = sampleCoordinatePlotDefinition({
      ...baseInput,
      definition: definition(),
    });

    expect(result.series.map(({ status }) => status)).toEqual([
      "sampled",
      "invalid",
      "sampled",
      "hidden",
    ]);
    expect(result.series[0]!.sample!.metrics.pointCount).toBeGreaterThan(0);
    expect(result.series[1]!.diagnostics[0]?.field).toBe("expression");
    expect(result.series[2]!.sample!.segments).toHaveLength(1);
    expect(result.totalPointCount).toBeGreaterThan(0);
  });

  it("reuses deterministic numerical samples through the bounded cache", () => {
    const cache = createPlotSamplingCache();
    const input = { ...baseInput, cache, definition: definition() };

    const first = sampleCoordinatePlotDefinition(input);
    const second = sampleCoordinatePlotDefinition(input);

    expect(first.cacheHits).toBe(0);
    expect(second.cacheHits).toBe(2);
    expect(cache.size).toBe(2);
    expect(second.series[0]!.sample).toBe(first.series[0]!.sample);
    expect(second.series[2]!.sample).toBe(first.series[2]!.sample);
  });

  it("keeps cache hits for series that do not use the changed parameter", () => {
    const cache = createPlotSamplingCache();
    const firstDefinition = definition();
    const first = sampleCoordinatePlotDefinition({
      ...baseInput,
      cache,
      definition: firstDefinition,
    });
    const second = sampleCoordinatePlotDefinition({
      ...baseInput,
      cache,
      definition: {
        ...firstDefinition,
        parameters: firstDefinition.parameters.map((parameter) => ({
          ...parameter,
          value: parameter.value + 1,
        })),
      },
    });

    expect(first.cacheHits).toBe(0);
    expect(second.series[0]!.cacheHit).toBe(false);
    expect(second.series[2]!.cacheHit).toBe(true);
  });

  it("enforces an evaluation budget before sampling later siblings", () => {
    const result = sampleCoordinatePlotDefinition({
      ...baseInput,
      definition: definition(),
      options: { maximumTotalEvaluations: 10 },
    });
    const evaluations = result.series.reduce(
      (total, item) => total + (item.sample?.metrics.evaluationCount ?? 0),
      0,
    );

    expect(evaluations).toBeLessThanOrEqual(10);
    expect(result.truncated).toBe(true);
    expect(
      result.series.some(({ diagnostics }) =>
        diagnostics.some(
          ({ code }) => code === "sampling.total-evaluation-limit",
        ),
      ),
    ).toBe(true);
  });

  it("enforces the per-plane point budget across sibling series", () => {
    const result = sampleCoordinatePlotDefinition({
      ...baseInput,
      definition: definition(),
      options: { maximumTotalPoints: 20 },
    });

    expect(result.totalPointCount).toBeLessThanOrEqual(20);
    expect(result.truncated).toBe(true);
    expect(result.series.some(({ status }) => status === "truncated")).toBe(
      true,
    );
    expect(
      result.series.some(({ diagnostics }) =>
        diagnostics.some(({ code }) => code === "sampling.total-point-limit"),
      ),
    ).toBe(true);
  });

  it("defaults an invalid caller point budget to the contract maximum", () => {
    const result = sampleCoordinatePlotDefinition({
      ...baseInput,
      definition: definition(),
      options: { maximumTotalPoints: Number.NaN },
    });

    expect(Number.isFinite(result.totalPointCount)).toBe(true);
    expect(result.totalPointCount).toBeGreaterThan(0);
  });

  it("returns an empty valid sample for a domain outside the viewport", () => {
    const source = definition();
    const explicit = source.series[0]!;
    if (explicit.kind !== "explicit")
      throw new Error("Expected explicit series");
    const result = sampleCoordinatePlotDefinition({
      ...baseInput,
      definition: {
        ...source,
        series: [
          {
            ...explicit,
            domain: { maxExpression: "20", minExpression: "10" },
          },
        ],
      },
    });

    expect(result.series[0]!.status).toBe("empty");
    expect(result.series[0]!.diagnostics).toEqual([]);
  });
});
