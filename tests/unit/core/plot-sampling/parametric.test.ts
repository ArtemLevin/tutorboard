import { describe, expect, it } from "vitest";

import { sampleParametricSeries } from "../../../../src/core/plot-sampling/public";
import { compile, expectClipped } from "./helpers";

const viewport = { xMax: 5, xMin: -5, yMax: 5, yMin: -5 };
const pixelSize = { height: 420, width: 640 };
const common = {
  boardZoom: 1,
  closed: false,
  parameters: {},
  pixelSize,
  viewport,
};

describe("parametric coordinate plot sampler", () => {
  it("samples and closes a circle", () => {
    const sample = sampleParametricSeries({
      ...common,
      closed: true,
      range: { max: 2 * Math.PI, min: 0 },
      xExpression: compile("3*cos(t)", "parametric-x"),
      yExpression: compile("3*sin(t)", "parametric-y"),
    });

    expect(sample.stopReason).toBeNull();
    expect(sample.segments).toHaveLength(1);
    const segment = sample.segments[0]!;
    expect(segment.length).toBeGreaterThan(24);
    expect(segment[0]!.x).toBeCloseTo(segment.at(-1)!.x, 8);
    expect(segment[0]!.y).toBeCloseTo(segment.at(-1)!.y, 8);
    expectClipped(sample, pixelSize.width, pixelSize.height);
  });

  it("refines loops and sharp turns more densely", () => {
    const circle = sampleParametricSeries({
      ...common,
      closed: true,
      range: { max: 2 * Math.PI, min: 0 },
      xExpression: compile("cos(t)", "parametric-x"),
      yExpression: compile("sin(t)", "parametric-y"),
    });
    const lissajous = sampleParametricSeries({
      ...common,
      closed: true,
      range: { max: 2 * Math.PI, min: 0 },
      xExpression: compile("sin(3*t)", "parametric-x"),
      yExpression: compile("sin(4*t)", "parametric-y"),
    });

    expect(lissajous.metrics.pointCount).toBeGreaterThan(
      circle.metrics.pointCount,
    );
    expect(lissajous.metrics.refinementCount).toBeGreaterThan(
      circle.metrics.refinementCount,
    );
  });

  it("keeps valid fragments when part of the range is undefined", () => {
    const sample = sampleParametricSeries({
      ...common,
      range: { max: 2, min: -2 },
      xExpression: compile("t", "parametric-x"),
      yExpression: compile("sqrt(1-t^2)", "parametric-y"),
    });

    expect(sample.segments.length).toBeGreaterThanOrEqual(1);
    expect(sample.metrics.undefinedCounts.domain).toBeGreaterThan(0);
    expectClipped(sample, pixelSize.width, pixelSize.height);
  });

  it("honors cancellation without emitting an unbounded partial result", () => {
    const sample = sampleParametricSeries({
      ...common,
      range: { max: 2 * Math.PI, min: 0 },
      signal: { aborted: true },
      xExpression: compile("sin(3*t)", "parametric-x"),
      yExpression: compile("sin(4*t)", "parametric-y"),
    });

    expect(sample.stopReason).toBe("aborted");
    expect(sample.metrics.pointCount).toBe(0);
  });
});
