import { describe, expect, it } from "vitest";

import {
  parseE2RunLog,
  summarizeE2Runs,
} from "../../scripts/c39/summarize-e2.mjs";

const sceneNames = [
  ["e2-dpr2-png-only", 0, 2, 1, 0],
  ["e2-dpr2-two-runs", 4, 2, 2, 1],
  ["e2-dpr2-five-runs", 4, 2, 5, 2],
  ["e2-dpr2-fallback", 4, 2, 1, 0],
  ["e2-dpr2-fallback-untraced", 4, 2, 1, 0],
  ["e2-dpr2-fallback-warm", 4, 2, 1, 0],
  ["e2-dpr1-two-runs", 4, 1, 2, 1],
  ["e2-dpr1-fallback", 4, 1, 1, 0],
];

function report([name, gifs, dpr, layers, animated], p95 = 80) {
  const untraced = name === "e2-dpr2-fallback-untraced";
  return {
    schemaVersion: 1,
    baselineSha: "a".repeat(40),
    experiment: "C3.9-E2",
    traceEnabled: !untraced,
    browser: "149.0",
    arch: "x64",
    platform: "linux",
    scenario: {
      name, strokes: 3000, visibleStrokes: 800, gifs, dpr,
    },
    content: {
      objects: 3010, pngCount: 10 - gifs,
      realGifFrames: gifs ? 4 : 0,
    },
    before: { layers, animatedLayers: animated },
    after: { layers, animatedLayers: animated },
    inputTimesMs: Array.from({ length: 18 }, (_, index) => index),
    phases: {
      active: { count: 65, p95Ms: p95, maxMs: p95 + 18, over100: 5 },
      commit: { count: 5, p95Ms: 110 },
    },
    gaps: [{ durationMs: p95 + 18 }],
    c39Attribution: {
      traceAlignment: untraced ? "unavailable" : "aligned",
      jsEventCount: untraced ? 0 : 25,
      frames: [{
        gapMs: p95 + 18,
        jsEvents: untraced ? [] : [{ kind: "wheel-viewport-persist" }],
        chromiumEvents: untraced ? [] : [
          { name: "LayerTreeHost::DoUpdateLayers", durationMs: 30 },
          { name: "DirectRenderer::DrawFrame", durationMs: 31 },
        ],
      }],
    },
  };
}
const oneRun = (p95 = 80) => new Map(
  sceneNames.map((scene) => [scene[0], report(scene, p95)]),
);

describe("C3.9-E2 compositor isolation report", () => {
  it("parses an exact E2 scenario matrix without changing the C3.9 baseline parser", () => {
    const log = Array.from(oneRun().values())
      .map((value) => "run: C39_REPRESENTATIVE_BASELINE " + JSON.stringify(value))
      .join("\n");
    expect(parseE2RunLog(log).size).toBe(8);
    expect(() => parseE2RunLog(log + "\n" + log)).toThrow(/Duplicate/);
    expect(() => parseE2RunLog(log.split("\n").slice(1).join("\n")))
      .toThrow(/Incomplete/);
  });

  it("counts sampled aligned long compositor events without treating correlation as causation", () => {
    const result = summarizeE2Runs(Array.from({ length: 4 }, () => oneRun()));
    expect(result.repeats).toBe(4);
    expect(result.variants["e2-dpr2-five-runs"].activeFrames).toBe(260);
    expect(result.variants["e2-dpr2-fallback"].slowFramesWithLayerUpdate25).toBe(4);
    expect(result.variants["e2-dpr2-fallback-untraced"].slowFramesWithViewportPersist).toBe(0);
    expect(result.pairedControls[0].medianRepeatDeltaActiveP95Ms).toBe(0);
    expect(result.interpretation).toMatch(/diagnostic only/i);
  });

  it("rejects changed composition and source revision", () => {
    const matrices = Array.from({ length: 4 }, () => oneRun());
    matrices[2].get("e2-dpr2-five-runs").before.layers = 1;
    expect(() => summarizeE2Runs(matrices)).toThrow(/layer contract/);
    const matricesWithBadSha = Array.from({ length: 4 }, () => oneRun());
    matricesWithBadSha[1].get("e2-dpr2-fallback").baselineSha = "b".repeat(40);
    expect(() => summarizeE2Runs(matricesWithBadSha)).toThrow(/Source revision/);
  });
});
