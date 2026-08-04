import type {
  CoordinatePlotDefinition,
  ExplicitPlotSeries,
  ParametricPlotSeries,
  PlotSeries,
  RelationPlotSeries,
} from "../board/coordinate-plot";
import type { Size2 } from "../board/primitives";
import {
  compilePlotExpression,
  evaluatePlotExpression,
  parsePlotRelation,
  type CompiledPlotExpression,
  type ExpressionDiagnostic,
  type PlotExpressionContext,
} from "../plot-expression/public";
import { createPlotSamplingCacheKey } from "./cache";
import { plotPixelSizeIsValid, plotViewportIsValid } from "./coordinates";
import type { PlotSamplingDiagnostic, PlotSamplingOptions } from "./types";

interface CompiledFieldSuccess {
  readonly expression: CompiledPlotExpression;
  readonly ok: true;
}

interface CompiledFieldFailure {
  readonly diagnostics: readonly PlotSamplingDiagnostic[];
  readonly ok: false;
}

type CompiledFieldResult = CompiledFieldSuccess | CompiledFieldFailure;

type ScalarResult =
  | { readonly ok: true; readonly value: number }
  | {
      readonly diagnostics: readonly PlotSamplingDiagnostic[];
      readonly ok: false;
    };

export function diagnostic(
  code: PlotSamplingDiagnostic["code"],
  field: string,
  message: string,
): PlotSamplingDiagnostic {
  return { code, end: null, field, message, start: null };
}

function expressionDiagnostics(
  field: string,
  diagnostics: readonly ExpressionDiagnostic[],
  offset = 0,
): readonly PlotSamplingDiagnostic[] {
  return diagnostics.map((item) => ({
    code: item.code,
    end: item.end + offset,
    field,
    message: item.message,
    start: item.start + offset,
  }));
}

function compileField(
  source: string,
  context: PlotExpressionContext,
  parameterNames: readonly string[],
  field: string,
  offset = 0,
): CompiledFieldResult {
  const compiled = compilePlotExpression(source, { context, parameterNames });
  return compiled.ok
    ? { expression: compiled.expression, ok: true }
    : {
        diagnostics: expressionDiagnostics(field, compiled.diagnostics, offset),
        ok: false,
      };
}

function evaluateScalar(
  expression: CompiledPlotExpression,
  bindings: Readonly<Record<string, number>>,
  field: string,
): ScalarResult {
  const result = evaluatePlotExpression(expression, bindings);
  if (result.kind === "value") return { ok: true, value: result.value };
  const detail =
    result.kind === "missing-bindings"
      ? `Missing bindings: ${result.names.join(", ")}.`
      : result.kind === "budget-exceeded"
        ? "The expression evaluation budget was exceeded."
        : `The expression is undefined (${result.reason}).`;
  return {
    diagnostics: [
      diagnostic("sampling.expression-evaluation-failed", field, detail),
    ],
    ok: false,
  };
}

export function parameterBindings(
  definition: CoordinatePlotDefinition,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    definition.parameters.map((parameter) => [parameter.name, parameter.value]),
  );
}

export function invalidParameterDiagnostics(
  definition: CoordinatePlotDefinition,
): readonly PlotSamplingDiagnostic[] {
  return definition.parameters.flatMap((parameter, index) =>
    Number.isFinite(parameter.value)
      ? []
      : [
          diagnostic(
            "sampling.invalid-parameter-value",
            `parameters.${index}.value`,
            `Parameter ${parameter.name} must have a finite value.`,
          ),
        ],
  );
}

export function invalidGeometryDiagnostics(input: {
  readonly boardZoom: number;
  readonly definition: CoordinatePlotDefinition;
  readonly pixelSize: Size2;
}): readonly PlotSamplingDiagnostic[] {
  const diagnostics: PlotSamplingDiagnostic[] = [];
  if (!plotPixelSizeIsValid(input.pixelSize)) {
    diagnostics.push(
      diagnostic(
        "sampling.invalid-pixel-size",
        "pixelSize",
        "Plot pixel width and height must be positive finite values.",
      ),
    );
  }
  if (!Number.isFinite(input.boardZoom) || input.boardZoom <= 0) {
    diagnostics.push(
      diagnostic(
        "sampling.invalid-board-zoom",
        "boardZoom",
        "Board zoom must be a positive finite value.",
      ),
    );
  }
  if (!plotViewportIsValid(input.definition.coordinateViewport)) {
    diagnostics.push(
      diagnostic(
        "sampling.invalid-viewport",
        "coordinateViewport",
        "Coordinate viewport bounds must be finite and increasing.",
      ),
    );
  }
  return diagnostics;
}

