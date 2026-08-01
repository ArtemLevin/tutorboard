import { expect } from "vitest";

import {
  compilePlotExpression,
  type CompiledPlotExpression,
  type PlotExpressionContext,
} from "../../../../src/core/plot-expression/public";
import type { SampledPlotSeries } from "../../../../src/core/plot-sampling/public";

export function compile(
  source: string,
  context: PlotExpressionContext,
  parameterNames: readonly string[] = [],
): CompiledPlotExpression {
  const result = compilePlotExpression(source, { context, parameterNames });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.expression;
}

export function expectClipped(
  sample: SampledPlotSeries,
  width: number,
  height: number,
): void {
  for (const segment of sample.segments) {
    expect(segment.length).toBeGreaterThanOrEqual(2);
    for (const point of segment) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-8);
      expect(point.x).toBeLessThanOrEqual(width + 1e-8);
      expect(point.y).toBeGreaterThanOrEqual(-1e-8);
      expect(point.y).toBeLessThanOrEqual(height + 1e-8);
    }
  }
}
