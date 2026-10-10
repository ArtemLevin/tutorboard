import { describe, expect, it } from "vitest";
import {
  parseStaticHeavyLog,
  summarizeStaticHeavy,
} from "../../scripts/c39/summarize-static-heavy.mjs";

const specs = [
  ["static-3000-10-images", 3000, 2400],
  ["static-5000-10-images", 5000, 4000],
  ["static-10000-10-images", 10000, 8000],
  ["static-10000-offscreen", 10000, 1000],
];
function report([name, strokes, visibleStrokes], p95 = 35) {
  return {
    schemaVersion: 1,
    baselineSha: "a".repeat(40),
    experiment: "C3.9-STATIC",
    browser: "149.0",
    platform: "linux",
    arch: "x64",
    scenario: {
      name, strokes, visibleStrokes, dpr: 2, gifs: 0, cold: true,
    },
    content: {
      objects: strokes + 10, pngCount: 4, jpegCount: 6,
      realGifFrames: 0, pngWidthPx: 1536, pngHeightPx: 1536,
    },
    before: { layers: 1, animatedLayers: 0 },
    after: { layers: 1, animatedLayers: 0 },
    inputTimesMs: Array.from({ length: 18 }, (_, i) => i),
    importDurationMs: 100,
    phases: {
      active: { count: 70, p95Ms: p95, maxMs: p95 + 10, over100: 4 },
      commit: { count: 4, p95Ms: 80, maxMs: 100, over100: 0 },
      settling: { count: 10 },
    },
    c39Attribution: { traceAlignment: "aligned" },
  };
}
function matrix() {
  return new Map(specs.map((spec) => [spec[0], report(spec)]));
}

describe("C3.9 static-heavy baseline parser", () => {
  it("accepts an exact fixture set and summarizes repeated observations", () => {
    const stdout = [...matrix().values()]
      .map((item) => "C39_REPRESENTATIVE_BASELINE " + JSON.stringify(item))
      .join("\n");
    expect(parseStaticHeavyLog(stdout).size).toBe(4);
    const summary = summarizeStaticHeavy([matrix(), matrix(), matrix()]);
    expect(summary.variants["static-10000-10-images"].activeFrames).toBe(210);
    expect(summary.variants["static-10000-10-images"].enoughActiveFrames).toBe(true);
    expect(summary.variants["static-3000-10-images"].medianActiveP95Ms).toBe(35);
  });
  it("rejects an absent or duplicated result", () => {
    const rows = [...matrix().values()].map((x) => "C39_REPRESENTATIVE_BASELINE " + JSON.stringify(x));
    expect(() => parseStaticHeavyLog(rows.slice(1).join("\n"))).toThrow(/Incomplete/);
    expect(() => parseStaticHeavyLog([...rows, rows[0]].join("\n"))).toThrow(/Duplicate/);
  });
  it("rejects changed JPEG counts or source revisions", () => {
    const a = matrix();
    a.get("static-10000-10-images").content.jpegCount = 5;
    expect(() => summarizeStaticHeavy([a, matrix(), matrix()])).toThrow(/image codec/);
    const b = matrix();
    b.get("static-5000-10-images").baselineSha = "b".repeat(40);
    expect(() => summarizeStaticHeavy([matrix(), b, matrix()])).toThrow(/Source SHA/);
  });
});
