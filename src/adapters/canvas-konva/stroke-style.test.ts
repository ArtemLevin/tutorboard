import { describe, expect, it } from "vitest";
import {
  createHandDrawnSegment,
  createWavySegment,
  resolveStrokeStyle,
} from "./stroke-style";

describe("stroke styles", () => {
  it("resolves the seven public styles", () => {
    expect(resolveStrokeStyle("thin", 4).strokeWidth).toBe(2);
    expect(resolveStrokeStyle("thick", 2).strokeWidth).toBe(6);
    expect(resolveStrokeStyle("dashed", 3).dash).toEqual([12, 8]);
    expect(resolveStrokeStyle("dash-dot", 3).dash).toEqual([14, 6, 2, 6]);
    expect(resolveStrokeStyle("wavy", 3).strokeWidth).toBe(3);
    expect(resolveStrokeStyle("hand-pencil", 2).opacityMultiplier).toBeLessThan(
      1,
    );
    expect(
      resolveStrokeStyle("hand-pen", 2).strokeWidth,
    ).toBeGreaterThanOrEqual(2.5);
  });

  it("creates deterministic custom segments", () => {
    expect(createWavySegment({ x: 120, y: 0 })).toEqual(
      createWavySegment({ x: 120, y: 0 }),
    );
    expect(createHandDrawnSegment({ x: 120, y: 20 }, 2)).toEqual(
      createHandDrawnSegment({ x: 120, y: 20 }, 2),
    );
  });
});
