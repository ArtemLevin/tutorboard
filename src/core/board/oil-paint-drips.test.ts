import { describe, expect, it } from "vitest";

import { createOilPaintDrips } from "./oil-paint-drips";
import { createVectorInkData } from "./vector-ink";

function stroke(length: number, pressure = 0.8, duration = 300) {
  return createVectorInkData([
    {
      point: { x: 0, y: 0 },
      pressure,
      timestampMs: 0,
    },
    {
      point: { x: length, y: 0 },
      pressure,
      timestampMs: duration,
    },
  ]);
}

describe("heavy oil paint gravity runs", () => {
  it("adds closed, downward drops to a thick loaded swipe", () => {
    const first = createOilPaintDrips(stroke(250), 18);
    const second = createOilPaintDrips(stroke(250), 18);
    expect(first).toEqual(second);
    expect(first.data).toContain(" C ");
    expect(first.data).toContain(" Z");
    expect(first.bounds?.bottom).toBeGreaterThan(18);
    expect(first.bounds?.top).toBeGreaterThan(0);
    expect(first.data).not.toMatch(/NaN|Infinity/u);
  });

  it("keeps slower and more heavily loaded paint sagging further", () => {
    const loaded = createOilPaintDrips(stroke(250, 0.9, 600), 18);
    const light = createOilPaintDrips(stroke(250, 0.25, 20), 18);
    expect(loaded.bounds?.bottom).toBeGreaterThan(light.bounds?.bottom ?? 0);
  });

  it("respects eraser fragment distance phase", () => {
    const original = createOilPaintDrips(stroke(240, 0.8, 240), 18, {
      continuousStylePhase: true,
    });
    const first = createOilPaintDrips(stroke(100, 0.8, 100), 18, {
      continuousStylePhase: true,
    });
    const fragment = createVectorInkData([
      {
        point: { x: 100, y: 0 },
        pressure: 0.8,
        timestampMs: 100,
      },
      {
        point: { x: 240, y: 0 },
        pressure: 0.8,
        timestampMs: 240,
      },
    ]);
    const second = createOilPaintDrips(fragment, 18, {
      continuousStylePhase: true,
      distanceOffset: 100,
    });
    const combined = [first.data, second.data].filter(Boolean).join(" ");
    expect(combined).toBe(original.data);
  });

  it("caps droplet geometry and ignores tiny or closed strokes", () => {
    const long = createOilPaintDrips(stroke(100_000, 0.85, 40_000), 18);
    const marks = long.data.match(/M /gu) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThanOrEqual(16);
    expect(createOilPaintDrips(stroke(250), 2).data).toBe("");
    const loop = createVectorInkData(
      [
        { point: { x: 0, y: 0 }, pressure: 0.8, timestampMs: 0 },
        { point: { x: 100, y: 0 }, pressure: 0.8, timestampMs: 50 },
        { point: { x: 0, y: 0 }, pressure: 0.8, timestampMs: 100 },
      ],
      true,
    );
    expect(createOilPaintDrips(loop, 18).bounds).toBeNull();
  });
});
