#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const c39StaticCases = [
  "static-3000-10-images",
  "static-5000-10-images",
  "static-10000-10-images",
  "static-10000-offscreen",
];
const marker = "C39_REPRESENTATIVE_BASELINE ";
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  assert(ordered.length > 0, "Missing metric samples");
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
};

export function parseC39AbTrial(log) {
  const reports = new Map();
  for (const line of log.split(/\r?\n/u)) {
    const offset = line.indexOf(marker);
    if (offset < 0) continue;
    const report = JSON.parse(line.slice(offset + marker.length));
    if (report.experiment !== "C3.9-STATIC") continue;
    const name = report.scenario?.name;
    assert(c39StaticCases.includes(name), "Unexpected scenario " + name);
    assert(!reports.has(name), "Duplicated scenario " + name);
    reports.set(name, report);
  }
  assert(
    reports.size === c39StaticCases.length,
    "Incomplete C3.9 static scenario matrix",
  );
  return reports;
}

/** A B B A, repeated three times: two adjacent matched pairs per cycle. */
export function evaluateC39StableSceneAb(trials) {
  assert(trials.length === 12, "Expected three complete ABBA cycles");
  const evidence = {};
  for (const name of c39StaticCases) {
    const runs = trials.map((trial, index) => {
      const expectedArm = index % 4 === 0 || index % 4 === 3 ? "A0" : "A1";
      assert(trial.arm === expectedArm, "Invalid ABBA order at run " + index);
      const report = trial.reports.get(name);
      assert(report, "Missing scenario " + name);
      assert(report.schemaVersion === 1, "Schema drift");
      assert(
        report.scenario.dpr === 2 && report.scenario.gifs === 0,
        "Scenario drift",
      );
      assert(
        report.content.pngCount === 4 && report.content.jpegCount === 6,
        "Codec drift",
      );
      assert(
        report.content.objects === report.scenario.strokes + 10,
        "Object count drift",
      );
      assert(report.inputTimesMs?.length === 18, "Input loss");
      assert(report.c39PersistPhases, "Persistence attribution missing");
      assert(
        report.c39Attribution.traceAlignment === "aligned",
        "Missing browser trace alignment",
      );
      assert(
        report.captureDropped &&
          Object.values(report.captureDropped).every((x) => x === 0),
        "Trace recorder overflow; result unusable",
      );
      assert(report.phases.active.count > 0, "Missing active frames");
      return { arm: trial.arm, report };
    });
    const reference = runs[0].report;
    for (const { report } of runs) {
      assert(
        report.fixtureSha256 === reference.fixtureSha256,
        "Document/media fixture mismatch: " + name,
      );
      assert(
        report.browser === reference.browser &&
          report.platform === reference.platform,
        "Browser/runner changed within paired job",
      );
    }
    const pairs = [];
    for (let block = 0; block < 3; block += 1) {
      const [a, b, c, d] = runs.slice(block * 4, block * 4 + 4);
      for (const [control, candidate] of [
        [a, b],
        [d, c],
      ]) {
        const baseline = control.report.phases.active;
        const changed = candidate.report.phases.active;
        pairs.push({
          controlP95Ms: baseline.p95Ms,
          candidateP95Ms: changed.p95Ms,
          relativeImprovement:
            (baseline.p95Ms - changed.p95Ms) / baseline.p95Ms,
          controlOver100Rate: baseline.over100 / baseline.count,
          candidateOver100Rate: changed.over100 / changed.count,
          controlFrames: baseline.count,
          candidateFrames: changed.count,
          controlCommitP95Ms: control.report.phases.commit.p95Ms,
          candidateCommitP95Ms: candidate.report.phases.commit.p95Ms,
        });
      }
    }
    const improvement = median(pairs.map((pair) => pair.relativeImprovement));
    const controlSlow =
      pairs.reduce((sum, p) => sum + p.controlOver100Rate, 0) / pairs.length;
    const candidateSlow =
      pairs.reduce((sum, p) => sum + p.candidateOver100Rate, 0) / pairs.length;
    evidence[name] = {
      fixtureSha256: reference.fixtureSha256,
      browser: reference.browser,
      pairs,
      medianRelativeImprovement: improvement,
      meanOver100RateControl: controlSlow,
      meanOver100RateCandidate: candidateSlow,
    };
  }
  const mainGo = ["static-5000-10-images", "static-10000-10-images"].every(
    (name) =>
      evidence[name].medianRelativeImprovement >= 0.2 &&
      evidence[name].meanOver100RateCandidate <
        evidence[name].meanOver100RateControl,
  );
  const regressionsOkay = [
    "static-3000-10-images",
    "static-10000-offscreen",
  ].every((name) => evidence[name].medianRelativeImprovement >= -0.1);
  return {
    schemaVersion: 1,
    cycles: 3,
    pairsPerVariant: 6,
    verdict:
      mainGo && regressionsOkay
        ? "LOCAL_GO_CANDIDATE"
        : "NO_GO_OR_INCONCLUSIVE",
    caveat:
      "A single runner's six pairs are not a complete release gate. Confirm on an independent runner, pixel/hit, input latency, persistence and cross-browser functional checks. Never bootstrap individual rAF gaps as independent trials.",
    evidence,
  };
}

async function main() {
  const [folder, output] = process.argv.slice(2);
  assert(
    folder && output,
    "Usage: node scripts/c39/summarize-stable-scene-ab.mjs folder summary.json",
  );
  const trials = [];
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    for (let position = 1; position <= 4; position += 1) {
      const arm = position === 1 || position === 4 ? "A0" : "A1";
      trials.push({
        arm,
        reports: parseC39AbTrial(
          await readFile(
            join(folder, `cycle-${cycle}-position-${position}-${arm}.log`),
            "utf8",
          ),
        ),
      });
    }
  }
  const summary = evaluateC39StableSceneAb(trials);
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("C39_STABLE_SCENE_AB " + JSON.stringify(summary));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
