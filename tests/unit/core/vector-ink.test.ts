import { describe, expect, it } from "vitest";

import {
  createVectorInkData,
  createVectorInkDataFromPoints,
  defaultVectorInkPressure,
  vectorInkCenterlinePathData,
  vectorInkDataMatchesPoints,
  vectorInkOutlinePathData,
} from "../../../src/core/public";

describe("Vector Ink 1.0", () => {
  it("creates a deterministic cubic centerline for legacy points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
      { x: 40, y: 0 },
    ];
    const ink = createVectorInkDataFromPoints(points);
    expect(ink.version).toBe("1.0");
    expect(ink.samples).toHaveLength(points.length);
    expect(ink.samples.every(({ pressure }) => pressure === defaultVectorInkPressure)).toBe(true);
    expect(ink.centerline).toHaveLength(2);
    expect(vectorInkDataMatchesPoints(ink, points)).toBe(true);
    expect(vectorInkCenterlinePathData(ink)).toMatch(/^M .* C .* C /u);
  });

  it("turns pressure into a bounded variable-width outline", () => {
    const ink = createVectorInkData([
      { point: { x: 0, y: 0 }, pressure: 0.1, timestampMs: 0 },
      { point: { x: 40, y: 10 }, pressure: 0.55, timestampMs: 8 },
      { point: { x: 80, y: 0 }, pressure: 1, timestampMs: 16 },
    ]);
    const outline = vectorInkOutlinePathData(ink, 10);
    expect(outline).toMatch(/^M /u);
    expect(outline.endsWith("Z")).toBe(true);
    expect(outline).not.toContain("NaN");
    expect(outline).not.toContain("Infinity");
  });

  it("preserves a closed centerline", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 15, y: 25 },
      { x: 0, y: 0 },
    ];
    const ink = createVectorInkDataFromPoints(points);
    expect(ink.closed).toBe(true);
    expect(ink.centerline).toHaveLength(3);
    expect(vectorInkCenterlinePathData(ink).endsWith("Z")).toBe(true);
    expect(vectorInkDataMatchesPoints(ink, points)).toBe(true);
  });
});
