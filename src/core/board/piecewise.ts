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
