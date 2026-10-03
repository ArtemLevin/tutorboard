import { describe, expect, it } from "vitest";

import { createVectorInkData } from "../core/public";
import {
  createPenStrokeRenderPaths,
  penStrokeOpacityMultiplier,
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
    expect(penStrokeOpacityMultiplier("marker")).toBe(0.38);
    expect(penStrokeOpacityMultiplier("wavy")).toBe(1);
  });

  it("returns no path for zero width", () => {
    expect(createPenStrokeRenderPaths(lineInk(), "wavy", 0)).toEqual([]);
  });
});
