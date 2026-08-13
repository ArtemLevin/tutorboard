import { describe, expect, it } from "vitest";

import { recognizeSmartInkStroke } from "../../../../src/modules/smart-ink-spike/public";
import { nearSquareStroke, positiveStrokes } from "./corpus-fixtures";

describe("Phase 9 Smart Ink geometric recognizer spike", () => {
  for (const kind of [
    "line",
    "circle",
    "ellipse",
    "rectangle",
    "square",
    "triangle",
  ] as const) {
    it(`recognizes a noisy rotated ${kind}`, () => {
      const proposal = recognizeSmartInkStroke(
        `stroke-${kind}`,
        positiveStrokes[kind],
      );

      expect(proposal.candidates[0]?.kind).toBe(kind);
      expect(proposal.candidates[0]?.confidence).toBeGreaterThan(0.58);
      expect(
        kind === "square" ? ["ambiguous", "recognized"] : ["recognized"],
      ).toContain(proposal.status);
      expect(proposal.sampledPointCount).toBe(96);
    });
  }

  it("keeps the proposal deterministic and free of timestamps", () => {
    const first = recognizeSmartInkStroke(
      "stroke-stable",
      positiveStrokes.ellipse,
    );
    const second = recognizeSmartInkStroke(
      "stroke-stable",
      positiveStrokes.ellipse,
    );

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("timestamp");
  });

  it("reports invalid and degenerate strokes without throwing", () => {
    expect(recognizeSmartInkStroke("empty", []).status).toBe("unrecognized");
    expect(
      recognizeSmartInkStroke("invalid", [{ x: Number.NaN, y: 0 }]).status,
    ).toBe("unrecognized");
    expect(
      recognizeSmartInkStroke("point", [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]).status,
    ).toBe("unrecognized");
  });

  it("rejects unbounded recognizer options and input before resampling", () => {
    const invalidOptions = recognizeSmartInkStroke(
      "invalid-options",
      positiveStrokes.line,
      { sampleCount: Number.POSITIVE_INFINITY },
    );
    expect(invalidOptions).toMatchObject({
      diagnostics: ["invalid-recognizer-options"],
      status: "unrecognized",
    });

    const oversized = recognizeSmartInkStroke(
      "oversized",
      Array.from({ length: 16_385 }, (_, index) => ({ x: index, y: 0 })),
    );
    expect(oversized).toMatchObject({
      diagnostics: ["stroke-point-limit-exceeded"],
      status: "unrecognized",
    });
  });

  it("exposes the rectangle/square alternative for a near-square", () => {
    const proposal = recognizeSmartInkStroke("near-square", nearSquareStroke());

    expect(proposal.candidates.slice(0, 2).map(({ kind }) => kind)).toEqual([
      "square",
      "rectangle",
    ]);
    expect(proposal.status).toBe("recognized");
    expect(proposal.diagnostics).toEqual([]);
  });

  it("stays comfortably inside the 150 ms spike latency budget", () => {
    const durations: number[] = [];
    const allFixtures = Object.values(positiveStrokes);
    for (let iteration = 0; iteration < 120; iteration += 1) {
      const started = globalThis.performance.now();
      recognizeSmartInkStroke(
        `latency-${iteration}`,
        allFixtures[iteration % allFixtures.length]!,
      );
      durations.push(globalThis.performance.now() - started);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;

    console.info(`Smart Ink spike latency p95: ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThan(150);
  });
});
