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
  it.each([
    "thin",
    "thick",
    "dashed",
    "dash-dot",
    "wavy",
    "hand-pencil",
    "hand-pen",
    "marker",
  ] as const)("keeps strokeWidth authoritative for %s", (style) => {
    expect(resolveStrokeStyle(style, 0.5).strokeWidth).toBe(0.5);
    expect(resolveStrokeStyle(style, 8).strokeWidth).toBe(8);
  });

  it("keeps visual style metadata independent from numeric width", () => {
    expect(resolveStrokeStyle("dashed", 3).dash).toEqual([12, 8]);
    expect(resolveStrokeStyle("dash-dot", 3).dash).toEqual([14, 6, 2, 6]);
    expect(resolveStrokeStyle("marker", 3)).toMatchObject({
      lineCap: "square",
      opacityMultiplier: 0.38,
      strokeWidth: 3,
    });
  });

  it("scales sketch passes proportionally to the selected width", () => {
    expect(resolveSketchPasses("hand-pencil", 0.5).map((pass) => pass.strokeWidth))
      .toEqual([0.325, 0.225, 0.14]);
    expect(resolveSketchPasses("hand-pen", 0.5).map((pass) => pass.strokeWidth))
      .toEqual([0.5, 0.175]);
    expect(resolveSketchPasses("hand-pencil", 4).map((pass) => pass.strokeWidth))
      .toEqual([2.6, 1.8, 1.12]);
    expect(resolveSketchPasses("hand-pen", 4).map((pass) => pass.strokeWidth))
      .toEqual([4, 1.4]);
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
