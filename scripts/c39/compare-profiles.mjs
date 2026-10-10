#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const marker = "C39_REPRESENTATIVE_BASELINE ";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numeric(value, description) {
  assert(
    typeof value === "number" && Number.isFinite(value),
    "Invalid " + description,
  );
  return value;
}

function median(values) {
  assert(values.length > 0, "Cannot calculate median of empty values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Extract one exact scenario result from a successful Playwright run log. */
export function parseProfileLog(log, scenarioName) {
  const reports = [];
  for (const line of log.split(/\r?\n/u)) {
    const offset = line.indexOf(marker);
    if (offset === -1) continue;
    const raw = line.slice(offset + marker.length);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Malformed C39 report line");
    }
    if (parsed?.scenario?.name === scenarioName) reports.push(parsed);
  }
  assert(
    reports.length === 1,
    "Expected exactly one " +
      scenarioName +
      " report per run, received " +
      reports.length,
  );
  return reports[0];
}

function validateReport(report, expectedScenario) {
  assert(report.schemaVersion === 1, "Unsupported C39 report schema");
  assert(report.scenario?.name === expectedScenario, "Scenario mismatch");
  assert(
    Array.isArray(report.inputTimesMs) && report.inputTimesMs.length === 18,
    "Missing 18 wheel input timestamps",
  );
  assert(
    typeof report.browser === "string" && report.browser.length > 0,
    "Missing browser version",
  );
  assert(
    report.content?.pngCount === 6,
    "Representative image fixture missing",
  );
  const active = report.phases?.active;
  assert(active !== null && typeof active === "object", "Missing active phase");
  assert(
    Number.isInteger(active.count) && active.count > 0,
    "Invalid active frame count",
  );
  for (const name of ["p50Ms", "p95Ms", "p99Ms", "maxMs"])
    numeric(active[name], "active " + name);
  for (const name of ["over25", "over50", "over100"]) {
    assert(
      Number.isInteger(active[name]) &&
        active[name] >= 0 &&
        active[name] <= active.count,
      "Invalid " + name,
    );
  }
  const commit = report.phases?.commit;
  assert(
    Number.isInteger(commit?.count) && commit.count > 0 &&
      report.phases?.settling?.count > 0,
    "Missing commit/settling phase",
  );
  for (const name of ["p95Ms", "maxMs"]) {
    numeric(commit[name], "commit " + name);
  }
  assert(
    Number.isInteger(commit.over100) && commit.over100 >= 0 &&
      commit.over100 <= commit.count,
    "Invalid commit over100",
  );
  return active;
}

/**
 * Compare chronological ABBA cycles on a single runner. Every run must use
 * the same representative fixture and browser version. This is descriptive
 * evidence: shared-runner metrics have no universal timing PASS threshold.
 */
export function comparePairedRuns(runs, scenarioName, minPairs = 5) {
  assert(
    Array.isArray(runs) && runs.length > 0 && runs.length % 4 === 0,
    "Expected complete ABBA cycles",
  );
  assert(Number.isInteger(minPairs) && minPairs >= 1, "Invalid minPairs");
  const deltas = [];
  const baseline = [];
  const candidate = [];
  const baselineCommit = [];
  const candidateCommit = [];
  const sourceShaByRole = new Map();
  const reference = runs[0]?.report;
  for (let index = 0; index < runs.length; index += 4) {
    const cycle = runs.slice(index, index + 4);
    assert(
      cycle.map((run) => run.role).join(",") ===
        "baseline,candidate,candidate,baseline",
      "Expected ABBA order",
    );
    for (const run of cycle) {
      validateReport(run.report, scenarioName);
      if (run.sha !== undefined) {
        assert(/^[0-9a-f]{40}$/u.test(run.sha), "Invalid immutable run SHA");
        assert(
          run.report.baselineSha === run.sha,
          "Report SHA differs from checked-out source",
        );
        const previousSha = sourceShaByRole.get(run.role);
        assert(
          previousSha === undefined || previousSha === run.sha,
          "Different source SHA for the same role across runs",
        );
        sourceShaByRole.set(run.role, run.sha);
      }
      assert(
        JSON.stringify(run.report.scenario) ===
          JSON.stringify(reference.scenario),
        "Representative fixture options differ",
      );
      assert(
        JSON.stringify(run.report.content) ===
          JSON.stringify(reference.content),
        "Representative fixture media differ",
      );
      assert(
        run.report.browser === reference.browser,
        "Browser versions differ",
      );
      assert(
        run.report.platform === reference.platform &&
          run.report.arch === reference.arch,
        "Host platform differs",
      );
      (run.role === "baseline" ? baseline : candidate).push(
        run.report.phases.active,
      );
      (run.role === "baseline" ? baselineCommit : candidateCommit).push(
        run.report.phases.commit,
      );
    }
    for (const [a, b] of [
      [cycle[0], cycle[1]],
      [cycle[3], cycle[2]],
    ]) {
      const left = a.report.phases.active;
      const right = b.report.phases.active;
      deltas.push({
        activeP95Ms: right.p95Ms - left.p95Ms,
        maxGapMs: right.maxMs - left.maxMs,
        commitP95Ms: b.report.phases.commit.p95Ms - a.report.phases.commit.p95Ms,
        commitMaxMs: b.report.phases.commit.maxMs - a.report.phases.commit.maxMs,
        over50Rate: right.over50 / right.count - left.over50 / left.count,
        over100Rate: right.over100 / right.count - left.over100 / left.count,
      });
    }
  }
  const total = (items, key) => items.reduce((sum, item) => sum + item[key], 0);
  const summary = (items) => ({
    runs: items.length,
    activeFrames: total(items, "count"),
    medianRunP95Ms: median(items.map((item) => item.p95Ms)),
    medianRunMaxMs: median(items.map((item) => item.maxMs)),
    over50: total(items, "over50"),
    over100: total(items, "over100"),
    over50Rate: total(items, "over50") / total(items, "count"),
    over100Rate: total(items, "over100") / total(items, "count"),
  });
  const commitSummary = (items) => ({
    frames: total(items, "count"),
    medianRunP95Ms: median(items.map((item) => item.p95Ms)),
    medianRunMaxMs: median(items.map((item) => item.maxMs)),
    over100: total(items, "over100"),
  });
  const a = { ...summary(baseline), commit: commitSummary(baselineCommit) };
  const b = { ...summary(candidate), commit: commitSummary(candidateCommit) };
  return {
    schemaVersion: 1,
    kind: "c39-e1-abba-diagnostic",
    scenario: reference.scenario,
    browser: reference.browser,
    baselineSha: runs[0].sha ?? runs[0].report.baselineSha ?? null,
    candidateSha: runs[1].sha ?? runs[1].report.baselineSha ?? null,
    cycles: runs.length / 4,
    pairs: deltas.length,
    enoughPairs: deltas.length >= minPairs,
    enoughActiveFramesPerArm: Math.min(a.activeFrames, b.activeFrames) >= 200,
    baseline: a,
    candidate: b,
    pairedMedianDelta: {
      activeP95Ms: median(deltas.map((delta) => delta.activeP95Ms)),
      maxGapMs: median(deltas.map((delta) => delta.maxGapMs)),
      commitP95Ms: median(deltas.map((delta) => delta.commitP95Ms)),
      commitMaxMs: median(deltas.map((delta) => delta.commitMaxMs)),
      over50Rate: median(deltas.map((delta) => delta.over50Rate)),
      over100Rate: median(deltas.map((delta) => delta.over100Rate)),
    },
    pairedDeltas: deltas,
    interpretation:
      "Diagnostic only. Require replicated fresh-run browser/visual/resource evidence before latency sign-off.",
  };
}

async function main() {
  const [manifestPath, scenarioName, outputPath] = process.argv.slice(2);
  assert(
    manifestPath && scenarioName && outputPath,
    "Usage: node scripts/c39/compare-profiles.mjs manifest.jsonl scenario output.json",
  );
  const entries = (await readFile(manifestPath, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  const runs = [];
  for (const entry of entries) {
    assert(
      entry.role === "baseline" || entry.role === "candidate",
      "Invalid run role",
    );
    assert(
      typeof entry.log === "string" && entry.log.length > 0,
      "Missing run log path",
    );
    runs.push({
      role: entry.role,
      sha: entry.sha,
      report: parseProfileLog(await readFile(entry.log, "utf8"), scenarioName),
    });
  }
  const result = comparePairedRuns(runs, scenarioName);
  await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.info(
    JSON.stringify(
      {
        pairs: result.pairs,
        baseline: result.baseline,
        candidate: result.candidate,
        pairedMedianDelta: result.pairedMedianDelta,
        enoughPairs: result.enoughPairs,
        enoughActiveFramesPerArm: result.enoughActiveFramesPerArm,
        interpretation: result.interpretation,
      },
      null,
      2,
    ),
  );
  assert(result.enoughPairs, "Too few comparison pairs for release evidence");
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
