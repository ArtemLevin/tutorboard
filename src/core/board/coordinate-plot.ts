import type { PlotParameterId, PlotSeriesId } from "./identifiers";
import type { Size2 } from "./primitives";

export const coordinatePlotExpressionLanguage =
  "tutorboard-expression/1" as const;
export const plotSeriesKinds = ["explicit", "parametric"] as const;
export const plotLineStyles = ["solid", "dashed", "dash-dot"] as const;
export const plotLegendPositions = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export const maximumCoordinatePlotSeries = 32;
export const maximumCoordinatePlotParameters = 32;
export const maximumPlotExpressionLength = 2_000;
export const maximumCoordinatePlotExpressionBudget = 64 * 1024;

export type PlotSeriesKind = (typeof plotSeriesKinds)[number];
export type PlotLineStyle = (typeof plotLineStyles)[number];
export type PlotLegendPosition = (typeof plotLegendPositions)[number];

export interface CoordinatePlotViewport {
  readonly equalScale: boolean;
  readonly xMax: number;
  readonly xMin: number;
  readonly yMax: number;
  readonly yMin: number;
}

export interface CoordinatePlotAxes {
  readonly showArrows: boolean;
  readonly showLabels: boolean;
  readonly showXAxis: boolean;
  readonly showYAxis: boolean;
  readonly xLabel: string;
  readonly yLabel: string;
}

export interface CoordinatePlotGrid {
  readonly automaticStep: boolean;
  readonly majorVisible: boolean;
  readonly minorVisible: boolean;
  readonly visible: boolean;
  readonly xStep: number | null;
  readonly yStep: number | null;
}

export interface CoordinatePlotLegend {
  readonly position: PlotLegendPosition;
  readonly visible: boolean;
}

export interface PlotSeriesStyle {
  readonly lineStyle: PlotLineStyle;
  readonly opacity: number;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface PlotParameter {
  readonly id: PlotParameterId;
  readonly max: number | null;
  readonly min: number | null;
  readonly name: string;
  readonly step: number | null;
  readonly value: number;
}

export interface ExplicitPlotSeries {
  readonly domain: {
    readonly maxExpression: string | null;
    readonly minExpression: string | null;
  };
  readonly expression: string;
  readonly id: PlotSeriesId;
  readonly kind: "explicit";
  readonly name: string;
  readonly style: PlotSeriesStyle;
  readonly visible: boolean;
}

export interface ParametricPlotSeries {
  readonly closed: boolean;
  readonly id: PlotSeriesId;
  readonly kind: "parametric";
  readonly name: string;
  readonly parameterName: "t";
  readonly range: {
    readonly maxExpression: string;
    readonly minExpression: string;
  };
  readonly style: PlotSeriesStyle;
  readonly visible: boolean;
  readonly xExpression: string;
  readonly yExpression: string;
}

export type PlotSeries = ExplicitPlotSeries | ParametricPlotSeries;

export interface CoordinatePlotDefinition {
  readonly axes: CoordinatePlotAxes;
  readonly coordinateViewport: CoordinatePlotViewport;
  readonly expressionLanguage: typeof coordinatePlotExpressionLanguage;
  readonly grid: CoordinatePlotGrid;
  readonly legend: CoordinatePlotLegend;
  readonly parameters: readonly PlotParameter[];
  readonly series: readonly PlotSeries[];
  readonly size: Size2;
}

export interface CoordinatePlotDefinitionIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

const parameterNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,31}$/u;

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

function expressions(series: PlotSeries): readonly string[] {
  return series.kind === "explicit"
    ? [
        series.expression,
        ...(series.domain.minExpression === null
          ? []
          : [series.domain.minExpression]),
        ...(series.domain.maxExpression === null
          ? []
          : [series.domain.maxExpression]),
      ]
    : [
        series.xExpression,
        series.yExpression,
        series.range.minExpression,
        series.range.maxExpression,
      ];
}

export function validateCoordinatePlotDefinition(
  definition: CoordinatePlotDefinition,
): readonly CoordinatePlotDefinitionIssue[] {
  const issues: CoordinatePlotDefinitionIssue[] = [];
  const add = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });

  const viewport = definition.coordinateViewport;
  if (!(viewport.xMin < viewport.xMax) || !(viewport.yMin < viewport.yMax)) {
    add(
      "plot.invalid-viewport",
      "coordinateViewport",
      "Coordinate plot minimum bounds must be smaller than maximum bounds.",
    );
  }
  if (definition.series.length > maximumCoordinatePlotSeries) {
    add(
      "plot.too-many-series",
      "series",
      `Coordinate plot supports at most ${maximumCoordinatePlotSeries} series.`,
    );
  }
  if (definition.parameters.length > maximumCoordinatePlotParameters) {
    add(
      "plot.too-many-parameters",
      "parameters",
      `Coordinate plot supports at most ${maximumCoordinatePlotParameters} parameters.`,
    );
  }
  for (const id of duplicateValues(definition.series.map(({ id }) => id))) {
    add(
      "plot.duplicate-series-id",
      "series",
      `Coordinate plot contains duplicate series ID ${id}.`,
    );
  }
  for (const id of duplicateValues(definition.parameters.map(({ id }) => id))) {
    add(
      "plot.duplicate-parameter-id",
      "parameters",
      `Coordinate plot contains duplicate parameter ID ${id}.`,
    );
  }
  for (const name of duplicateValues(
    definition.parameters.map(({ name }) => name),
  )) {
    add(
      "plot.duplicate-parameter-name",
      "parameters",
      `Coordinate plot contains duplicate parameter name ${name}.`,
    );
  }
  definition.parameters.forEach((parameter, index) => {
    if (!parameterNamePattern.test(parameter.name)) {
      add(
        "plot.invalid-parameter-name",
        `parameters.${index}.name`,
        "Parameter name must begin with a Latin letter and contain only letters, digits or underscores.",
      );
    }
    if (
      parameter.min !== null &&
      parameter.max !== null &&
      parameter.min >= parameter.max
    ) {
      add(
        "plot.invalid-parameter-range",
        `parameters.${index}`,
        "Parameter minimum must be smaller than its maximum.",
      );
    }
    if (parameter.step !== null && parameter.step <= 0) {
      add(
        "plot.invalid-parameter-step",
        `parameters.${index}.step`,
        "Parameter step must be positive.",
      );
    }
  });
  if (
    !definition.grid.automaticStep &&
    (definition.grid.xStep === null ||
      definition.grid.yStep === null ||
      definition.grid.xStep <= 0 ||
      definition.grid.yStep <= 0)
  ) {
    add(
      "plot.invalid-grid-step",
      "grid",
      "Manual grid mode requires positive horizontal and vertical steps.",
    );
  }
  const expressionBudget = definition.series
    .flatMap(expressions)
    .reduce((total, expression) => total + expression.length, 0);
  if (expressionBudget > maximumCoordinatePlotExpressionBudget) {
    add(
      "plot.expression-budget-exceeded",
      "series",
      "Coordinate plot expressions exceed the per-object storage budget.",
    );
  }
  return issues;
}
