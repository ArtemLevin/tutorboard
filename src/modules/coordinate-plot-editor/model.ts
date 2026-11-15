import {
  evaluatePiecewiseScalar,
  resolveExplicitPlotDomain,
} from "../../core/board/piecewise";
import {
  compilePlotExpression,
  coordinatePlotExpressionLanguage,
  evaluatePlotExpression,
  maximumCoordinatePlotParameters,
  maximumCoordinatePlotSeries,
  parsePlotRelation,
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
  type RelationPlotSeries,
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

export function createRelationPlotSeries(
  id: PlotSeriesId,
  index: number,
): RelationPlotSeries {
  return {
    expression: "x^2+y^2=25",
    fillOpacity: 0.16,
    id,
    kind: "relation",
    name: `Уравнение ${index + 1}`,
    style: {
      lineStyle: "solid",
      opacity: 1,
      stroke: seriesColor(index),
      strokeWidth: 3,
    },
    visible: true,
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
      : kind === "parametric"
        ? createParametricPlotSeries(id, index)
        : createRelationPlotSeries(id, index);
  return { ...definition, series: [...definition.series, series] };
}

/**
 * Turn an explicit series into the first two branches of a piecewise function.
 * Both branches remain ordinary explicit series, preserving persistence,
 * collaboration and renderer contracts for existing boards.
 */
/** Whether the cut lies strictly inside the selected branch. */
export function canSplitCoordinatePlotSeries(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  boundary: string = "0",
): boolean {
  if (definition.series.length >= maximumCoordinatePlotSeries) return false;
  const series = definition.series.find(({ id }) => id === seriesId);
  if (series?.kind !== "explicit") return false;
  const domain = resolveExplicitPlotDomain(definition, series);
  const cut = evaluatePiecewiseScalar(definition, boundary);
  return (
    domain !== null && cut !== null && domain.min < cut && cut < domain.max
  );
}

/** Split a branch in place, preserving its current outer bounds. */
export function splitCoordinatePlotSeries(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  secondId: PlotSeriesId,
  boundary: string = "0",
): CoordinatePlotDefinition {
  if (
    !canSplitCoordinatePlotSeries(definition, seriesId, boundary) ||
    definition.series.some(({ id }) => id === secondId)
  )
    return definition;
  const index = definition.series.findIndex(({ id }) => id === seriesId);
  const source = definition.series[index];
  if (source?.kind !== "explicit") return definition;
  const groupId = source.piecewiseGroupId ?? source.id;
  const members = definition.series.filter(
    (series) =>
      series.kind === "explicit" && series.piecewiseGroupId === groupId,
  );
  const baseName = source.name.replace(/ · ветвь \d+$/u, "");
  const first: ExplicitPlotSeries = {
    ...source,
    piecewiseGroupId: groupId,
    name:
      source.piecewiseGroupId === undefined
        ? `${baseName.slice(0, 110)} · ветвь 1`
        : source.name,
    domain: {
      ...source.domain,
      maxExpression: boundary,
      maxInclusive: false,
    },
  };
  const second: ExplicitPlotSeries = {
    ...source,
    id: secondId,
    piecewiseGroupId: groupId,
    name: `${baseName.slice(0, 110)} · ветвь ${members.length > 0 ? members.length + 1 : 2}`,
    domain: {
      ...source.domain,
      minExpression: boundary,
      minInclusive: true,
    },
  };
  const series = [...definition.series];
  series.splice(index, 1, first, second);
  return { ...definition, series };
}

export function canAddPiecewisePoint(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  boundary: string,
): boolean {
  if (definition.series.length >= maximumCoordinatePlotSeries) return false;
  const selected = definition.series.find(({ id }) => id === seriesId);
  if (
    selected?.kind !== "explicit" ||
    selected.piecewiseGroupId === undefined
  ) {
    return false;
  }
  const x = evaluatePiecewiseScalar(definition, boundary);
  if (x === null) return false;
  return !definition.series.some((series) => {
    if (
      series.kind !== "explicit" ||
      series.piecewiseGroupId !== selected.piecewiseGroupId
    )
      return false;
    const domain = resolveExplicitPlotDomain(definition, series);
    return (
      domain === null ||
      (domain.min < x && x < domain.max) ||
      (domain.singleton && domain.min === x)
    );
  });
}

/** Insert f(x₀) as a singleton branch and exclude it from adjacent branches. */
export function addPiecewisePoint(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  newId: PlotSeriesId,
  boundary: string,
): CoordinatePlotDefinition {
  if (
    !canAddPiecewisePoint(definition, seriesId, boundary) ||
    definition.series.some(({ id }) => id === newId)
  )
    return definition;
  const source = definition.series.find(({ id }) => id === seriesId);
  if (source?.kind !== "explicit" || source.piecewiseGroupId === undefined) {
    return definition;
  }
  const x = evaluatePiecewiseScalar(definition, boundary);
  if (x === null) return definition;
  const series = definition.series.map((item): PlotSeries => {
    if (
      item.kind !== "explicit" ||
      item.piecewiseGroupId !== source.piecewiseGroupId
    ) {
      return item;
    }
    const domain = resolveExplicitPlotDomain(definition, item);
    if (domain === null) return item;
    return {
      ...item,
      domain: {
        ...item.domain,
        ...(domain.min === x && item.domain.minExpression !== null
          ? { minInclusive: false }
          : {}),
        ...(domain.max === x && item.domain.maxExpression !== null
          ? { maxInclusive: false }
          : {}),
      },
    };
  });
  const index = series.findIndex(({ id }) => id === seriesId);
  const point: ExplicitPlotSeries = {
    ...source,
    id: newId,
    name: `${source.name.slice(0, 105)} · точка ${boundary.slice(0, 10)}`,
    expression: "0",
    domain: {
      minExpression: boundary,
      maxExpression: boundary,
      minInclusive: true,
      maxInclusive: true,
    },
  };
  series.splice(index + 1, 0, point);
  return { ...definition, series };
}

export function removePiecewiseGroup(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
): CoordinatePlotDefinition {
  const selected = definition.series.find(({ id }) => id === seriesId);
  if (
    selected?.kind !== "explicit" ||
    selected.piecewiseGroupId === undefined
  ) {
    return definition;
  }
  return {
    ...definition,
    series: definition.series.filter(
      (series) =>
        series.kind !== "explicit" ||
        series.piecewiseGroupId !== selected.piecewiseGroupId,
    ),
  };
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
      : kind === "parametric"
        ? createParametricPlotSeries(seriesId, index)
        : createRelationPlotSeries(seriesId, index);
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

export function coordinatePlotSeriesInput(series: PlotSeries): string {
  if (series.kind === "explicit") return `y = ${series.expression}`;
  if (series.kind === "relation") return series.expression;
  return `x(t) = ${series.xExpression}; y(t) = ${series.yExpression}`;
}

export function updateCoordinatePlotSeriesInput(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  source: string,
): CoordinatePlotDefinition {
  const index = definition.series.findIndex(({ id }) => id === seriesId);
  if (index < 0) return definition;
  const current = definition.series[index]!;
  if (current.kind === "parametric") return definition;
  const relation = parsePlotRelation(source);
  const explicitPrefix = /^\s*y\s*=\s*/iu.exec(source);
  let replacement: PlotSeries;
  if (
    relation.ok &&
    relation.operator === "=" &&
    relation.leftSource.toLowerCase() === "y"
  ) {
    replacement = {
      ...createExplicitPlotSeries(current.id, index),
      ...(current.kind === "explicit" ? { domain: current.domain } : {}),
      expression: relation.rightSource,
      name: current.name,
      style: current.style,
      visible: current.visible,
    };
  } else if (explicitPrefix !== null) {
    replacement = {
      ...createExplicitPlotSeries(current.id, index),
      ...(current.kind === "explicit" ? { domain: current.domain } : {}),
      expression: source.slice(explicitPrefix[0].length),
      name: current.name,
      style: current.style,
      visible: current.visible,
    };
  } else if (relation.ok || /[=<>≤≥]/u.test(source)) {
    replacement = {
      ...createRelationPlotSeries(current.id, index),
      expression: source,
      fillOpacity: current.kind === "relation" ? current.fillOpacity : 0.16,
      name: current.name,
      style: current.style,
      visible: current.visible,
    };
  } else {
    replacement = {
      ...createExplicitPlotSeries(current.id, index),
      ...(current.kind === "explicit" ? { domain: current.domain } : {}),
      expression: source,
      name: current.name,
      style: current.style,
      visible: current.visible,
    };
  }
  return updateCoordinatePlotSeries(definition, replacement);
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

function relationExpressionIssues(
  field: string,
  source: string,
  parameterNames: readonly string[],
): readonly CoordinatePlotEditorIssue[] {
  const relation = parsePlotRelation(source);
  if (!relation.ok) {
    return [
      {
        blocking: false,
        code: "expression.invalid-relation",
        end: relation.end,
        field,
        message: relation.message,
        start: relation.start,
      },
    ];
  }
  return [
    ...expressionIssue(
      field,
      relation.leftSource,
      "relation-side",
      parameterNames,
    ).map((issue) => ({
      ...issue,
      end: issue.end === null ? null : issue.end + relation.leftStart,
      start: issue.start === null ? null : issue.start + relation.leftStart,
    })),
    ...expressionIssue(
      field,
      relation.rightSource,
      "relation-side",
      parameterNames,
    ).map((issue) => ({
      ...issue,
      end: issue.end === null ? null : issue.end + relation.rightStart,
      start: issue.start === null ? null : issue.start + relation.rightStart,
    })),
  ];
}

function piecewiseValidationIssues(
  definition: CoordinatePlotDefinition,
): CoordinatePlotEditorIssue[] {
  const issues: CoordinatePlotEditorIssue[] = [];
  const members = new Map<
    PlotSeriesId,
    {
      index: number;
      series: ExplicitPlotSeries;
      bounds: NonNullable<ReturnType<typeof resolveExplicitPlotDomain>>;
    }[]
  >();
  const add = (index: number, code: string, message: string) => {
    issues.push({
      blocking: true,
      code,
      end: null,
      field: `series.${index}.domain`,
      message,
      start: null,
    });
  };
  definition.series.forEach((series, index) => {
    if (series.kind !== "explicit") return;
    const bounds = resolveExplicitPlotDomain(definition, series);
    if (bounds === null) {
      add(
        index,
        "plot.invalid-piecewise-domain",
        "Границы должны вычисляться, идти по возрастанию; одиночная точка требует включения обеих границ.",
      );
      return;
    }
    if (series.piecewiseGroupId === undefined) return;
    const group = members.get(series.piecewiseGroupId) ?? [];
    group.push({ index, series, bounds });
    members.set(series.piecewiseGroupId, group);
  });
  const params = Object.fromEntries(
    definition.parameters.map(({ name, value }) => [name, value]),
  );
  const parameterNames = definition.parameters.map(({ name }) => name);
  const yAt = (series: ExplicitPlotSeries, x: number): number | null => {
    const compiled = compilePlotExpression(series.expression, {
      context: "explicit-function",
      parameterNames,
    });
    if (!compiled.ok) return null;
    const result = evaluatePlotExpression(compiled.expression, {
      ...params,
      x,
    });
    return result.kind === "value" && Number.isFinite(result.value)
      ? result.value
      : null;
  };
  const includes = (
    bounds: NonNullable<ReturnType<typeof resolveExplicitPlotDomain>>,
    x: number,
  ): boolean =>
    (x > bounds.min || (x === bounds.min && bounds.minInclusive)) &&
    (x < bounds.max || (x === bounds.max && bounds.maxInclusive));
  for (const group of members.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const first = group[i]!;
        const second = group[j]!;
        const lo = Math.max(first.bounds.min, second.bounds.min);
        const hi = Math.min(first.bounds.max, second.bounds.max);
        if (lo > hi) continue;
        if (lo < hi) {
          add(
            second.index,
            "plot.piecewise-overlap",
            "Ветви одной кусочной функции перекрываются на интервале.",
          );
          continue;
        }
        if (
          !Number.isFinite(lo) ||
          !includes(first.bounds, lo) ||
          !includes(second.bounds, lo)
        )
          continue;
        const left = yAt(first.series, lo);
        const right = yAt(second.series, lo);
        if (
          left === null ||
          right === null ||
          Math.abs(left - right) >
            1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
        ) {
          add(
            second.index,
            "plot.piecewise-conflict",
            "В точке стыка кусочная функция имеет конфликтующие значения.",
          );
        }
      }
    }
  }
  return issues;
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
        ).map((issue) => ({
          ...issue,
          end: issue.end === null ? null : issue.end + 4,
          start: issue.start === null ? null : issue.start + 4,
        })),
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
    if (series.kind === "parametric") {
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
    }
    return relationExpressionIssues(
      `${prefix}.expression`,
      series.expression,
      parameterNames,
    );
  });
  return [
    ...structural,
    ...piecewiseValidationIssues(definition),
    ...expressions,
  ];
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
