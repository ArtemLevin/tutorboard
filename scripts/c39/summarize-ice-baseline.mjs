#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const marker = "ICE2_BASELINE ";
const baseTargets = {
  "ice2-1000-static": { strokes: 1000, visible: 800 },
  "ice2-3000-static": { strokes: 3000, visible: 2400 },
  "ice2-5000-static": { strokes: 5000, visible: 4000 },
  "ice2-10000-static": { strokes: 10000, visible: 8000 },
};
const largeTargets = {
  "ice2-30000-offscreen": { strokes: 30000, visible: 1000 },
  "ice2-100000-offscreen": { strokes: 100000, visible: 1000 },
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function median(values) {
  check(values.length > 0, "No samples");
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function targetMap(includeLarge) {
  return includeLarge ? { ...baseTargets, ...largeTargets } : baseTargets;
}

export function parseIceBaselineLog(stdout, { includeLarge = false } = {}) {
  const targets = targetMap(includeLarge);
  const found = new Map();
  for (const line of stdout.split(/\r?\n/u)) {
    const offset = line.indexOf(marker);
    if (offset === -1) continue;
    const report = JSON.parse(line.slice(offset + marker.length));
    check(report.experiment === "ICE2-BASELINE", "Unexpected experiment");
    const name = report.scenario?.name;
    check(Object.hasOwn(targets, name), "Unexpected ICE scenario: " + name);
    check(!found.has(name), "Duplicate ICE report: " + name);
    found.set(name, report);
  }
  check(
    found.size === Object.keys(targets).length,
    "Incomplete ICE baseline matrix",
  );
  return found;
}

function verify(report, name, target, source) {
  check(report.schemaVersion === 1, "Unknown baseline schema");
  check(report.experiment === "ICE2-BASELINE", "Experiment identity changed");
  check(report.loadMode === "indexeddb-revision-restore", "Load mode drift");
  check(report.traceEnabled === false, "Speed baseline must be trace-off");
  check(report.baselineSha === source.sha, "Source SHA changed");
  check(report.browser === source.browser, "Browser version changed");
  check(
    report.platform === source.platform && report.arch === source.arch,
    "Runner platform changed",
  );
  const scenario = report.scenario;
  check(scenario?.name === name, "Scenario identity changed");
  check(
    scenario.iceBaseline === true && scenario.staticHeavy === true,
    "ICE workload type changed",
  );
  check(
    scenario.strokes === target.strokes &&
      scenario.visibleStrokes === target.visible,
    "Stroke population changed",
  );
  check(
    scenario.dpr === 2 && scenario.gifs === 0 && scenario.cold === true,
    "DPR, GIF or cache precondition changed",
  );
  check(scenario.zOrder === "trailing", "Paint order changed");
  check(report.content?.objects === target.strokes + 10, "Object count drift");
  check(
    report.content.pngCount === 4 && report.content.jpegCount === 6,
    "Media composition changed",
  );
  check(
    report.content.pngWidthPx === 1536 &&
      report.content.pngHeightPx === 1536 &&
      report.content.realGifFrames === 0,
    "Media dimensions or animation changed",
  );
  check(
    report.before?.layers === 1 && report.after?.layers === 1,
    "Committed layer topology drift",
  );
  check(
    report.before?.animatedLayers === 0 &&
      report.after?.animatedLayers === 0,
    "Unexpected animated layers",
  );
  check(
    report.fixture?.workloadVersion === 1 &&
      report.fixture.strokeGeometry === "varied",
    "Fixture version or geometry drift",
  );
  for (const field of ["documentSha256", "mediaSha256"]) {
    check(
      typeof report.fixture[field] === "string" &&
        /^[a-f0-9]{64}$/u.test(report.fixture[field]),
      "Missing fixture SHA-256: " + field,
    );
  }
  check(
    Array.isArray(report.inputTimesMs) && report.inputTimesMs.length === 18,
    "Missing wheel inputs",
  );
  check(
    report.inputTimesMs.every(
      (value, index, values) =>
        Number.isFinite(value) &&
        (index === 0 || value >= values[index - 1]),
    ),
    "Invalid wheel input times",
  );
  check(
    Number.isFinite(report.importDurationMs) &&
      report.importDurationMs >= 0,
    "Invalid document load duration",
  );
  for (const phase of ["active", "commit", "settling"]) {
    const result = report.phases?.[phase];
    check(
      Number.isInteger(result?.count) && result.count > 0,
      "Empty " + phase,
    );
    for (const key of ["p50Ms", "p95Ms", "p99Ms", "maxMs"]) {
      check(
        Number.isFinite(result[key]) && result[key] >= 0,
        "Invalid " + phase + " " + key,
      );
    }
    check(
      result.p50Ms <= result.p95Ms &&
        result.p95Ms <= result.p99Ms &&
        result.p99Ms <= result.maxMs,
      "Inconsistent " + phase + " percentile ordering",
    );
    for (const key of ["over25", "over50", "over100"]) {
      check(
        Number.isInteger(result[key]) &&
          result[key] >= 0 &&
          result[key] <= result.count,
        "Invalid " + phase + " " + key,
      );
    }
    check(
      result.over100 <= result.over50 && result.over50 <= result.over25,
      "Slow-frame counter ordering changed",
    );
  }
}

/**
 * Descriptive trace-off baseline, never an A/B speedup claim. Requires one
 * workload manifest per scenario identical in every repeat.
 */
export function summarizeIceBaseline(matrices, { includeLarge = false } = {}) {
  check(matrices.length >= 3, "Need at least three independent matrices");
  const targets = targetMap(includeLarge);
  const reference = matrices[0]?.get("ice2-1000-static");
  check(reference, "Missing reference scenario");
  const source = {
    sha: reference.baselineSha,
    browser: reference.browser,
    platform: reference.platform,
    arch: reference.arch,
  };
  const variants = {};
  for (const [name, target] of Object.entries(targets)) {
    const reports = matrices.map((matrix) => {
      check(matrix.size === Object.keys(targets).length, "Matrix shape drift");
      const report = matrix.get(name);
      check(report, "Missing scenario: " + name);
      verify(report, name, target, source);
      return report;
    });
    const documentSha256 = reports[0].fixture.documentSha256;
    const mediaSha256 = reports[0].fixture.mediaSha256;
    for (const report of reports) {
      check(
        report.fixture.documentSha256 === documentSha256 &&
          report.fixture.mediaSha256 === mediaSha256,
        "Fixture/media SHA-256 drift in " + name,
      );
    }
    const activeFrames = reports.reduce(
      (total, report) => total + report.phases.active.count,
      0,
    );
    const slow = Object.fromEntries(
      ["over25", "over50", "over100"].map((key) => [
        key,
        reports.reduce((total, report) => total + report.phases.active[key], 0),
      ]),
    );
    variants[name] = {
      strokes: target.strokes,
      requestedVisibleStrokes: target.visible,
      objectCount: target.strokes + 10,
      documentSha256,
      mediaSha256,
      runs: reports.length,
      activeFrames,
      p99Evidence:
        activeFrames >= 1000 && reports.length >= 5
          ? "descriptive-only"
          : "insufficient-independent-samples",
      medianActiveP50Ms: median(reports.map((r) => r.phases.active.p50Ms)),
      medianActiveP95Ms: median(reports.map((r) => r.phases.active.p95Ms)),
      medianActiveP99Ms: median(reports.map((r) => r.phases.active.p99Ms)),
      medianActiveMaxMs: median(reports.map((r) => r.phases.active.maxMs)),
      medianCommitP95Ms: median(reports.map((r) => r.phases.commit.p95Ms)),
      medianRestoreMs: median(reports.map((r) => r.importDurationMs)),
      ...slow,
      over100Rate: slow.over100 / activeFrames,
      perRun: reports.map((r) => ({
        activeFrames: r.phases.active.count,
        activeP95Ms: r.phases.active.p95Ms,
        activeP99Ms: r.phases.active.p99Ms,
        activeMaxMs: r.phases.active.maxMs,
        commitP95Ms: r.phases.commit.p95Ms,
        over100: r.phases.active.over100,
      })),
    };
  }
  return {
    schemaVersion: 1,
    kind: "ice2-trace-off-descriptive-baseline",
    source,
    includeLarge,
    repeats: matrices.length,
    variants,
    interpretation:
      "Descriptive production-build Chromium baseline, not a treatment/control speedup claim. Visible-stroke counts are placement requests. The 18-input wheel driver may mix viewport persistence with active frames. Independent ABBA, trace-on attribution, real-device and teacher/guest checks are required for an ICE GO.",
  };
}

async function main() {
  const [folder, output, flag] = process.argv.slice(2);
  check(
    folder && output && (flag === undefined || flag === "--large"),
    "Usage: node scripts/c39/summarize-ice-baseline.mjs dir summary.json [--large]",
  );
  const includeLarge = flag === "--large";
  const matrices = [];
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    const log = await readFile(join(folder, `repeat-${repeat}.log`), "utf8");
    matrices.push(parseIceBaselineLog(log, { includeLarge }));
  }
  const summary = summarizeIceBaseline(matrices, { includeLarge });
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.info("ICE2_BASELINE_SUMMARY " + JSON.stringify(summary));
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
