import { describe, expect, it } from "vitest";
import {
  parseColdCacheRun,
  summarizeColdCachePaired,
} from "../../scripts/c39/summarize-cold-cache.mjs";

function makeReport(strokes, cached) {
  const name = `cold-cache-${strokes}-${cached ? "cache" : "control"}`;
  return {
    schemaVersion: 1,
    baselineSha: "a".repeat(40),
    experiment: "C3.9-COLD-CACHE",
    browser: "149.0",
    platform: "linux",
    arch: "x64",
    scenario: {
      name, strokes, visibleStrokes: strokes * 0.8,
      cold: true, dpr: 2, gifs: 0,
      coldCacheAB: cached ? "cache" : "control",
    },
    content: { objects: strokes + 10, pngCount: 4, jpegCount: 6 },
    loadMode: "indexeddb-revision-restore",
    before: { layers: 1 },
    after: { layers: 1, animatedLayers: 0 },
    wheelInkCache: { builds: cached ? 1 : 0, skippedColdBuild: !cached, lastBuildPixels: cached ? 2_000_000 : 0, lastWheelBeginMs: cached ? 30 : 0.5 },
    inputTimesMs: Array.from({ length: 18 }, (_, i) => i),
    phases: {
      active: { count: 60, p95Ms: cached ? 25 : 200, maxMs: cached ? 40 : 250, over100: cached ? 0 : 10 },
      commit: { count: 10, p95Ms: cached ? 35 : 250 },
    },
  };
}
function matrix() {
  return new Map(
    [5000, 10000].flatMap(strokes => [false,true].map(cache => {
      const report = makeReport(strokes, cache);
      return [report.scenario.name, report];
    }))
  );
}
describe("C3.9 cold ink cache A/B integrity", () => {
  it("accepts same-source repetitions and counts active frames", () => {
    const summary = summarizeColdCachePaired([matrix(), matrix(), matrix(), matrix()]);
    expect(summary.metrics[5000].adequateFrames).toBe(true);
    expect(summary.metrics[10000].medianPairedDeltaP95Ms).toBe(-175);
    expect(summary.metrics[5000].cached.coldBuildPixels).toBe(2_000_000);
  });
  it("rejects missing and duplicate comparisons", () => {
    const lines = [...matrix().values()].map(r=>"C39_REPRESENTATIVE_BASELINE "+JSON.stringify(r));
    expect(parseColdCacheRun(lines.join("\n")).size).toBe(4);
    expect(() => parseColdCacheRun(lines.slice(0,3).join("\n"))).toThrow(/Incomplete/);
    expect(() => parseColdCacheRun([...lines,lines[0]].join("\n"))).toThrow(/Duplicate/);
  });
  it("rejects accidental state mismatches and cache build no-ops", () => {
    const matrices = [matrix(), matrix(), matrix(), matrix()];
    matrices[1].get("cold-cache-10000-cache").wheelInkCache.builds = 0;
    expect(() => summarizeColdCachePaired(matrices)).toThrow(/did not rasterize/);
    const drift = [matrix(), matrix(), matrix(), matrix()];
    drift[3].get("cold-cache-5000-control").baselineSha = "b".repeat(40);
    expect(() => summarizeColdCachePaired(drift)).toThrow(/Mixed source SHA/);
  });
});
