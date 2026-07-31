import { describe, expect, it } from "vitest";
import {
  createEllipseContour,
  createHandDrawnSegment,
  createRectangleContour,
  createSketchPath,
  createWavySegment,
  resolveSketchPasses,
  resolveStrokeStyle,
} from "./stroke-style";

describe("stroke styles", () => {
  it("resolves the eight public styles", () => {
    expect(resolveStrokeStyle("thin", 4).strokeWidth).toBe(2);
    expect(resolveStrokeStyle("thick", 2).strokeWidth).toBe(6);
    expect(resolveStrokeStyle("dashed", 3).dash).toEqual([12, 8]);
    expect(resolveStrokeStyle("dash-dot", 3).dash).toEqual([14, 6, 2, 6]);
    expect(resolveStrokeStyle("wavy", 3).strokeWidth).toBe(3);
    expect(resolveSketchPasses("hand-pencil", 2)).toHaveLength(3);
    expect(resolveSketchPasses("hand-pen", 2)).toHaveLength(2);
    expect(resolveStrokeStyle("marker", 2)).toMatchObject({
      lineCap: "square",
      opacityMultiplier: 0.38,
      strokeWidth: 10,
    });
  });

  it("creates deterministic sketchbook paths", () => {
    expect(createWavySegment({ x: 120, y: 0 })).toEqual(
      createWavySegment({ x: 120, y: 0 }),
    );
    expect(createHandDrawnSegment({ x: 120, y: 20 }, 2, 11)).toEqual(
      createHandDrawnSegment({ x: 120, y: 20 }, 2, 11),
    );
    const rectangle = createRectangleContour({ height: 80, width: 120 });
    expect(createSketchPath(rectangle, 2.8, 11, true)).toEqual(
      createSketchPath(rectangle, 2.8, 11, true),
    );
    const ellipse = createEllipseContour({ x: 60, y: 40 });
    expect(ellipse.length).toBeGreaterThanOrEqual(36);
    expect(createSketchPath(ellipse, 1.15, 7, true)).toEqual(
      createSketchPath(ellipse, 1.15, 7, true),
    );
  });
});
