import {
  compilePlotExpression,
  coordinatePlotExpressionLanguage,
  evaluatePlotExpression,
  maximumCoordinatePlotParameters,
  maximumCoordinatePlotSeries,
  sampleCoordinatePlotDefinition,
  validateCoordinatePlotDefinition,
  validatePlotParameterName,
  type BoardObjectId,
  type CoordinatePlotDefinition,
  type CoordinatePlotObject,
  type CoordinatePlotViewport,
  type ExplicitPlotSeries,
  type ParametricPlotSeries,
  type PlotExpressionContext,
  type PlotParameter,
  type PlotParameterId,
  type PlotSeries,
  type PlotSeriesId,
  type Vec2,
} from "../../core/public";

const defaultSeriesColors = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#4f46e5",
] as const;

export const standardCoordinatePlotViewport: CoordinatePlotViewport = {
  equalScale: true,
  xMax: 10,
  xMin: -10,
  yMax: 7,
  yMin: -7,
};

export interface CoordinatePlotEditorIssue {
  readonly blocking: boolean;
  readonly code: string;
  readonly end: number | null;
  readonly field: string;
  readonly message: string;
  readonly start: number | null;
}

export interface CoordinatePlotIdFactory {
  readonly objectId: BoardObjectId;
  readonly parameterId: () => PlotParameterId;
  readonly seriesId: () => PlotSeriesId;
}

function seriesColor(index: number): string {
  return defaultSeriesColors[index % defaultSeriesColors.length]!;
}

export function createExplicitPlotSeries(
  id: PlotSeriesId,
  index: number,
): ExplicitPlotSeries {
  return {
    domain: { maxExpression: null, minExpression: null },
    expression: index === 0 ? "x^2" : "x",
    id,
    kind: "explicit",
    name: `График ${index + 1}`,
    style: {
      lineStyle: "solid",
      opacity: 1,
      stroke: seriesColor(index),
      strokeWidth: 3,
    },
    visible: true,
  };
}

export function createParametricPlotSeries(
  id: PlotSeriesId,
  index: number,
): ParametricPlotSeries {
  return {
    closed: true,
    id,
    kind: "parametric",
    name: `Кривая ${index + 1}`,
    parameterName: "t",
    range: { maxExpression: "2*pi", minExpression: "0" },
    style: {
      lineStyle: "solid",
      opacity: 1,
      stroke: seriesColor(index),
      strokeWidth: 3,
    },
    visible: true,
    xExpression: "3*cos(t)",
    yExpression: "3*sin(t)",
  };
}

export function createDefaultCoordinatePlotObject(input: {
  readonly center: Vec2;
  readonly ids: CoordinatePlotIdFactory;
}): CoordinatePlotObject {
  const size = { height: 420, width: 640 } as const;
  const defaultSeries = createExplicitPlotSeries(input.ids.seriesId(), 0);
  return {
    definition: {
      axes: {
        showArrows: true,
        showLabels: true,
        showXAxis: true,
        showYAxis: true,
        xLabel: "x",
        yLabel: "y",
      },
      coordinateViewport: standardCoordinatePlotViewport,
      expressionLanguage: coordinatePlotExpressionLanguage,
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
          id: input.ids.parameterId(),
          max: 10,
          min: -10,
          name: "a",
          step: 0.1,
          value: 1,
        },
      ],
      series: [{ ...defaultSeries, expression: "2*x+a" }],
      size,
    },
    groupId: null,
    id: input.ids.objectId,
    kind: "math.coordinate-plot",
    locked: false,
    position: {
      x: input.center.x - size.width / 2,
      y: input.center.y - size.height / 2,
    },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: "#ffffff",
      opacity: 1,
      stroke: "#64748b",
      strokeWidth: 1,
    },
    visible: true,
  };
}

export function addCoordinatePlotSeries(
  definition: CoordinatePlotDefinition,
  kind: PlotSeries["kind"],
  id: PlotSeriesId,
): CoordinatePlotDefinition {
  if (definition.series.length >= maximumCoordinatePlotSeries)
    return definition;
  const index = definition.series.length;
  const series =
    kind === "explicit"
      ? createExplicitPlotSeries(id, index)
      : createParametricPlotSeries(id, index);
  return { ...definition, series: [...definition.series, series] };
}

export function replaceCoordinatePlotSeriesKind(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  kind: PlotSeries["kind"],
): CoordinatePlotDefinition {
  const index = definition.series.findIndex(({ id }) => id === seriesId);
  if (index < 0 || definition.series[index]?.kind === kind) return definition;
  const current = definition.series[index]!;
  const replacement =
    kind === "explicit"
      ? createExplicitPlotSeries(seriesId, index)
      : createParametricPlotSeries(seriesId, index);
  const series = [...definition.series];
  series[index] = {
    ...replacement,
    id: current.id,
    name: current.name,
    style: current.style,
    visible: current.visible,
  };
  return { ...definition, series };
}

