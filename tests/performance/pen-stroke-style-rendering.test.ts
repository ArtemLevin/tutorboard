import { describe, expect, it } from "vitest";

import { createVectorInkData, type StrokeStyle } from "../../src/core/public";
import { createPenStrokeRenderPaths } from "../../src/shared/pen-stroke-rendering";

describe("styled pen stroke performance budget", () => {
  it("materializes long stylized strokes with bounded path-node counts", () => {
    const samples = Array.from({ length: 2_000 }, (_value, index) => ({
      point: {
        x: index * 1.5,
        y: Math.sin(index / 18) * 40 + Math.cos(index / 47) * 12,
      },
      pressure: 0.35 + ((index % 37) / 36) * 0.55,
      timestampMs: index * 4,
    }));
    const ink = createVectorInkData(samples);
    const styles = [
      "dashed",
      "dash-dot",
      "wavy",
      "hand-pencil",
      "hand-pen",
    ] as const satisfies readonly StrokeStyle[];

    const startedAt = performance.now();
    const results = styles.map((style) => ({
      paths: createPenStrokeRenderPaths(ink, style, 3),
      style,
    }));
    const elapsedMs = performance.now() - startedAt;

    for (const { paths, style } of results) {
      expect(paths.length, style).toBeGreaterThan(0);
      expect(paths.length, style).toBeLessThanOrEqual(3);
      expect(
        paths.every(({ data }) => data.length > 0),
        style,
      ).toBe(true);
    }
    expect(elapsedMs).toBeLessThan(750);
  });
});
