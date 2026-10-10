import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const marker = "C39_REPRESENTATIVE_BASELINE ";
const arms = [
  "cold-cache-5000-control",
  "cold-cache-5000-cache",
  "cold-cache-10000-control",
  "cold-cache-10000-cache",
];
const check = (okay, message) => { if (!okay) throw new Error(message); };
const median = (series) => {
  check(series.length > 0, "Missing metric samples");
  const sorted = [...series].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function parseColdCacheRun(log) {
  const found = new Map();
  for (const line of log.split(/\r?\n/u)) {
    const idx = line.indexOf(marker);
    if (idx < 0) continue;
    const item = JSON.parse(line.slice(idx + marker.length));
    if (item.experiment !== "C3.9-COLD-CACHE") continue;
    check(arms.includes(item.scenario?.name), "Unexpected cache A/B scenario");
    check(!found.has(item.scenario.name), "Duplicate cache A/B scenario");
    found.set(item.scenario.name, item);
  }
  check(found.size === arms.length, "Incomplete cold-cache A/B matrix");
  return found;
}

function verify(item, name, expectedSource) {
  check(item.schemaVersion === 1, "Schema version drift");
  check(item.baselineSha === expectedSource.sha, "Mixed source SHA");
  check(item.browser === expectedSource.browser && item.platform === expectedSource.platform, "Mixed browser/host");
  check(item.arch === expectedSource.arch, "Mixed machine architecture");
  const strokes = name.includes("10000") ? 10000 : 5000;
  const cache = name.endsWith("-cache");
  check(item.scenario.strokes === strokes && item.scenario.visibleStrokes === strokes * 0.8, "Ink fixture drift");
  check(item.scenario.cold === true && item.scenario.dpr === 2 && item.scenario.gifs === 0, "Unexpected GIF/cache/DPR scene");
  check(item.scenario.coldCacheAB === (cache ? "cache" : "control"), "Wrong intervention arm");
  check(item.content.objects === strokes + 10, "Document object count drift");
  check(item.content.pngCount === 4 && item.content.jpegCount === 6, "JPEG/PNG fixture drift");
  check(item.loadMode === "indexeddb-revision-restore", "Incorrect large-board load");
  check(item.before.layers === 1 && item.after.layers === 1 && item.after.animatedLayers === 0, "Unexpected layer topology");
  check(item.wheelInkCache !== undefined, "Wheel cache diagnostics missing");
  check(Number.isInteger(item.wheelInkCache.builds) && item.wheelInkCache.builds >= 0, "Invalid cache build counter");
  check(Number.isFinite(item.wheelInkCache.lastWheelBeginMs), "Missing wheel begin timing");
  check(
    item.wheelInkCache.skippedColdBuild === !cache,
    "Cold-cache intervention was not actually applied"
  );
  check(cache ? item.wheelInkCache.builds > 0 && item.wheelInkCache.lastBuildPixels > 0 : item.wheelInkCache.builds === 0,
    "Cache arm did not rasterize expected ink, or control unexpectedly cached"
  );
  check(Array.isArray(item.inputTimesMs) && item.inputTimesMs.length === 18, "Missing wheel inputs");
  check(item.phases.active.count > 0 && Number.isFinite(item.phases.active.p95Ms), "Invalid active sample");
  check(item.phases.commit.count > 0 && Number.isFinite(item.phases.commit.p95Ms), "Invalid commit sample");
}

export function summarizeColdCachePaired(matrices) {
  check(matrices.length >= 4, "At least four matched matrix repeats required");
  const first = matrices[0]?.get("cold-cache-5000-control");
  check(first, "Missing reference");
  const expectedSource = { sha: first.baselineSha, browser: first.browser, platform: first.platform, arch: first.arch };
  for(const matrix of matrices) {
    check(matrix.size === arms.length, "Incomplete replicate");
    for(const name of arms) {
      const item = matrix.get(name);
      check(item, "Missing replicate arm: " + name);
      verify(item, name, expectedSource);
    }
  }
  const summary = {};
  for(const strokes of [5000, 10000]) {
    const control = matrices.map(m => m.get(`cold-cache-${strokes}-control`));
    const candidate = matrices.map(m => m.get(`cold-cache-${strokes}-cache`));
    const controlFrames = control.reduce((n, r) => n + r.phases.active.count, 0);
    const cacheFrames = candidate.reduce((n, r) => n + r.phases.active.count, 0);
    summary[strokes] = {
      control: {
        activeFrames: controlFrames,
        activeP95Ms: median(control.map(r => r.phases.active.p95Ms)),
        activeMaxMs: median(control.map(r => r.phases.active.maxMs)),
        activeOver100Rate: control.reduce((n,r) => n+r.phases.active.over100,0)/controlFrames,
        commitP95Ms: median(control.map(r=>r.phases.commit.p95Ms)),
      },
      cached: {
        activeFrames: cacheFrames,
        activeP95Ms: median(candidate.map(r => r.phases.active.p95Ms)),
        activeMaxMs: median(candidate.map(r => r.phases.active.maxMs)),
        activeOver100Rate: candidate.reduce((n,r) => n+r.phases.active.over100,0)/cacheFrames,
        commitP95Ms: median(candidate.map(r=>r.phases.commit.p95Ms)),
        coldBuildPixels: median(candidate.map(r=>r.wheelInkCache.lastBuildPixels)),
        coldBeginMs: median(candidate.map(r=>r.wheelInkCache.lastWheelBeginMs)),
      },
      medianPairedDeltaP95Ms: median(candidate.map((r,i)=>r.phases.active.p95Ms - control[i].phases.active.p95Ms)),
      adequateFrames: controlFrames >= 200 && cacheFrames >= 200,
    };
  }
  return {
    schemaVersion:1,
    kind:"c39-cold-ink-cache-ab",
    repeats: matrices.length,
    source: expectedSource,
    metrics: summary,
    note:"Test-only same document, same order, same DPR2, unchanged 4 PNG+6 JPEG, bounded cache intervention. Synchronous first-frame cost must be weighed against subsequent active/commit frame latency and resource cleanup before any production adoption.",
  };
}

async function main() {
  const [directory, output] = process.argv.slice(2);
  check(directory && output, "Usage: node scripts/c39/summarize-cold-cache.mjs DIR OUTPUT");
  const matrices = [];
  for (let iteration=1; iteration<=4; iteration++) {
    matrices.push(parseColdCacheRun(await readFile(join(directory, `repeat-${iteration}.log`),"utf8")));
  }
  const result = summarizeColdCachePaired(matrices);
  await writeFile(output, JSON.stringify(result,null,2)+"\n","utf8");
  console.info("C39_COLD_CACHE_AB_SUMMARY "+JSON.stringify(result));
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error); process.exitCode=1;});
}
