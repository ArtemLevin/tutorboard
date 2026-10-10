import assert from "node:assert/strict";
import { test } from "node:test";
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
test("ABBA parser preserves all four static scenarios", () => {
  const reports = c39StaticCases.map((name) => report(name, 200));
  const log = reports
    .map((value) => "C39_REPRESENTATIVE_BASELINE " + JSON.stringify(value))
    .join("\n");
  assert.equal(parseC39AbTrial(log).size, 4);
  assert.throws(() => parseC39AbTrial(log + "\n" + log), /Duplicated/);
});
test("ABBA evaluator detects paired improvement and rejects trace overflow", () => {
  const trials = Array.from({ length: 12 }, (_, index) => {
    const arm = index % 4 === 0 || index % 4 === 3 ? "A0" : "A1";
    return {
      arm,
      reports: new Map(
        c39StaticCases.map((name) => [
          name,
          report(name, arm === "A0" ? 200 : 100),
        ]),
      ),
    };
  });
  assert.equal(evaluateC39StableSceneAb(trials).verdict, "LOCAL_GO_CANDIDATE");
  trials[1].reports.get(c39StaticCases[0]).captureDropped.js = 2;
  assert.throws(() => evaluateC39StableSceneAb(trials), /overflow/);
});
