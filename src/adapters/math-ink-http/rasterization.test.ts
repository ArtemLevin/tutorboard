import { describe, expect, it } from "vitest";

import { calculateMathInkRasterLayout } from "./rasterization";

describe("formula ink raster layout", () => {
  it("preserves a wide formula aspect ratio inside fixed bounds", () => {
    const layout = calculateMathInkRasterLayout(1, 0.25);
    expect(layout.width).toBe(768);
    expect(layout.height).toBeLessThan(layout.width);
    expect(layout.contentWidth).toBe(720);
    expect(layout.padding).toBe(24);
  });

  it("keeps narrow dimensions large enough for OCR", () => {
    const layout = calculateMathInkRasterLayout(0, 0);
    expect(layout.contentWidth).toBeGreaterThanOrEqual(96);
    expect(layout.contentHeight).toBeGreaterThanOrEqual(96);
    expect(layout.width).toBeLessThanOrEqual(768);
    expect(layout.height).toBeLessThanOrEqual(768);
  });
});
