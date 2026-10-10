import { describe, expect, it } from "vitest";

import {
  comparePairedRuns,
  parseProfileLog,
} from "../../scripts/c39/compare-profiles.mjs";

function report(p95Ms, count = 16) {
  return {
    schemaVersion: 1,
    browser: "142.0",
    platform: "linux",
    arch: "x64",
    scenario: {
      name: "3000-cold-mixed",
      strokes: 3000,
      visibleStrokes: 800,
      gifs: 4,
      dpr: 2,
      zOrder: "alternating",
      cold: true,
      quick: true,
    },
    content: {
      pngCount: 6,
      realGifFrames: 4,
      objects: 3010,
    },
    inputTimesMs: Array.from({ length: 18 }, (_, index) => index),
    phases: {
      active: {
        count,
        p50Ms: p95Ms / 2,
        p95Ms,
        p99Ms: p95Ms + 1,
        maxMs: p95Ms + 3,
        over25: 4,
        over50: 2,
        over100: p95Ms > 100 ? 1 : 0,
      },
      commit: { count: 6, p50Ms: p95Ms / 3, p95Ms: p95Ms / 2,
        maxMs: p95Ms / 2 + 2, over100: 0 },
      settling: { count: 4 },
    },
  };
}

function cycle() {
  return [
    { role: "baseline", report: report(140) },
    { role: "candidate", report: report(90) },
    { role: "candidate", report: report(95) },
    { role: "baseline", report: report(135) },
  ];
}

describe("C3.9-E1 paired browser report integrity", () => {
  it("extracts exactly one representative report", () => {
    const input =
      "prefix C39_REPRESENTATIVE_BASELINE " +
      JSON.stringify(report(100)) +
      "\nother log\n";
    expect(parseProfileLog(input, "3000-cold-mixed").phases.active.p95Ms).toBe(
      100,
    );
    expect(() => parseProfileLog(input + input, "3000-cold-mixed")).toThrow(
      /exactly one/,
    );
    expect(() => parseProfileLog("empty", "3000-cold-mixed")).toThrow(
      /exactly one/,
    );
  });

  it("computes paired ABBA deltas without equating CPU reduction with FPS", () => {
    const result = comparePairedRuns(
      Array.from({ length: 5 }, cycle).flat(),
      "3000-cold-mixed",
    );
    expect(result.pairs).toBe(10);
    expect(result.enoughPairs).toBe(true);
    expect(result.enoughActiveFramesPerArm).toBe(false);
    expect(result.baseline.activeFrames).toBe(160);
    expect(result.candidate.activeFrames).toBe(160);
    expect(result.pairedMedianDelta.activeP95Ms).toBe(-45);
    expect(result.pairedMedianDelta.commitP95Ms).toBe(-22.5);
    expect(result.baseline.commit.frames).toBe(60);
    expect(result.candidate.commit.frames).toBe(60);
    expect(result.interpretation).toMatch(/Diagnostic only/);
  });

  it("rejects broken order, absent frames, and mismatched media fixtures", () => {
    const runs = cycle();
    expect(() => comparePairedRuns(runs.slice(1), "3000-cold-mixed")).toThrow(
      /ABBA/,
    );
    expect(() =>
      comparePairedRuns(
        [runs[1], runs[0], runs[2], runs[3]],
        "3000-cold-mixed",
      ),
    ).toThrow(/ABBA/);
    const broken = structuredClone(runs);
    broken[1].report.phases.active.count = 0;
    expect(() => comparePairedRuns(broken, "3000-cold-mixed")).toThrow(
      /frame count/,
    );
    const mismatched = structuredClone(runs);
    mismatched[2].report.content.realGifFrames = 1;
    expect(() => comparePairedRuns(mismatched, "3000-cold-mixed")).toThrow(
      /media differ/,
    );
    const switched = structuredClone(runs);
    for (const run of switched) {
      run.sha = "a".repeat(40);
      run.report.baselineSha = "a".repeat(40);
    }
    switched[2].sha = "b".repeat(40);
    switched[2].report.baselineSha = "b".repeat(40);
    expect(() => comparePairedRuns(switched, "3000-cold-mixed")).toThrow(
      /Different source SHA/,
    );
    const invalidCommit = structuredClone(runs);
    invalidCommit[1].report.phases.commit.count = 0;
    expect(() => comparePairedRuns(invalidCommit, "3000-cold-mixed")).toThrow(
      /commit\/settling/,
    );
  });
});