export function cacheKey(input: {
  readonly bindingNames: readonly string[];
  readonly boardZoom: number;
  readonly bindings: Readonly<Record<string, number>>;
  readonly definition: CoordinatePlotDefinition;
  readonly options: PlotSamplingOptions | undefined;
  readonly pixelSize: Size2;
  readonly series: PlotSeries;
}): string {
  const seriesGeometry = (() => {
    if (input.series.kind === "explicit") {
      return {
        domain: input.series.domain,
        expression: input.series.expression,
        kind: input.series.kind,
      };
    }
    if (input.series.kind === "parametric") {
      return {
        closed: input.series.closed,
        kind: input.series.kind,
        range: input.series.range,
        xExpression: input.series.xExpression,
        yExpression: input.series.yExpression,
      };
    }
    return { expression: input.series.expression, kind: input.series.kind };
  })();
  const bindings = Object.fromEntries(
    input.bindingNames.flatMap((name) =>
      Object.hasOwn(input.bindings, name)
        ? [[name, input.bindings[name]!]]
        : [],
    ),
  );
  return createPlotSamplingCacheKey({
    bindings,
    boardZoom: input.boardZoom,
    options: input.options ?? {},
    pixelSize: input.pixelSize,
    series: seriesGeometry,
    viewport: input.definition.coordinateViewport,
  });
}

function referencedParameterNames(
  sources: readonly string[],
  parameterNames: readonly string[],
): readonly string[] {
  const allowed = new Set(parameterNames);
  const referenced = new Set<string>();
  for (const source of sources) {
    for (const identifier of source.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? []) {
      if (allowed.has(identifier)) referenced.add(identifier);
    }
  }
  return [...referenced].sort();
}

export function compileExplicit(input: {
  readonly bindings: Readonly<Record<string, number>>;
  readonly definition: CoordinatePlotDefinition;
  readonly parameterNames: readonly string[];
  readonly series: ExplicitPlotSeries;
}):
  | {
      readonly bindingNames: readonly string[];
      readonly domain: { readonly max: number; readonly min: number } | null;
      readonly expression: CompiledPlotExpression;
      readonly ok: true;
    }
  | CompiledFieldFailure {
  const expression = compileField(
    input.series.expression,
    "explicit-function",
    input.parameterNames,
    "expression",
  );
  if (!expression.ok) return expression;

  const domainValues: { max?: number; min?: number } = {};
  const diagnostics: PlotSamplingDiagnostic[] = [];
  for (const [edge, source] of [
    ["min", input.series.domain.minExpression],
    ["max", input.series.domain.maxExpression],
  ] as const) {
    if (source === null) {
      domainValues[edge] =
        edge === "min"
          ? input.definition.coordinateViewport.xMin
          : input.definition.coordinateViewport.xMax;
      continue;
    }
    const compiled = compileField(
      source,
      "explicit-domain",
      input.parameterNames,
      `domain.${edge}Expression`,
    );
    if (!compiled.ok) {
      diagnostics.push(...compiled.diagnostics);
      continue;
    }
    const evaluated = evaluateScalar(
      compiled.expression,
      input.bindings,
      `domain.${edge}Expression`,
    );
    if (evaluated.ok) domainValues[edge] = evaluated.value;
    else diagnostics.push(...evaluated.diagnostics);
  }
  if (diagnostics.length > 0) return { diagnostics, ok: false };

  const rawMinimum = domainValues.min!;
  const rawMaximum = domainValues.max!;
  if (
    !Number.isFinite(rawMinimum) ||
    !Number.isFinite(rawMaximum) ||
    rawMinimum >= rawMaximum
  ) {
    return {
      diagnostics: [
        diagnostic(
          "sampling.invalid-domain",
          "domain",
          "The explicit-function domain must have finite increasing bounds.",
        ),
      ],
      ok: false,
    };
  }
  const minimum = Math.max(
    rawMinimum,
    input.definition.coordinateViewport.xMin,
  );
  const maximum = Math.min(
    rawMaximum,
    input.definition.coordinateViewport.xMax,
  );
  return {
    bindingNames: referencedParameterNames(
      [
        input.series.expression,
        input.series.domain.minExpression ?? "",
        input.series.domain.maxExpression ?? "",
      ],
      input.parameterNames,
    ),
    domain: minimum < maximum ? { max: maximum, min: minimum } : null,
    expression: expression.expression,
    ok: true,
  };
}

