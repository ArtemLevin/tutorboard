import { describe, expect, it } from "vitest";
import {
  candidateSha,
  compareRuns,
  controlSha,
} from "../../scripts/c39/compare-stable-culling.mjs";

function fixture() {
  return Array.from({ length: 12 }, (_, index) => {
    const role = index % 4 === 0 || index % 4 === 3 ? "control" : "candidate";
    return {
      role,
      report: {
        baselineSha: role === "control" ? controlSha : candidateSha,
        worktreeDirty: false,
        harnessSha: "a".repeat(40),
        scenario: { name: "static-5000-10-images", dpr: 2 },
        content: { pngCount: 4, jpegCount: 6 },
        browser: "149",
        platform: "linux",
        arch: "x64",
        node: "24",
        runtime: { renderer: "software" },
        fixtureSha256: "b".repeat(64),
        initialPixels: "c".repeat(64),
        finalPixels: "c".repeat(64),
        initialViewport: { zoom: 1, offset: { x: 0, y: 0 } },
        finalViewport: { zoom: 1, offset: { x: 0, y: 0 } },
        traceEnabled: false,
        inputTimesMs: Array.from({ length: 18 }, (_, i) => i * 100),
        commitObservedAtMs: role === "control" ? 2000 : 1800,
        cameras: Array.from({ length: 19 }, (_, i) => ({
          zoom: i % 2 ? 1.08 : 1,
          x: i % 2 ? -8 : 0,
          y: i % 2 ? -8 : 0,
          visible: 4000,
        })),
        phases: {
          active: {
            p95Ms: role === "control" ? 100 : 70,
            count: 100,
            over100: role === "control" ? 10 : 5,
          },
          commit: { count: 1, p95Ms: 20 },
        },
        gaps: [{ endMs: 100, durationMs: 100 }],
      },
    };
  });
}

describe("stable culling paired comparison", () => {
  it("pairs adjacent ABBA observations and reports a block interval", () => {
    const result = compareRuns(fixture());
    expect(result.pairedMedianImprovement).toBeCloseTo(0.3);
    expect(result.pairs).toHaveLength(6);
    expect(result.blockMeanImprovements).toHaveLength(3);
    expect(result.latencyGate).toBe("PASS");
    expect(result.blockBootstrap95[0]).toBeCloseTo(0.3);
  });
  it("rejects an apparent speedup with another camera or fixture", () => {
    for (const key of [
      "cameras",
      "fixtureSha256",
      "initialPixels",
      "harnessSha",
      "baselineSha",
    ]) {
      const runs = fixture();
      runs[1].report[key] = "different";
      expect(() => compareRuns(runs)).toThrow();
    }
  });
  it("rejects dirty sources, missing inputs and incomplete blocks", () => {
    const runs = fixture();
    runs[2].report.worktreeDirty = true;
    expect(() => compareRuns(runs)).toThrow(/Dirty/u);
    const missing = fixture();
    missing[3].report.inputTimesMs.pop();
    expect(() => compareRuns(missing)).toThrow(/Input/u);
    expect(() => compareRuns(fixture().slice(1))).toThrow(/complete/u);
  });
  it("does not pass a smaller-than-required gain or a wall-time regression", () => {
    const runs = fixture();
    for (const run of runs.filter((r) => r.role === "candidate"))
      run.report.phases.active.p95Ms = 90;
    expect(compareRuns(runs).latencyGate).toBe("NO-GO");
    const deferred = fixture();
    for (const run of deferred.filter((r) => r.role === "candidate"))
      run.report.commitObservedAtMs = 2500;
    expect(compareRuns(deferred).latencyGate).toBe("NO-GO");
  });
});
