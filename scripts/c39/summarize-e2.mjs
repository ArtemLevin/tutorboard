#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const marker = "C39_REPRESENTATIVE_BASELINE ";
const variants = {
  "e2-dpr2-png-only": { gifs: 0, dpr: 2, layers: 1, animated: 0 },
  "e2-dpr2-two-runs": { gifs: 4, dpr: 2, layers: 2, animated: 1 },
  "e2-dpr2-five-runs": { gifs: 4, dpr: 2, layers: 5, animated: 2 },
  "e2-dpr2-fallback": { gifs: 4, dpr: 2, layers: 1, animated: 0 },
  "e2-dpr2-fallback-untraced": {
    gifs: 4, dpr: 2, layers: 1, animated: 0, untraced: true,
  },
  "e2-dpr2-fallback-warm": { gifs: 4, dpr: 2, layers: 1, animated: 0 },
  "e2-dpr1-two-runs": { gifs: 4, dpr: 1, layers: 2, animated: 1 },
  "e2-dpr1-fallback": { gifs: 4, dpr: 1, layers: 1, animated: 0 },
};

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
function finite(value, label) {
  ensure(typeof value === "number" && Number.isFinite(value), "Invalid " + label);
  return value;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  ensure(sorted.length > 0, "Empty median input");
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}
function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function parseE2RunLog(log) {
  const found = new Map();
  for (const line of log.split(/\r?\n/u)) {
    const index = line.indexOf(marker);
    if (index < 0) continue;
    const report = JSON.parse(line.slice(index + marker.length));
    if (report.experiment !== "C3.9-E2") continue;
    const name = report.scenario?.name;
    ensure(Object.hasOwn(variants, name), "Unexpected C3.9-E2 variant " + name);
    ensure(!found.has(name), "Duplicate E2 result " + name);
    found.set(name, report);
  }
  ensure(found.size === Object.keys(variants).length, "Incomplete E2 scenario matrix");
  return found;
}

function validateReport(report, name, source) {
  const expected = variants[name];
  ensure(report.schemaVersion === 1, "Invalid report schema");
  ensure(report.browser === source.browser, "Browser versions differ");
  ensure(report.baselineSha === source.baselineSha, "Source revision differs");
  ensure(report.platform === source.platform && report.arch === source.arch, "Runner platform differs");
  ensure(report.scenario.strokes === 3000 && report.scenario.visibleStrokes === 800, "Stroke fixture mismatch");
  ensure(report.scenario.gifs === expected.gifs && report.scenario.dpr === expected.dpr, "Scenario parameters differ");
  ensure(report.content.objects === 3010 && report.content.pngCount === 10 - expected.gifs, "Image fixture mismatch");
  ensure(report.content.realGifFrames === (expected.gifs ? 4 : 0), "GIF fixture mismatch");
  ensure(report.before.layers === expected.layers && report.after.layers === expected.layers, "Paint-run layer contract changed");
  ensure(report.before.animatedLayers === expected.animated, "Animated paint-run contract changed");
  ensure(report.traceEnabled === !expected.untraced, "Trace status mismatch");
  ensure(Array.isArray(report.inputTimesMs) && report.inputTimesMs.length === 18, "Missing wheel events");
  ensure(Number.isInteger(report.phases.active.count) && report.phases.active.count > 0, "Missing active frames");
  finite(report.phases.active.p95Ms, "active p95");
  finite(report.phases.active.maxMs, "active max");
  finite(report.phases.commit.p95Ms, "commit p95");
  ensure(Number.isInteger(report.phases.active.over100), "Invalid >100ms count");
  const attribution = report.c39Attribution;
  if (!expected.untraced) {
    ensure(attribution.traceAlignment === "aligned", "CDP clocks are not aligned");
    ensure(Array.isArray(attribution.frames), "Missing top slow frames");
  } else {
    ensure(attribution.traceAlignment === "unavailable", "Untraced scenario recorded CDP");
    ensure(attribution.jsEventCount === 0, "Untraced scenario collected JS events");
  }
}

const slowEventPresent = (frame, predicate) =>
  (frame.chromiumEvents ?? []).some(predicate);
const jsEventPresent = (frame, kind) =>
  (frame.jsEvents ?? []).some((event) => event.kind === kind);