export function updateCoordinatePlotSeries(
  definition: CoordinatePlotDefinition,
  replacement: PlotSeries,
): CoordinatePlotDefinition {
  const index = definition.series.findIndex(({ id }) => id === replacement.id);
  if (index < 0) return definition;
  const series = [...definition.series];
  series[index] = replacement;
  return { ...definition, series };
}

export function removeCoordinatePlotSeries(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
): CoordinatePlotDefinition {
  return {
    ...definition,
    series: definition.series.filter(({ id }) => id !== seriesId),
  };
}

function nextParameterName(parameters: readonly PlotParameter[]): string {
  const names = parameters.map(({ name }) => name);
  for (const candidate of "abcdefghijklmnopqrstuvwxyz") {
    if (validatePlotParameterName(candidate, names) === null) return candidate;
  }
  let index = 1;
  while (validatePlotParameterName(`a${index}`, names) !== null) index += 1;
  return `a${index}`;
}

function requestedParameterName(
  parameters: readonly PlotParameter[],
  requestedName: string | undefined,
): string | null {
  const name = requestedName?.trim() ?? "";
  return validatePlotParameterName(
    name,
    parameters.map((parameter) => parameter.name),
  ) === null
    ? name
    : null;
}

export function addCoordinatePlotParameter(
  definition: CoordinatePlotDefinition,
  id: PlotParameterId,
  requestedName?: string,
): CoordinatePlotDefinition {
  if (definition.parameters.length >= maximumCoordinatePlotParameters) {
    return definition;
  }
  const parameter: PlotParameter = {
    id,
    max: 10,
    min: -10,
    name:
      requestedParameterName(definition.parameters, requestedName) ??
      nextParameterName(definition.parameters),
    step: 0.1,
    value: 1,
  };
  return {
    ...definition,
    parameters: [...definition.parameters, parameter],
  };
}

export function updateCoordinatePlotParameter(
  definition: CoordinatePlotDefinition,
  replacement: PlotParameter,
): CoordinatePlotDefinition {
  const index = definition.parameters.findIndex(
    ({ id }) => id === replacement.id,
  );
  if (index < 0) return definition;
  const parameters = [...definition.parameters];
  parameters[index] = replacement;
  return { ...definition, parameters };
}

export function removeCoordinatePlotParameter(
  definition: CoordinatePlotDefinition,
  parameterId: PlotParameterId,
): CoordinatePlotDefinition {
  return {
    ...definition,
    parameters: definition.parameters.filter(({ id }) => id !== parameterId),
  };
}

function expressionIssue(
  field: string,
  source: string,
  context: PlotExpressionContext,
  parameterNames: readonly string[],
): readonly CoordinatePlotEditorIssue[] {
  const compiled = compilePlotExpression(source, { context, parameterNames });
  if (compiled.ok) return [];
  return compiled.diagnostics.map((diagnostic) => ({
    blocking: false,
    code: diagnostic.code,
    end: diagnostic.end,
    field,
    message: diagnostic.message,
    start: diagnostic.start,
  }));
}

export function validateCoordinatePlotEditorDefinition(
  definition: CoordinatePlotDefinition,
): readonly CoordinatePlotEditorIssue[] {
  const parameterNames = definition.parameters.map(({ name }) => name);
  const structural = validateCoordinatePlotDefinition(definition).map(
    (issue): CoordinatePlotEditorIssue => ({
      blocking: true,
      code: issue.code,
      end: null,
      field: issue.path,
      message: issue.message,
      start: null,
    }),
  );
  const expressions = definition.series.flatMap((series, index) => {
    const prefix = `series.${index}`;
    if (series.kind === "explicit") {
      return [
        ...expressionIssue(
          `${prefix}.expression`,
          series.expression,
          "explicit-function",
          parameterNames,
        ),
        ...(series.domain.minExpression === null
          ? []
          : expressionIssue(
              `${prefix}.domain.minExpression`,
              series.domain.minExpression,
              "explicit-domain",
              parameterNames,
            )),
        ...(series.domain.maxExpression === null
          ? []
          : expressionIssue(
              `${prefix}.domain.maxExpression`,
              series.domain.maxExpression,
              "explicit-domain",
              parameterNames,
            )),
      ];
    }
    return [
      ...expressionIssue(
        `${prefix}.xExpression`,
        series.xExpression,
        "parametric-x",
        parameterNames,
      ),
      ...expressionIssue(
        `${prefix}.yExpression`,
        series.yExpression,
        "parametric-y",
        parameterNames,
      ),
      ...expressionIssue(
        `${prefix}.range.minExpression`,
        series.range.minExpression,
        "parametric-range",
        parameterNames,
      ),
      ...expressionIssue(
        `${prefix}.range.maxExpression`,
        series.range.maxExpression,
        "parametric-range",
        parameterNames,
      ),
    ];
  });
  return [...structural, ...expressions];
}

