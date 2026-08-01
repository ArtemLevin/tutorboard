import { describe, expect, it } from "vitest";

import { createCoordinatePlotRenderModel } from "../../../../src/adapters/canvas-konva/coordinate-plot-render-model";
import {
  choosePlotGridStep,
  createPlotGridRenderModel,
  createPlotLegendLayout,
  formatPlotTick,
  plotLineDash,
  resolveCoordinatePlotViewport,
} from "../../../../src/adapters/canvas-konva/coordinate-plot-rendering";
import {
  boardObjectId,
  plotSeriesId,
  type CoordinatePlotObject,
} from "../../../../src/core/public";

const plot: CoordinatePlotObject = {
  definition: {
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
      yMax: 10,
      yMin: -10,
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
    parameters: [],
    series: [
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "x^2",
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
          lineStyle: "dash-dot",
          opacity: 0.9,
          stroke: "#059669",
          strokeWidth: 2,
        },
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      },
    ],
    size: { height: 320, width: 640 },
  },
  groupId: null,
  id: boardObjectId("plot-render-model"),
  kind: "math.coordinate-plot",
  locked: false,
  position: { x: 10, y: 20 },
  rotation: 0,
  scale: { x: 1.5, y: 1.5 },
  source: { kind: "user" },
  style: {
    fill: "#ffffff",
    opacity: 1,
    stroke: "#64748b",
    strokeWidth: 1,
  },
  visible: true,
};

describe("coordinate plot rendering geometry", () => {
  it("chooses stable 1-2-5 grid steps", () => {
    expect(choosePlotGridStep(-10, 10, 640)).toBe(2);
    expect(choosePlotGridStep(-1, 1, 640)).toBeCloseTo(0.2, 12);
    expect(choosePlotGridStep(-1_000, 1_000, 640)).toBe(200);
  });

  it("expands one viewport axis to preserve equal unit scale", () => {
    const resolved = resolveCoordinatePlotViewport(
      plot.definition.coordinateViewport,
      plot.definition.size,
    );

    expect(resolved.xMin).toBe(-20);
    expect(resolved.xMax).toBe(20);
    expect(resolved.yMin).toBe(-10);
    expect(resolved.yMax).toBe(10);
  });

  it("builds major and minor grid positions with readable labels", () => {
    const viewport = resolveCoordinatePlotViewport(
      plot.definition.coordinateViewport,
      plot.definition.size,
    );
    const grid = createPlotGridRenderModel(
      plot.definition.grid,
      viewport,
      plot.definition.size,
    );

    expect(grid.xStep).toBe(5);
    expect(grid.yStep).toBe(5);
    expect(grid.majorX.some(({ label }) => label === "0")).toBe(true);
    expect(grid.minorX.length).toBeGreaterThan(grid.majorX.length);
    expect(
      grid.minorY.every((position) => position >= 0 && position <= 320),
    ).toBe(true);
    expect(formatPlotTick(-0, 0.1)).toBe("0");
    expect(formatPlotTick(12_500_000, 1_000_000)).toContain("e");
  });

  it("creates sampled explicit and parametric render geometry", () => {
    const model = createCoordinatePlotRenderModel({ object: plot, zoom: 2 });

    expect(model.definition.coordinateViewport.xMin).toBe(-20);
    expect(model.xAxisY).toBe(160);
    expect(model.yAxisX).toBe(320);
    expect(model.sampling.series).toHaveLength(2);
    expect(model.sampling.series.map(({ status }) => status)).toEqual([
      "sampled",
      "sampled",
    ]);
    expect(model.sampling.totalPointCount).toBeGreaterThan(20);
    for (const result of model.sampling.series) {
      for (const segment of result.sample?.segments ?? []) {
        for (const point of segment) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(640);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(320);
        }
      }
    }
  });

  it("maps line styles and legend positions", () => {
    expect(plotLineDash("solid", 2)).toEqual([]);
    expect(plotLineDash("dashed", 2)).toEqual([8, 6]);
    expect(plotLineDash("dash-dot", 2)).toEqual([12, 5, 3, 5]);

    const layout = createPlotLegendLayout(
      "bottom-right",
      ["Парабола", "Окружность"],
      plot.definition.size,
    );
    expect(layout.x + layout.width).toBeLessThanOrEqual(630);
    expect(layout.y + layout.height).toBeLessThanOrEqual(310);
    expect(layout.visibleRowCount).toBe(2);
    expect(layout.hiddenRowCount).toBe(0);

    const crowded = createPlotLegendLayout(
      "top-left",
      Array.from(
        { length: 20 },
        (_, index) => `Очень длинная функция ${index + 1}`,
      ),
      { height: 320, width: 640 },
    );
    expect(crowded.visibleRowCount).toBeLessThanOrEqual(7);
    expect(crowded.hiddenRowCount).toBeGreaterThan(0);
    expect(crowded.width).toBeLessThanOrEqual(260);
    expect(crowded.height).toBeLessThanOrEqual(320 * 0.48);
  });
});