function summarizeOneVariant(reports) {
  const gaps = reports.flatMap((report) => report.gaps);
  const frames = reports.flatMap((report) => report.c39Attribution.frames);
  const over100 = reports.reduce((sum, report) => sum + report.phases.active.over100, 0);
  const activeFrames = reports.reduce((sum, report) => sum + report.phases.active.count, 0);
  const withLongLayerUpdate = frames.filter((frame) =>
    slowEventPresent(frame, (event) =>
      event.name === "LayerTreeHost::DoUpdateLayers" && event.durationMs >= 25
    )
  ).length;
  const withLongDraw = frames.filter((frame) =>
    slowEventPresent(frame, (event) =>
      event.name === "DirectRenderer::DrawFrame" && event.durationMs >= 25
    )
  ).length;
  return {
    runs: reports.length,
    activeFrames,
    activeMedianRunP95Ms: median(reports.map((report) => report.phases.active.p95Ms)),
    activeMedianRunMaxMs: median(reports.map((report) => report.phases.active.maxMs)),
    activeOver100Rate: rate(over100, activeFrames),
    commitMedianRunP95Ms: median(reports.map((report) => report.phases.commit.p95Ms)),
    slowFramesSampled: frames.length,
    slowFramesWithLayerUpdate25: withLongLayerUpdate,
    slowFramesWithDrawFrame25: withLongDraw,
    slowFramesWithViewportPersist: frames.filter((frame) =>
      jsEventPresent(frame, "wheel-viewport-persist")
    ).length,
    slowFrameMaxGapMs: frames.length
      ? Math.max(...frames.map((frame) => frame.gapMs))
      : null,
    allGapMaxMs: Math.max(...gaps.map((frame) => frame.durationMs)),
  };
}

/** Descriptive same-runner factor comparisons; layer and GIF ordering alter pixels. */
export function summarizeE2Runs(runMatrices) {
  ensure(Array.isArray(runMatrices) && runMatrices.length >= 4, "At least four repeat matrices required");
  const names = Object.keys(variants);
  const first = runMatrices[0]?.get("e2-dpr2-fallback");
  ensure(first, "Missing primary reference");
  const source = { browser: first.browser, baselineSha: first.baselineSha, platform: first.platform, arch: first.arch };
  const byName = new Map(names.map((name) => [name, []]));
  for (const matrix of runMatrices) {
    ensure(matrix.size === names.length, "Incomplete matrix");
    for (const name of names) {
      const report = matrix.get(name);
      ensure(report, "Missing scenario " + name);
      validateReport(report, name, source);
      byName.get(name).push(report);
    }
  }
  const variantsSummary = Object.fromEntries(
    names.map((name) => [name, summarizeOneVariant(byName.get(name))])
  );
  const pairedControls = [
    ["e2-dpr2-two-runs", "e2-dpr2-fallback", "2-runs vs >6 runs, same content"],
    ["e2-dpr2-five-runs", "e2-dpr2-fallback", "5-runs vs >6 runs, same content"],
    ["e2-dpr2-png-only", "e2-dpr2-fallback", "0 GIF vs 4 GIF; image kind changes"],
    ["e2-dpr2-fallback-untraced", "e2-dpr2-fallback", "tracing OFF vs ON"],
    ["e2-dpr2-fallback-warm", "e2-dpr2-fallback", "opportunistic warm vs cold idle prewarm"],
    ["e2-dpr1-fallback", "e2-dpr2-fallback", "DPR1 vs DPR2"],
  ].map(([control, candidate, comparison]) => ({
    comparison,
    control,
    candidate,
    medianRepeatDeltaActiveP95Ms: median(byName.get(candidate).map(
      (report, index) => report.phases.active.p95Ms - byName.get(control)[index].phases.active.p95Ms
    )),
    meanRepeatDeltaActiveP95Ms: mean(byName.get(candidate).map(
      (report, index) => report.phases.active.p95Ms - byName.get(control)[index].phases.active.p95Ms
    )),
  }));
  return {
    schemaVersion: 1,
    kind: "c39-e2-compositor-isolation",
    repeats: runMatrices.length,
    source,
    variants: variantsSummary,
    pairedControls,
    interpretation: "Factor-isolation diagnostic only. Do not claim causal GPU improvements without targeted intervention, matched pixels, repeatability and functional release checks.",
  };
}

async function main() {
  const [directory, outputFile] = process.argv.slice(2);
  ensure(directory && outputFile, "Usage: node scripts/c39/summarize-e2.mjs results-dir summary.json");
  const matrices = [];
  for (let iteration = 1; iteration <= 4; iteration++) {
    const log = await readFile(join(directory, "iteration-" + iteration + ".log"), "utf8");
    matrices.push(parseE2RunLog(log));
  }
  const summary = summarizeE2Runs(matrices);
  await writeFile(outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.info("C39_E2_ISOLATION_SUMMARY " + JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
