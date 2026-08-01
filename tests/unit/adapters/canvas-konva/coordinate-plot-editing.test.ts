import { describe, expect, it } from "vitest";

import {
  panCoordinatePlotViewport,
  zoomCoordinatePlotViewportAt,
} from "../../../../src/adapters/canvas-konva/coordinate-plot-editing";

const viewport = {
  equalScale: true,
  xMax: 10,
  xMin: -10,
  yMax: 5,
  yMin: -5,
} as const;
const size = { height: 400, width: 800 } as const;

describe("coordinate plot viewport gestures", () => {
  it("pans in data units while the graph follows the pointer", () => {
    const moved = panCoordinatePlotViewport(viewport, size, { x: 80, y: 40 });

    expect(moved.xMin).toBe(-12);
    expect(moved.xMax).toBe(8);
    expect(moved.yMin).toBe(-4);
    expect(moved.yMax).toBe(6);
  });

  it("zooms around the cursor anchor", () => {
    const zoomed = zoomCoordinatePlotViewportAt(
      viewport,
      size,
      { x: 200, y: 100 },
      0.5,
    );

    expect(zoomed.xMin).toBeCloseTo(-7.5, 12);
    expect(zoomed.xMax).toBeCloseTo(2.5, 12);
    expect(zoomed.yMin).toBeCloseTo(-1.25, 12);
    expect(zoomed.yMax).toBeCloseTo(3.75, 12);
    expect(zoomed.equalScale).toBe(true);
  });

  it("supports axis-specific zoom and releases equal-scale locking", () => {
    const horizontal = zoomCoordinatePlotViewportAt(
      viewport,
      size,
      { x: 400, y: 200 },
      0.5,
      "x",
    );
    const vertical = zoomCoordinatePlotViewportAt(
      viewport,
      size,
      { x: 400, y: 200 },
      2,
      "y",
    );

    expect(horizontal.xMax - horizontal.xMin).toBe(10);
    expect(horizontal.yMax - horizontal.yMin).toBe(10);
    expect(horizontal.equalScale).toBe(false);
    expect(vertical.xMax - vertical.xMin).toBe(20);
    expect(vertical.yMax - vertical.yMin).toBe(20);
    expect(vertical.equalScale).toBe(false);
  });

  it("ignores malformed gesture inputs", () => {
    expect(
      panCoordinatePlotViewport(
        viewport,
        { height: 0, width: 800 },
        { x: 1, y: 1 },
      ),
    ).toBe(viewport);
    expect(
      zoomCoordinatePlotViewportAt(viewport, size, { x: 1, y: 1 }, Number.NaN),
    ).toBe(viewport);
  });
});