const maximumFitExpansionFactor = 100;

function evaluateFitBound(
  source: string | null,
  fallback: number,
  parameterNames: readonly string[],
  bindings: Readonly<Record<string, number>>,
): number | null {
  if (source === null) return fallback;
  const compiled = compilePlotExpression(source, {
    context: "explicit-domain",
    parameterNames,
  });
  if (!compiled.ok) return null;
  const evaluated = evaluatePlotExpression(compiled.expression, bindings);
  return evaluated.kind === "value" && Number.isFinite(evaluated.value)
    ? evaluated.value
    : null;
}

function fitSamplingViewport(
  definition: CoordinatePlotDefinition,
): CoordinatePlotViewport {
  const current = definition.coordinateViewport;
  const parameterNames = definition.parameters.map(({ name }) => name);
  const bindings = Object.fromEntries(
    definition.parameters.map(({ name, value }) => [name, value]),
  );
  const ranges = definition.series.flatMap((series) => {
    if (!series.visible || series.kind !== "explicit") return [];
    const minimum = evaluateFitBound(
      series.domain.minExpression,
      current.xMin,
      parameterNames,
      bindings,
    );
    const maximum = evaluateFitBound(
      series.domain.maxExpression,
      current.xMax,
      parameterNames,
      bindings,
    );
    return minimum !== null && maximum !== null && minimum < maximum
      ? [{ maximum, minimum }]
      : [];
  });
  if (ranges.length === 0) return current;
  const requestedMinimum = Math.min(...ranges.map(({ minimum }) => minimum));
  const requestedMaximum = Math.max(...ranges.map(({ maximum }) => maximum));
  const currentSpan = Math.max(1e-6, current.xMax - current.xMin);
  const maximumSpan = currentSpan * maximumFitExpansionFactor;
  const requestedSpan = requestedMaximum - requestedMinimum;
  if (!(requestedSpan > maximumSpan)) {
    return { ...current, xMax: requestedMaximum, xMin: requestedMinimum };
  }
  const center = (requestedMinimum + requestedMaximum) / 2;
  return {
    ...current,
    xMax: center + maximumSpan / 2,
    xMin: center - maximumSpan / 2,
  };
}

function paddedFitRange(
  minimum: number,
  maximum: number,
  referenceMinimum: number,
  referenceMaximum: number,
): { readonly maximum: number; readonly minimum: number } {
  const rawSpan = Math.max(1e-6, maximum - minimum);
  const padding = Math.max(rawSpan * 0.08, 0.25);
  const paddedMinimum = minimum - padding;
  const paddedMaximum = maximum + padding;
  const referenceSpan = Math.max(1e-6, referenceMaximum - referenceMinimum);
  const maximumSpan = referenceSpan * maximumFitExpansionFactor;
  if (paddedMaximum - paddedMinimum <= maximumSpan) {
    return { maximum: paddedMaximum, minimum: paddedMinimum };
  }
  const center = (minimum + maximum) / 2;
  return {
    maximum: center + maximumSpan / 2,
    minimum: center - maximumSpan / 2,
  };
}

export function fitCoordinatePlotDefinition(
  definition: CoordinatePlotDefinition,
): CoordinatePlotDefinition {
  const samplingViewport = fitSamplingViewport(definition);
  const sampled = sampleCoordinatePlotDefinition({
    boardZoom: 1,
    definition: { ...definition, coordinateViewport: samplingViewport },
    pixelSize: definition.size,
  });
  const bounds = sampled.series.flatMap(({ sample, status }) =>
    sample?.dataBounds === null ||
    sample?.dataBounds === undefined ||
    (status !== "sampled" && status !== "truncated" && status !== "empty")
      ? []
      : [sample.dataBounds],
  );
  if (bounds.length === 0) return definition;
  const x = paddedFitRange(
    Math.min(...bounds.map((item) => item.xMin)),
    Math.max(...bounds.map((item) => item.xMax)),
    samplingViewport.xMin,
    samplingViewport.xMax,
  );
  const y = paddedFitRange(
    Math.min(...bounds.map((item) => item.yMin)),
    Math.max(...bounds.map((item) => item.yMax)),
    definition.coordinateViewport.yMin,
    definition.coordinateViewport.yMax,
  );
  return {
    ...definition,
    coordinateViewport: {
      ...definition.coordinateViewport,
      xMax: x.maximum,
      xMin: x.minimum,
      yMax: y.maximum,
      yMin: y.minimum,
    },
  };
}

export function resetCoordinatePlotViewport(
  definition: CoordinatePlotDefinition,
): CoordinatePlotDefinition {
  return {
    ...definition,
    coordinateViewport: {
      ...standardCoordinatePlotViewport,
      equalScale: definition.coordinateViewport.equalScale,
    },
  };
}
