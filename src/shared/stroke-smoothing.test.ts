import { describe, expect, it } from "vitest";

import {
  buildCachedSmoothStrokePoints,
  buildCatmullRomSpline,
  buildClosedCatmullRomSpline,
  buildSmoothClosedStrokePoints,
  buildSmoothStrokePoints,
  normalizeStrokePoints,
  pathLength,
  resolveStrokeSmoothingQuality,
} from "./stroke-smoothing";

const sample = [
  { x: 0, y: 0 },
  { x: 20, y: 24 },
  { x: 48, y: 8 },
  { x: 80, y: 32 },
  { x: 120, y: 4 },
] as const;

describe("stroke smoothing", () => {
  it("removes invalid, duplicate and near-duplicate points", () => {
    const result = normalizeStrokePoints(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 },
        { x: Number.NaN, y: 4 },
        { x: 10, y: 0 },
      ],
      {
        minPointDistance: 0.5,
        targetSegmentLength: 20,
      },
    );
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("inserts points into long segments while preserving endpoints", () => {
    const result = normalizeStrokePoints(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      {
        maxInsertedPointsPerSegment: 20,
        minPointDistance: 0,
        targetSegmentLength: 5,
      },
    );
    expect(result.length).toBeGreaterThan(2);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result.at(-1)).toEqual({ x: 40, y: 0 });
  });

  it("builds a finite deterministic Catmull-Rom spline", () => {
    const first = buildCatmullRomSpline(sample, { subdivisions: 6 });
    const second = buildCatmullRomSpline(sample, { subdivisions: 6 });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(sample.length);
    expect(first[0]).toEqual(sample[0]);
    expect(first.at(-1)).toEqual(sample.at(-1));
    expect(
      first.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
    ).toBe(true);
  });

  it("raises detail for high zoom and long strokes", () => {
    const low = resolveStrokeSmoothingQuality(sample, { zoom: 1 });
    const high = resolveStrokeSmoothingQuality(sample, { zoom: 8 });
    expect(high.subdivisions).toBeGreaterThan(low.subdivisions);
    expect(high.targetSegmentLength).toBeLessThan(low.targetSegmentLength);
    expect(high.minPointDistance).toBeLessThan(low.minPointDistance);

    const lowPoints = buildSmoothStrokePoints(sample, { zoom: 1 });
    const highPoints = buildSmoothStrokePoints(sample, { zoom: 8 });
    expect(highPoints.length).toBeGreaterThan(lowPoints.length);
    expect(pathLength(highPoints)).toBeGreaterThan(0);
  });

  it("caps pathological input and reuses zoom-bucket cache entries", () => {
    const points = Array.from({ length: 30_000 }, (_, index) => ({
      x: index * 0.2,
      y: Math.sin(index / 20) * 12,
    }));
    const result = buildSmoothStrokePoints(points, {
      maxOutputPoints: 4_000,
      zoom: 8,
    });
    expect(result.length).toBeLessThanOrEqual(4_000);

    const first = buildCachedSmoothStrokePoints(points, 3.01);
    const second = buildCachedSmoothStrokePoints(points, 3.1);
    expect(second).toBe(first);
  });

  it("builds a smooth periodic loop with a continuous seam", () => {
    const loop = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 80, y: 30 },
      { x: 60, y: 60 },
      { x: 0, y: 60 },
      { x: -20, y: 30 },
      { x: 0, y: 0 },
    ] as const;
    const direct = buildClosedCatmullRomSpline(loop, {
      subdivisions: 6,
    });
    const result = buildSmoothClosedStrokePoints(loop, {
      maxOutputPoints: 2_000,
      zoom: 1,
    });
    expect(direct[0]).toEqual(direct.at(-1));
    expect(result[0]).toEqual(result.at(-1));
    expect(result.length).toBeGreaterThan(loop.length);
    expect(
      result.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
    ).toBe(true);

    const before = result.at(-2)!;
    const seam = result[0]!;
    const after = result[1]!;
    const incoming = { x: seam.x - before.x, y: seam.y - before.y };
    const outgoing = { x: after.x - seam.x, y: after.y - seam.y };
    const cosine =
      (incoming.x * outgoing.x + incoming.y * outgoing.y) /
      (Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y));
    expect(cosine).toBeGreaterThan(0.85);
  });
});
