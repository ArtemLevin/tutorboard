import {
  boardObjectId,
  createEmptyBoardDocument,
  documentId,
  plotParameterId,
  plotSeriesId,
  type BoardDocument,
  type CoordinatePlotDefinition,
  type CoordinatePlotObject,
  type ExplicitPlotSeries,
  type ParametricPlotSeries,
  type PlotSeries,
  type PlotSeriesStyle,
} from "../../src/core/public";
import { createDefaultCoordinatePlotObject } from "../../src/modules/coordinate-plot-editor/public";

const palette = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#4f46e5",
] as const;

function seriesStyle(index: number): PlotSeriesStyle {
  return {
    lineStyle:
      index % 3 === 0 ? "solid" : index % 3 === 1 ? "dashed" : "dash-dot",
    opacity: index % 5 === 0 ? 0.82 : 1,
    stroke: palette[index % palette.length]!,
    strokeWidth: 2 + (index % 3) * 0.5,
  };
}

function explicitSeries(
  seed: number,
  index: number,
  expression: string,
  domain: {
    readonly maxExpression: string | null;
    readonly minExpression: string | null;
  } = {
    maxExpression: null,
    minExpression: null,
  },
): ExplicitPlotSeries {
  return {
    domain,
    expression,
    id: plotSeriesId(`release-series:${seed}:explicit:${index}`),
    kind: "explicit",
    name: `Явная ${index + 1}`,
    style: seriesStyle(index),
    visible: index !== 10,
  };
}

function parametricSeries(
  seed: number,
  index: number,
  input: {
    readonly closed: boolean;
    readonly maxExpression: string;
    readonly minExpression: string;
    readonly name: string;
    readonly xExpression: string;
    readonly yExpression: string;
  },
): ParametricPlotSeries {
  return {
    closed: input.closed,
    id: plotSeriesId(`release-series:${seed}:parametric:${index}`),
    kind: "parametric",
    name: input.name,
    parameterName: "t",
    range: {
      maxExpression: input.maxExpression,
      minExpression: input.minExpression,
    },
    style: seriesStyle(index + 12),
    visible: true,
    xExpression: input.xExpression,
    yExpression: input.yExpression,
  };
}

export function createCoordinatePlotProductionDefinition(
  seed = 0,
): CoordinatePlotDefinition {
  const series: readonly PlotSeries[] = [
    explicitSeries(seed, 0, "x^2/8-2"),
    explicitSeries(seed, 1, "2*sin(x)"),
    explicitSeries(seed, 2, "cos(2*x)+sin(x/2)"),
    explicitSeries(seed, 3, "1/x"),
    explicitSeries(seed, 4, "sqrt(16-x^2)", {
      maxExpression: "4",
      minExpression: "-4",
    }),
    explicitSeries(seed, 5, "a*sin(b*x)"),
    explicitSeries(seed, 6, "abs(x)-3"),
    explicitSeries(seed, 7, "ln(abs(x)+0.2)"),
    explicitSeries(seed, 8, "exp(-x^2/8)*4"),
    explicitSeries(seed, 9, "max(-4,min(4,x^3/24))"),
    explicitSeries(seed, 10, "tan(x)"),
    explicitSeries(seed, 11, "floor(x)/2"),
    parametricSeries(seed, 0, {
      closed: true,
      maxExpression: "2*pi",
      minExpression: "0",
      name: "Окружность",
      xExpression: "3*cos(t)",
      yExpression: "3*sin(t)",
    }),
    parametricSeries(seed, 1, {
      closed: true,
      maxExpression: "2*pi",
      minExpression: "0",
      name: "Эллипс",
      xExpression: "5*cos(t)",
      yExpression: "2*sin(t)",
    }),
    parametricSeries(seed, 2, {
      closed: true,
      maxExpression: "2*pi",
      minExpression: "0",
      name: "Лиссажу",
      xExpression: "4*sin(3*t)",
      yExpression: "3*sin(4*t)",
    }),
    parametricSeries(seed, 3, {
      closed: false,
      maxExpression: "6*pi",
      minExpression: "0",
      name: "Затухающая спираль",
      xExpression: "0.18*t*cos(t)",
      yExpression: "0.18*t*sin(t)",
    }),
  ];

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
      xMax: 12,
      xMin: -12,
      yMax: 8,
      yMin: -8,
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
    legend: {
      position: seed % 2 === 0 ? "top-right" : "bottom-left",
      visible: true,
    },
    parameters: [
      {
        id: plotParameterId(`release-parameter:${seed}:a`),
        max: 5,
        min: -5,
        name: "a",
        step: 0.1,
        value: 2 + (seed % 3) * 0.25,
      },
      {
        id: plotParameterId(`release-parameter:${seed}:b`),
        max: 6,
        min: 0.25,
        name: "b",
        step: 0.25,
        value: 1.5,
      },
    ],
    series,
    size: { height: 420, width: 640 },
  };
}

export function createCoordinatePlotProductionObject(
  seed = 0,
): CoordinatePlotObject {
  const base = createDefaultCoordinatePlotObject({
    center: {
      x: 360 + (seed % 4) * 700,
      y: 250 + Math.floor(seed / 4) * 480,
    },
    ids: {
      objectId: boardObjectId(`release-plot:${seed}`),
      parameterId: () => plotParameterId(`release-unused-parameter:${seed}`),
      seriesId: () => plotSeriesId(`release-unused-series:${seed}`),
    },
  });
  return {
    ...base,
    definition: createCoordinatePlotProductionDefinition(seed),
    id: boardObjectId(`release-plot:${seed}`),
    position: {
      x: 40 + (seed % 4) * 700,
      y: 40 + Math.floor(seed / 4) * 480,
    },
  };
}

export function createCoordinatePlotProductionDocument(
  plotCount = 16,
): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-08-01T08:00:00.000Z",
    id: documentId("document:coordinate-plot-production"),
    title: "Coordinate plot production workload",
  });
  const plots = Array.from({ length: plotCount }, (_value, index) =>
    createCoordinatePlotProductionObject(index),
  );
  return {
    ...base,
    objects: Object.fromEntries(plots.map((plot) => [plot.id, plot])),
    order: plots.map(({ id }) => id),
    updatedAt: "2026-08-01T08:00:00.000Z",
  };
}
