import {
  compilePlotExpression,
  evaluatePlotExpression,
} from "../plot-expression/public";
import type {
  CoordinatePlotDefinition,
  ExplicitPlotSeries,
} from "./coordinate-plot";

export interface ResolvedExplicitDomain {
  readonly max: number;
  readonly maxInclusive: boolean;
  readonly min: number;
  readonly minInclusive: boolean;
  readonly singleton: boolean;
}

export function evaluatePiecewiseScalar(
  definition: CoordinatePlotDefinition,
  source: string,
): number | null {
  const compiled = compilePlotExpression(source, {
    context: "explicit-domain",
    parameterNames: definition.parameters.map(({ name }) => name),
  });
  if (!compiled.ok) return null;
  const value = evaluatePlotExpression(
    compiled.expression,
    Object.fromEntries(
      definition.parameters.map(({ name, value }) => [name, value]),
    ),
  );
  return value.kind === "value" && Number.isFinite(value.value)
    ? value.value
    : null;
}

/** Resolve the mathematical domain, before viewport clipping. */
export function resolveExplicitPlotDomain(
  definition: CoordinatePlotDefinition,
  series: ExplicitPlotSeries,
): ResolvedExplicitDomain | null {
  const { domain } = series;
  const min =
    domain.minExpression === null
      ? -Infinity
      : evaluatePiecewiseScalar(definition, domain.minExpression);
  const max =
    domain.maxExpression === null
      ? Infinity
      : evaluatePiecewiseScalar(definition, domain.maxExpression);
  if (min === null || max === null || min > max) return null;
  const minInclusive = domain.minInclusive ?? true;
  const maxInclusive = domain.maxInclusive ?? true;
  const singleton = min === max;
  if (singleton && (!minInclusive || !maxInclusive)) return null;
  return { max, maxInclusive, min, minInclusive, singleton };
}

/**
 * Domain constraints shared by editor, commands and document validation.
 * Independent explicit series may overlap; only members of one piecewise group
 * must represent a single-valued function.
 */
export function validatePiecewisePlotDefinition(
  definition: CoordinatePlotDefinition,
): readonly {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}[] {
  const issues: { code: string; path: string; message: string }[] = [];
  const groups = new Map<
    string,
    {
      index: number;
      series: ExplicitPlotSeries;
      bounds: ResolvedExplicitDomain;
    }[]
  >();
  definition.series.forEach((series, index) => {
    if (series.kind !== "explicit") return;
    const bounds = resolveExplicitPlotDomain(definition, series);
    if (bounds === null) {
      issues.push({
        code: "plot.invalid-piecewise-domain",
        path: `series.${index}.domain`,
        message:
          "Explicit domain bounds must be ordered and a singleton must include its point.",
      });
      return;
    }
    if (series.piecewiseGroupId === undefined) return;
    const members = groups.get(series.piecewiseGroupId) ?? [];
    members.push({ index, series, bounds });
    groups.set(series.piecewiseGroupId, members);
  });
  const parameterNames = definition.parameters.map(({ name }) => name);
  const bindings = Object.fromEntries(
    definition.parameters.map(({ name, value }) => [name, value]),
  );
  const includedAt = (bounds: ResolvedExplicitDomain, x: number): boolean =>
    (x > bounds.min || (x === bounds.min && bounds.minInclusive)) &&
    (x < bounds.max || (x === bounds.max && bounds.maxInclusive));
  const evaluateAt = (series: ExplicitPlotSeries, x: number): number | null => {
    const compiled = compilePlotExpression(series.expression, {
      context: "explicit-function",
      parameterNames,
    });
    if (!compiled.ok) return null;
    const result = evaluatePlotExpression(compiled.expression, {
      ...bindings,
      x,
    });
    return result.kind === "value" && Number.isFinite(result.value)
      ? result.value
      : null;
  };
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const left = members[i]!;
        const right = members[j]!;
        const intersectionMin = Math.max(left.bounds.min, right.bounds.min);
        const intersectionMax = Math.min(left.bounds.max, right.bounds.max);
        if (intersectionMin > intersectionMax) continue;
        const path = `series.${right.index}.domain`;
        if (intersectionMin < intersectionMax) {
          issues.push({
            code: "plot.piecewise-overlap",
            path,
            message:
              "Branches in the same piecewise group overlap over an interval.",
          });
          continue;
        }
        if (
          !Number.isFinite(intersectionMin) ||
          !includedAt(left.bounds, intersectionMin) ||
          !includedAt(right.bounds, intersectionMin)
        )
          continue;
        const firstValue = evaluateAt(left.series, intersectionMin);
        const secondValue = evaluateAt(right.series, intersectionMin);
        // Equality is exact here: any two different outputs violate
        // the single-valued-function invariant, even by 1e-10.
        if (
          firstValue === null ||
          secondValue === null ||
          firstValue !== secondValue
        ) {
          issues.push({
            code: "plot.piecewise-conflict",
            path,
            message:
              "Two branches define different or undefined values at the same x.",
          });
        }
      }
    }
  }
  return issues;
}

/** The closest representable floating-point value strictly inside an endpoint. */
export function nextPlotFloat(value: number, direction: "up" | "down"): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0)
    return direction === "up" ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const buffer = new ArrayBuffer(8);
  const bits = new BigUint64Array(buffer);
  const numbers = new Float64Array(buffer);
  numbers[0] = value;
  if (value > 0 === (direction === "up")) bits[0] = bits[0]! + 1n;
  else bits[0] = bits[0]! - 1n;
  return numbers[0];
}