export function compileParametric(input: {
  readonly bindings: Readonly<Record<string, number>>;
  readonly parameterNames: readonly string[];
  readonly series: ParametricPlotSeries;
}):
  | {
      readonly bindingNames: readonly string[];
      readonly ok: true;
      readonly range: { readonly max: number; readonly min: number };
      readonly xExpression: CompiledPlotExpression;
      readonly yExpression: CompiledPlotExpression;
    }
  | CompiledFieldFailure {
  const xExpression = compileField(
    input.series.xExpression,
    "parametric-x",
    input.parameterNames,
    "xExpression",
  );
  const yExpression = compileField(
    input.series.yExpression,
    "parametric-y",
    input.parameterNames,
    "yExpression",
  );
  const minimum = compileField(
    input.series.range.minExpression,
    "parametric-range",
    input.parameterNames,
    "range.minExpression",
  );
  const maximum = compileField(
    input.series.range.maxExpression,
    "parametric-range",
    input.parameterNames,
    "range.maxExpression",
  );
  const diagnostics = [xExpression, yExpression, minimum, maximum].flatMap(
    (result) => (result.ok ? [] : result.diagnostics),
  );
  if (diagnostics.length > 0) return { diagnostics, ok: false };
  if (!xExpression.ok || !yExpression.ok || !minimum.ok || !maximum.ok) {
    return { diagnostics, ok: false };
  }
  const minimumValue = evaluateScalar(
    minimum.expression,
    input.bindings,
    "range.minExpression",
  );
  const maximumValue = evaluateScalar(
    maximum.expression,
    input.bindings,
    "range.maxExpression",
  );
  const evaluationDiagnostics = [minimumValue, maximumValue].flatMap(
    (result) => (result.ok ? [] : result.diagnostics),
  );
  if (evaluationDiagnostics.length > 0) {
    return { diagnostics: evaluationDiagnostics, ok: false };
  }
  if (!minimumValue.ok || !maximumValue.ok) {
    return { diagnostics: evaluationDiagnostics, ok: false };
  }
  if (
    !Number.isFinite(minimumValue.value) ||
    !Number.isFinite(maximumValue.value) ||
    minimumValue.value >= maximumValue.value
  ) {
    return {
      diagnostics: [
        diagnostic(
          "sampling.invalid-range",
          "range",
          "The parametric range must have finite increasing bounds.",
        ),
      ],
      ok: false,
    };
  }
  return {
    bindingNames: referencedParameterNames(
      [
        input.series.xExpression,
        input.series.yExpression,
        input.series.range.minExpression,
        input.series.range.maxExpression,
      ],
      input.parameterNames,
    ),
    ok: true,
    range: { max: maximumValue.value, min: minimumValue.value },
    xExpression: xExpression.expression,
    yExpression: yExpression.expression,
  };
}

export function compileRelation(input: {
  readonly parameterNames: readonly string[];
  readonly series: RelationPlotSeries;
}):
  | {
      readonly bindingNames: readonly string[];
      readonly leftExpression: CompiledPlotExpression;
      readonly ok: true;
      readonly operator: "=" | "<" | "<=" | ">" | ">=";
      readonly rightExpression: CompiledPlotExpression;
    }
  | CompiledFieldFailure {
  const relation = parsePlotRelation(input.series.expression);
  if (!relation.ok) {
    return {
      diagnostics: [
        {
          code: "expression.unexpected-token",
          end: relation.end,
          field: "expression",
          message: relation.message,
          start: relation.start,
        },
      ],
      ok: false,
    };
  }
  const left = compileField(
    relation.leftSource,
    "relation-side",
    input.parameterNames,
    "expression",
    relation.leftStart,
  );
  const right = compileField(
    relation.rightSource,
    "relation-side",
    input.parameterNames,
    "expression",
    relation.rightStart,
  );
  const diagnostics = [left, right].flatMap((result) =>
    result.ok ? [] : result.diagnostics,
  );
  if (diagnostics.length > 0 || !left.ok || !right.ok) {
    return { diagnostics, ok: false };
  }
  return {
    bindingNames: referencedParameterNames(
      [relation.leftSource, relation.rightSource],
      input.parameterNames,
    ),
    leftExpression: left.expression,
    ok: true,
    operator: relation.operator,
    rightExpression: right.expression,
  };
}
