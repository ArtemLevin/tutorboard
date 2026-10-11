import { describe, expect, it } from "vitest";
import {
  c39StaticCases,
  parseC39AbTrial,
  evaluateC39StableSceneAb,
} from "../../scripts/c39/summarize-stable-scene-ab.mjs";

function report(name, p95) {
  const strokes = Number(name.split("-")[1]);
  return {
    experiment: "C3.9-STATIC",
    schemaVersion: 1,
    scenario: { name, dpr: 2, gifs: 0, strokes },
    content: { pngCount: 4, jpegCount: 6, objects: strokes + 10 },
    inputTimesMs: Array.from({ length: 18 }, (_, i) => i * 20),
    fixtureSha256: name,
    browser: "chromium-test",
    platform: "linux",
    c39PersistPhases: {},
    c39Attribution: { traceAlignment: "aligned" },
    captureDropped: { frames: 0, wheelInputs: 0, js: 0, chromium: 0 },
    phases: {
      active: { count: 100, p95Ms: p95, over100: p95 > 100 ? 30 : 0 },
      commit: { p95Ms: 20 },
    },
  };
}

function abbaTrials(controlP95, candidateP95) {
  return Array.from({ length: 12 }, (_, index) => {
    const arm = index % 4 === 0 || index % 4 === 3 ? "A0" : "A1";
    return {
      arm,
      reports: new Map(
        c39StaticCases.map((name) => [
          name,
          report(name, arm === "A0" ? controlP95 : candidateP95),
        ]),
      ),
    };
  });
}

describe("C3.9-S3 paired ABBA parser", () => {
  it("preserves all static cases and rejects duplicates", () => {
    const reports = c39StaticCases.map((name) => report(name, 200));
    const log = reports
      .map((value) => "C39_REPRESENTATIVE_BASELINE " + JSON.stringify(value))
      .join("\n");
    expect(parseC39AbTrial(log).size).toBe(4);
    expect(() => parseC39AbTrial(log + "\n" + log)).toThrow(/Duplicated/);
    expect(() => parseC39AbTrial(log.split("\n").slice(1).join("\n"))).toThrow(
      /Incomplete/,
    );
  });

  it("accepts a strictly paired improvement and rejects trace overflow", () => {
    const trials = abbaTrials(200, 100);
    expect(evaluateC39StableSceneAb(trials).verdict).toBe(
      "LOCAL_GO_CANDIDATE",
    );
    trials[1].reports.get(c39StaticCases[0]).captureDropped.js = 2;
    expect(() => evaluateC39StableSceneAb(trials)).toThrow(/overflow/);
  });

  it("rejects subthreshold gains and invalid ABBA order", () => {
    const trials = abbaTrials(200, 180);
    expect(evaluateC39StableSceneAb(trials).verdict).toBe(
      "NO_GO_OR_INCONCLUSIVE",
    );
    trials[0].arm = "A1";
    expect(() => evaluateC39StableSceneAb(trials)).toThrow(
      /Invalid ABBA order/,
    );
  });

  it("rejects mismatched documents, including source image bytes", () => {
    const trials = abbaTrials(200, 100);
    trials[1].reports.get(c39StaticCases[0]).fixtureSha256 = "different";
    expect(() => evaluateC39StableSceneAb(trials)).toThrow(/fixture mismatch/);
  });
});
