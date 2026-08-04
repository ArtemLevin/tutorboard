import { describe, expect, it } from "vitest";

import {
  buildCachedSmoothClosedStrokePoints,
  buildCachedSmoothStrokePoints,
  buildSmoothClosedStrokePoints,
  buildSmoothStrokePoints,
  distance,
  resolveStrokeSmoothingQuality,
  type StrokePoint,
} from "../../../src/shared/stroke-smoothing";

function maximumScreenSegment(
  points: readonly StrokePoint[],
  zoom: number,
): number {
  let maximum = 0;
  for (let index = 1; index < points.length; index += 1) {
    maximum = Math.max(
      maximum,
      distance(points[index - 1]!, points[index]!) * zoom,
    );
  }
  return maximum;
}

function containsPoint(
  points: readonly StrokePoint[],
  target: StrokePoint,
  tolerance = 1e-8,
): boolean {
  return points.some((point) => distance(point, target) <= tolerance);
}

function expectFiniteStroke(points: readonly StrokePoint[]): void {
  expect(points.length).toBeGreaterThan(2);
  expect(
    points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  ).toBe(true);
}

const fastCircle: readonly StrokePoint[] = [
  { x: 0, y: -60 },
  { x: 36, y: -50 },
  { x: 57, y: -22 },
  { x: 59, y: 18 },
  { x: 39, y: 48 },
  { x: 3, y: 61 },
  { x: -35, y: 50 },
  { x: -57, y: 20 },
  { x: -58, y: -18 },
  { x: -37, y: -49 },
  { x: 0, y: -60 },
];

const letterS: readonly StrokePoint[] = [
  { x: 52, y: -58 },
  { x: 18, y: -70 },
  { x: -23, y: -62 },
  { x: -48, y: -38 },
  { x: -36, y: -12 },
  { x: -4, y: 0 },
  { x: 31, y: 11 },
  { x: 48, y: 36 },
  { x: 28, y: 61 },
  { x: -12, y: 70 },
  { x: -49, y: 57 },
];

const letterM: readonly StrokePoint[] = [
  { x: -58, y: 65 },
  { x: -58, y: -65 },
  { x: 0, y: 18 },
  { x: 58, y: -65 },
  { x: 58, y: 65 },
];

const letterZhe: readonly StrokePoint[] = [
  { x: -70, y: -58 },
  { x: 0, y: 0 },
  { x: -70, y: 58 },
  { x: 0, y: 0 },
  { x: 0, y: -70 },
  { x: 0, y: 70 },
  { x: 0, y: 0 },
  { x: 70, y: -58 },
  { x: 0, y: 0 },
  { x: 70, y: 58 },
];

const digitEight: readonly StrokePoint[] = Array.from(
  { length: 25 },
  (_value, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return {
      x: Math.sin(angle) * 48,
      y: Math.sin(angle * 2) * 62,
    };
  },
);

describe("stroke input fidelity", () => {
  it("uses screen-space tolerances that retain more detail when zoomed", () => {
    const low = resolveStrokeSmoothingQuality(letterS, { zoom: 1 });
    const high = resolveStrokeSmoothingQuality(letterS, { zoom: 8 });
    expect(high.minPointDistance).toBeLessThan(low.minPointDistance);
    expect(high.simplificationTolerance).toBeLessThan(
      low.simplificationTolerance,
    );
    expect(high.targetSegmentLength).toBeLessThan(low.targetSegmentLength);

    const lowStroke = buildSmoothStrokePoints(letterS, { zoom: 1 });
    const highStroke = buildSmoothStrokePoints(letterS, { zoom: 8 });
    expect(highStroke.length).toBeGreaterThan(lowStroke.length);
    expect(maximumScreenSegment(highStroke, 8)).toBeLessThan(4);
  });

  it("smooths a fast closed circle without a visible closing chord", () => {
    const smoothed = buildSmoothClosedStrokePoints(fastCircle, { zoom: 4 });
    expectFiniteStroke(smoothed);
    expect(smoothed[0]).toEqual(smoothed.at(-1));
    expect(maximumScreenSegment(smoothed, 4)).toBeLessThan(4);
    expect(smoothed.length).toBeGreaterThan(fastCircle.length);
  });

  it.each([
    ["S", letterS],
    ["M", letterM],
    ["Ж", letterZhe],
  ] as const)("keeps the %s glyph continuous and preserves its endpoints", (
    _name,
    points,
  ) => {
    const smoothed = buildSmoothStrokePoints(points, { zoom: 4 });
    expectFiniteStroke(smoothed);
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed.at(-1)).toEqual(points.at(-1));
    expect(maximumScreenSegment(smoothed, 4)).toBeLessThan(4);
  });

  it("preserves the sharp vertices of M and the central join of Ж", () => {
    const smoothedM = buildSmoothStrokePoints(letterM, { zoom: 4 });
    for (const vertex of letterM) {
      expect(containsPoint(smoothedM, vertex)).toBe(true);
    }

    const smoothedZhe = buildSmoothStrokePoints(letterZhe, { zoom: 4 });
    expect(containsPoint(smoothedZhe, { x: 0, y: 0 })).toBe(true);
    for (const outerVertex of [
      letterZhe[0]!,
      letterZhe[2]!,
      letterZhe[4]!,
      letterZhe[5]!,
      letterZhe[7]!,
      letterZhe[9]!,
    ]) {
      expect(containsPoint(smoothedZhe, outerVertex)).toBe(true);
    }
  });

  it("smooths a closed handwritten 8 while preserving its crossing", () => {
    const smoothed = buildSmoothClosedStrokePoints(digitEight, { zoom: 4 });
    expectFiniteStroke(smoothed);
    expect(smoothed[0]).toEqual(smoothed.at(-1));
    expect(maximumScreenSegment(smoothed, 4)).toBeLessThan(4);
    expect(
      smoothed.some((point) => Math.hypot(point.x, point.y) < 1),
    ).toBe(true);
  });

  it("caches open and closed render paths independently per zoom bucket", () => {
    const open = buildCachedSmoothStrokePoints(letterS, 4);
    expect(buildCachedSmoothStrokePoints(letterS, 4)).toBe(open);
    expect(buildCachedSmoothStrokePoints(letterS, 8)).not.toBe(open);

    const closed = buildCachedSmoothClosedStrokePoints(fastCircle, 4);
    expect(buildCachedSmoothClosedStrokePoints(fastCircle, 4)).toBe(closed);
    expect(buildCachedSmoothClosedStrokePoints(fastCircle, 8)).not.toBe(closed);
  });
});
