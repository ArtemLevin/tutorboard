#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const marker = "C39_REPRESENTATIVE_BASELINE ";
const targets = {
  "static-3000-10-images": { strokes: 3000, visible: 2400 },
  "static-5000-10-images": { strokes: 5000, visible: 4000 },
  "static-10000-10-images": { strokes: 10000, visible: 8000 },
  "static-10000-offscreen": { strokes: 10000, visible: 1000 },
};
const check = (value, message) => {
  if (!value) throw new Error(message);
};
function median(values) {
  check(values.length > 0, "Empty input");
  const ordered = [...values].sort((a, b) => a - b);
  const m = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[m] : (ordered[m - 1] + ordered[m]) / 2;
}

export function parseStaticHeavyLog(stdout) {
  const found = new Map();
  for (const line of stdout.split(/\r?\n/u)) {
    const offset = line.indexOf(marker);
    if (offset === -1) continue;
    const report = JSON.parse(line.slice(offset + marker.length));
    if (report.experiment !== "C3.9-STATIC") continue;
    const name = report.scenario?.name;
    check(
      Object.hasOwn(targets, name),
      "Unexpected static-media scenario " + name,
    );
    check(!found.has(name), "Duplicate static-media report " + name);
    found.set(name, report);
  }
  check(
    found.size === Object.keys(targets).length,
    "Incomplete static-media matrix",
  );
  return found;
}

function verify(report, name, source) {
  const target = targets[name];
  check(report.schemaVersion === 1, "Unrecognized report schema");
  check(report.baselineSha === source.sha, "Source SHA changed");
  check(report.browser === source.browser, "Browser version changed");
  check(
    report.platform === source.platform && report.arch === source.arch,
    "Runner platform changed",
  );
  check(report.scenario.strokes === target.strokes, "Stroke count changed");
  check(
    report.scenario.visibleStrokes === target.visible,
    "Visible stroke count changed",
  );
  check(
    report.scenario.dpr === 2 && report.scenario.gifs === 0,
    "DPR/GIF scope drift",
  );
  check(report.scenario.cold === true, "Cache cold precondition changed");
  check(report.content.objects === target.strokes + 10, "Object count changed");
  check(
    report.content.pngCount === 4 && report.content.jpegCount === 6,
    "Mixed image codec contract drift",
  );
  check(report.content.realGifFrames === 0, "Unexpected animation");
  check(
    report.content.pngWidthPx === 1536 && report.content.pngHeightPx === 1536,
    "Image resolution changed",
  );
  check(
    report.before.layers === 1 && report.after.layers === 1,
    "Static scene layer topology changed",
  );
  check(
    report.before.animatedLayers === 0 && report.after.animatedLayers === 0,
    "Unexpected animated layer",
  );
  check(
    Array.isArray(report.inputTimesMs) && report.inputTimesMs.length === 18,
    "Missing wheel input series",
  );
  check(
    Number.isInteger(report.phases.active.count) &&
      report.phases.active.count > 0,
    "Missing active frames",
  );
  check(
    report.phases.commit.count > 0 && report.phases.settling.count > 0,
    "Missing commit/settling frames",
  );
  for (const phase of ["active", "commit"]) {
    const p = report.phases[phase];
    check(
      Number.isFinite(p.p95Ms) && Number.isFinite(p.maxMs),
      "Invalid " + phase + " latency",
    );
    check(p.over100 >= 0 && p.over100 <= p.count, "Invalid slow-frame count");
  }
  check(Number.isFinite(report.importDurationMs), "Invalid import duration");
  check(
    report.c39Attribution.traceAlignment === "aligned",
    "Unaligned compositor trace",
  );
}

export function summarizeStaticHeavy(matrices) {
  check(
    matrices.length >= 3,
    "Require at least three repeated browser matrices",
  );
  const sourceReport = matrices[0]?.get("static-3000-10-images");
  check(sourceReport, "No reference run");
  const source = {
    sha: sourceReport.baselineSha,
    browser: sourceReport.browser,
    platform: sourceReport.platform,
    arch: sourceReport.arch,
  };
  const variants = {};
  for (const name of Object.keys(targets)) {
    const reports = matrices.map((matrix) => {
      check(
        matrix.size === Object.keys(targets).length,
        "Missing static-media report",
      );
      const report = matrix.get(name);
      check(report, "Missing static-media scenario " + name);
      verify(report, name, source);
      return report;
    });
    const activeFrames = reports.reduce(
      (sum, report) => sum + report.phases.active.count,
      0,
    );
    const over100 = reports.reduce(
      (sum, report) => sum + report.phases.active.over100,
      0,
    );
    variants[name] = {
      runs: reports.length,
      activeFrames,
      enoughActiveFrames: activeFrames >= 200,
      medianActiveP95Ms: median(reports.map((r) => r.phases.active.p95Ms)),
      medianActiveMaxMs: median(reports.map((r) => r.phases.active.maxMs)),
      medianCommitP95Ms: median(reports.map((r) => r.phases.commit.p95Ms)),
      medianImportMs: median(reports.map((r) => r.importDurationMs)),
      over100,
      over100Rate: over100 / activeFrames,
    };
  }
  return {
    schemaVersion: 1,
    kind: "c39-static-heavy-representative",
    source,
    repeats: matrices.length,
    variants,
    interpretation:
      "Descriptive Chromium baseline only; four PNG and six JPEG, 3000–10000 strokes. Frame tails, pointer/eraser functionality, persistence and cross-device resource budgets require separate release checks.",
  };
}

async function main() {
  const [folder, output] = process.argv.slice(2);
  check(
    folder && output,
    "Usage: node scripts/c39/summarize-static-heavy.mjs output-dir summary.json",
  );
  const matrices = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
    matrices.push(
      parseStaticHeavyLog(
        await readFile(join(folder, "repeat-" + repeat + ".log"), "utf8"),
      ),
    );
  }
  const report = summarizeStaticHeavy(matrices);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.info("C39_STATIC_HEAVY_SUMMARY " + JSON.stringify(report));
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
