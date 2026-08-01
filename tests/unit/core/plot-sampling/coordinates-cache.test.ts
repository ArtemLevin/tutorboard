import { describe, expect, it } from "vitest";

import {
  clipPlotEdgeToPixelRect,
  createPlotSamplingCache,
  createPlotSamplingCacheKey,
  plotDataToLocalPoint,
  plotLocalToDataPoint,
} from "../../../../src/core/plot-sampling/public";

const viewport = { xMax: 10, xMin: -10, yMax: 5, yMin: -5 };
const pixelSize = { height: 400, width: 800 };

describe("coordinate plot transforms, clipping and cache", () => {
  it("round-trips data and local pixel coordinates", () => {
    const data = { x: 2.5, y: -1.25 };
    const local = plotDataToLocalPoint(data, viewport, pixelSize);
    const restored = plotLocalToDataPoint(local, viewport, pixelSize);

    expect(restored.x).toBeCloseTo(data.x, 12);
    expect(restored.y).toBeCloseTo(data.y, 12);
  });

  it("clips crossing edges and rejects fully external edges", () => {
    expect(
      clipPlotEdgeToPixelRect(
        { x: -100, y: 200 },
        { x: 900, y: 200 },
        pixelSize,
      ),
    ).toEqual({
      end: { x: 800, y: 200 },
      start: { x: 0, y: 200 },
    });
    expect(
      clipPlotEdgeToPixelRect(
        { x: -100, y: -20 },
        { x: 900, y: -20 },
        pixelSize,
      ),
    ).toBeNull();
  });

  it("canonicalizes cache keys and evicts least-recently-used entries", () => {
    expect(createPlotSamplingCacheKey({ a: 1, b: 2 })).toBe(
      createPlotSamplingCacheKey({ b: 2, a: 1 }),
    );

    const cache = createPlotSamplingCache(2);
    const sample = {
      dataBounds: null,
      metrics: {
        breakCount: 0,
        clippedEdgeCount: 0,
        evaluationCount: 0,
        pointCount: 0,
        refinementCount: 0,
        undefinedCounts: {
          "division-by-zero": 0,
          domain: 0,
          "non-finite": 0,
        },
      },
      missingBindings: [],
      segments: [],
      stopReason: null,
      truncated: false,
    } as const;
    cache.set("one", sample);
    cache.set("two", sample);
    expect(cache.get("one")).toBe(sample);
    cache.set("three", sample);

    expect(cache.get("two")).toBeUndefined();
    expect(cache.get("one")).toBe(sample);
    expect(cache.get("three")).toBe(sample);

    const defaulted = createPlotSamplingCache(Number.NaN);
    for (let index = 0; index < 80; index += 1) {
      defaulted.set(`entry-${index}`, sample);
    }
    expect(defaulted.size).toBe(64);
  });
});
