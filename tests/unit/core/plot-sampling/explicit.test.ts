import { describe, expect, it } from "vitest";

import { sampleExplicitSeries } from "../../../../src/core/plot-sampling/public";
import { compile, expectClipped } from "./helpers";

const viewport = { xMax: 5, xMin: -5, yMax: 5, yMin: -5 };
const pixelSize = { height: 420, width: 640 };
const common = {
  boardZoom: 1,
  parameters: {},
  pixelSize,
  viewport,
};

describe("explicit coordinate plot sampler", () => {
  it("adaptively samples and clips a smooth function", () => {
    const sample = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("x^2", "explicit-function"),
    });

    expect(sample.stopReason).toBeNull();
    expect(sample.segments).toHaveLength(1);
    expect(sample.metrics.pointCount).toBeGreaterThan(20);
    expect(sample.metrics.refinementCount).toBeGreaterThan(0);
    expectClipped(sample, pixelSize.width, pixelSize.height);
  });

  it("adds more detail for oscillating geometry", () => {
    const line = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("x", "explicit-function"),
    });
    const wave = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("sin(8*x)", "explicit-function"),
    });

    expect(wave.metrics.pointCount).toBeGreaterThan(line.metrics.pointCount);
  });

  it("splits reciprocal and tangent discontinuities", () => {
    const reciprocal = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("1/x", "explicit-function"),
    });
    const tangent = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("tan(x)", "explicit-function"),
    });

    expect(reciprocal.segments.length).toBeGreaterThanOrEqual(2);
    expect(
      reciprocal.metrics.undefinedCounts["division-by-zero"],
    ).toBeGreaterThan(0);
    expect(
      reciprocal.segments.every((segment) => {
        const xs = segment.map(({ x }) => x - pixelSize.width / 2);
        return xs.every((x) => x <= 1e-6) || xs.every((x) => x >= -1e-6);
      }),
    ).toBe(true);
    expect(tangent.segments.length).toBeGreaterThanOrEqual(3);
    expectClipped(reciprocal, pixelSize.width, pixelSize.height);
    expectClipped(tangent, pixelSize.width, pixelSize.height);
  });

  it("enforces point and evaluation budgets", () => {
    const pointLimited = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("sin(8*x)", "explicit-function"),
      options: { pointLimit: 24, tolerancePixels: 0.1 },
    });
    const evaluationLimited = sampleExplicitSeries({
      ...common,
      domain: { max: 5, min: -5 },
      expression: compile("sin(8*x)", "explicit-function"),
      options: { maximumEvaluations: 20, tolerancePixels: 0.1 },
    });

    expect(pointLimited.stopReason).toBe("point-limit");
    expect(pointLimited.metrics.pointCount).toBeLessThanOrEqual(24);
    expect(evaluationLimited.stopReason).toBe("evaluation-limit");
    expect(evaluationLimited.metrics.evaluationCount).toBeLessThanOrEqual(20);
  });
});
