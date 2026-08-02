import { describe, expect, it } from "vitest";

import {
  CoordinatePlotRenderer,
  createDefaultKonvaRendererRegistry,
} from "../../../../src/adapters/canvas-konva/public";
import {
  boardObjectId,
  plotSeriesId,
  type BoardRenderItem,
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
          lineStyle: "dashed",
          opacity: 1,
          stroke: "#059669",
          strokeWidth: 2,
        },
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      },
    ],
    size: { height: 420, width: 640 },
  },
  groupId: null,
  id: boardObjectId("plot-renderer"),
  kind: "math.coordinate-plot",
  locked: false,
  position: { x: 40, y: 60 },
  rotation: 15,
  scale: { x: 1.25, y: 1.25 },
  source: { kind: "user" },
  style: {
    fill: "#ffffff",
    opacity: 1,
    stroke: "#64748b",
    strokeWidth: 1,
  },
  visible: true,
};

describe("coordinate plot production renderer", () => {
  it("wires distinct settings, draft navigation and direct commit callbacks", () => {
    const item: BoardRenderItem = { object: plot, transforms: [] };
    const registry = createDefaultKonvaRendererRegistry();
    const onSettingsRequest = () => undefined;
    const onViewportChange = () => undefined;
    const onViewportCommit = () => true;
    const element = registry.render(item, {
      coordinatePlot: {
        activeObjectId: null,
        onSettingsRequest,
        onViewportChange,
        onViewportCommit,
        selectedSeriesId: null,
      },
      zoom: 2,
    });

    expect(element.type).toBe(CoordinatePlotRenderer);
    expect(element.props.onSettingsRequest).toBeTypeOf("function");
    expect(element.props.onViewportCommit).toBeTypeOf("function");
    expect(element.props.onViewportChange).toBeUndefined();
  });

  it("registers the object kind and forwards board zoom", () => {
    const item: BoardRenderItem = { object: plot, transforms: [] };
    const registry = createDefaultKonvaRendererRegistry();

    expect(() => registry.render(item, { zoom: 4 })).not.toThrow();
    const element = registry.render(item, { zoom: 4 });
    expect(element.type).toBe(CoordinatePlotRenderer);
    expect(element.props).toMatchObject({ object: plot, zoom: 4 });
  });
});
