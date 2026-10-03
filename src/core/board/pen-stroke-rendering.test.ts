import { describe, expect, it } from "vitest";

import { createVectorInkData } from "./vector-ink";
import {
  createPenStrokeRenderBounds,
  createPenStrokeRenderPaths,
  strokeStyleOpacityMultiplier,
} from "./pen-stroke-rendering";

function lineInk() {
  return createVectorInkData([
    {
      point: { x: 0, y: 0 },
      pressure: 0.3,
      timestampMs: 0,
    },
    {
      point: { x: 90, y: 0 },
      pressure: 0.8,
      timestampMs: 8,
    },
    {
      point: { x: 180, y: 0 },
      pressure: 0.4,
      timestampMs: 16,
    },
  ]);
}

describe("styled pen stroke rendering", () => {
  it("keeps thin and thick geometry width-driven", () => {
    const ink = lineInk();
    expect(createPenStrokeRenderPaths(ink, "thin", 2)).toEqual(
      createPenStrokeRenderPaths(ink, "thick", 2),
    );
    expect(createPenStrokeRenderPaths(ink, "thin", 1)).not.toEqual(
      createPenStrokeRenderPaths(ink, "thin", 4),
    );
  });

  it("materializes dashed and dash-dot gaps as bounded path sets", () => {
    const ink = lineInk();
    const dashed = createPenStrokeRenderPaths(ink, "dashed", 3);
    const dashDot = createPenStrokeRenderPaths(ink, "dash-dot", 3);

    expect(dashed).toHaveLength(1);
    expect(dashDot).toHaveLength(1);
    expect((dashed[0]?.data.match(/M /gu) ?? []).length).toBeGreaterThan(2);
    expect((dashDot[0]?.data.match(/M /gu) ?? []).length).toBeGreaterThan(2);
    expect(dashed[0]?.data).not.toBe(dashDot[0]?.data);
  });

  it("creates a real wave even for a two-sample straight stroke", () => {
    const ink = createVectorInkData([
      { point: { x: 0, y: 0 }, pressure: 0.5, timestampMs: 0 },
      { point: { x: 180, y: 0 }, pressure: 0.5, timestampMs: 16 },
    ]);
    const solid = createPenStrokeRenderPaths(ink, "thin", 3);
    const wavy = createPenStrokeRenderPaths(ink, "wavy", 3);

    expect(wavy).toHaveLength(1);
    expect(wavy[0]?.data).not.toBe(solid[0]?.data);
    expect(wavy[0]?.data).toMatch(/[1-9][0-9]*\.[0-9]+/u);
  });

  it("keeps hand-drawn styles deterministic and bounded", () => {
    const ink = lineInk();
    const pencil = createPenStrokeRenderPaths(ink, "hand-pencil", 4);
    const pencilAgain = createPenStrokeRenderPaths(ink, "hand-pencil", 4);
    const pen = createPenStrokeRenderPaths(ink, "hand-pen", 4);

    expect(pencil).toEqual(pencilAgain);
    expect(pencil).toHaveLength(3);
    expect(pen).toHaveLength(2);
    expect(pencil[0]?.data).not.toBe(pen[0]?.data);
  });

  it("preserves marker opacity semantics without altering geometry width", () => {
    const ink = lineInk();
    const marker = createPenStrokeRenderPaths(ink, "marker", 3);
    const solid = createPenStrokeRenderPaths(ink, "thin", 3);

    expect(marker[0]?.data).toBe(solid[0]?.data);
    expect(marker[0]?.opacityMultiplier).toBe(0.38);
    expect(strokeStyleOpacityMultiplier("marker")).toBe(0.38);
    expect(strokeStyleOpacityMultiplier("wavy")).toBe(1);
  });

  it("keeps closed stylized strokes finite and deterministic", () => {
    const ink = createVectorInkData(
      [
        { point: { x: 0, y: 0 }, pressure: 0.5, timestampMs: 0 },
        { point: { x: 80, y: 0 }, pressure: 0.6, timestampMs: 8 },
        { point: { x: 40, y: 70 }, pressure: 0.7, timestampMs: 16 },
        { point: { x: 0, y: 0 }, pressure: 0.5, timestampMs: 24 },
      ],
      true,
    );

    for (const style of ["wavy", "hand-pencil", "hand-pen"] as const) {
      const first = createPenStrokeRenderPaths(ink, style, 3);
      const second = createPenStrokeRenderPaths(ink, style, 3);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(0);
      expect(first.every(({ data }) => !data.includes("NaN"))).toBe(true);
    }
  });

  it("derives deterministic bounds for every stylized pen geometry", () => {
    const ink = lineInk();

    for (const style of [
      "dashed",
      "dash-dot",
      "wavy",
      "hand-pencil",
      "hand-pen",
      "marker",
    ] as const) {
      const first = createPenStrokeRenderBounds(ink, style, 6);
      const second = createPenStrokeRenderBounds(ink, style, 6);
      expect(first).toEqual(second);
      expect(first).not.toBeNull();
    }
  });

  it("keeps canonical single-sample taps visible and bounded", () => {
    const ink = createVectorInkData([
      { point: { x: 12, y: 18 }, pressure: 0.8, timestampMs: 0 },
    ]);

    const paths = createPenStrokeRenderPaths(ink, "thin", 10);
    const bounds = createPenStrokeRenderBounds(ink, "thin", 10);

    expect(paths).toHaveLength(1);
    expect(paths[0]?.data).toContain("A ");
    expect(bounds?.bottom).toBeCloseTo(23.35, 10);
    expect(bounds?.left).toBeCloseTo(6.65, 10);
    expect(bounds?.right).toBeCloseTo(17.35, 10);
    expect(bounds?.top).toBeCloseTo(12.65, 10);
  });

  it("returns no path for zero width", () => {
    expect(createPenStrokeRenderPaths(lineInk(), "wavy", 0)).toEqual([]);
  });
});
