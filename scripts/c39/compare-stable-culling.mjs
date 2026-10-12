import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseProfileLog } from "./compare-profiles.mjs";

export const controlSha = "2110a8e03fe9adb836ffc1f470e35ff7be980323";
export const candidateSha = "9303cccd7b9b8857e49484bf0576cde72c4b04fa";
export const scenarios = [
  "static-3000-10-images",
  "static-5000-10-images",
  "static-10000-10-images",
  "static-10000-offscreen",
];
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function compareRuns(runs) {
  check(
    runs.length === 12 || runs.length === 4,
    "Expected 3 or 1 complete ABBA cycles",
  );
  const reference = runs[0].report;
  for (let index = 0; index < runs.length; index++) {
    const { role, report: r } = runs[index];
    check(
      role === (index % 4 === 0 || index % 4 === 3 ? "control" : "candidate"),
      "ABBA order mismatch",
    );
    check(
      r.baselineSha === (role === "control" ? controlSha : candidateSha),
      "Source SHA mismatch",
    );
    check(r.worktreeDirty === false, "Dirty production checkout");
    check(
      /^[a-f0-9]{40}$/u.test(r.harnessSha),
      "Missing immutable harness SHA",
    );
    for (const key of [
      "harnessSha",
      "scenario",
      "content",
      "browser",
      "platform",
      "arch",
      "node",
      "runtime",
      "fixtureSha256",
      "initialViewport",
      "finalViewport",
      "cameras",
      "initialPixels",
      "finalPixels",
      "traceEnabled",
    ])
      check(same(r[key], reference[key]), `${key} differs between runs`);
    check(
      r.content.pngCount === 4 &&
        r.content.jpegCount === 6 &&
        r.scenario.dpr === 2,
      "Static fixture mismatch",
    );
    check(/^[a-f0-9]{64}$/u.test(r.fixtureSha256), "Missing fixture hash");
    check(
      /^[a-f0-9]{64}$/u.test(r.initialPixels) &&
        r.initialPixels === r.finalPixels,
      "Pixel mismatch",
    );
    check(
      r.inputTimesMs.length === 18 && r.cameras.length === 19,
      "Input/camera loss",
    );
    r.cameras.forEach((camera, i) => {
      check(
        Math.abs(camera.zoom - (i % 2 ? 1.08 : 1)) < 1e-9,
        "Camera path mismatch",
      );
      check(
        Number.isFinite(camera.x) &&
          Number.isFinite(camera.y) &&
          Number.isInteger(camera.visible),
        "Invalid camera",
      );
    });
    const active = r.phases.active;
    check(
      Number.isFinite(active.p95Ms) && active.p95Ms > 0 && active.count > 0,
      "Invalid active phase",
    );
    check(
      Number.isInteger(active.over100) &&
        active.over100 >= 0 &&
        active.over100 <= active.count,
      "Invalid slow-frame count",
    );
  }
  const pairs = [];
  for (let i = 0; i < runs.length; i += 4) {
    for (const [a, b] of [
      [runs[i].report, runs[i + 1].report],
      [runs[i + 3].report, runs[i + 2].report],
    ]) {
      const wall = (r) => r.commitObservedAtMs - r.inputTimesMs[0];
      pairs.push({
        improvement: 1 - b.phases.active.p95Ms / a.phases.active.p95Ms,
        over100RateDelta:
          b.phases.active.over100 / b.phases.active.count -
          a.phases.active.over100 / a.phases.active.count,
        wallTimeDeltaMs: wall(b) - wall(a),
        commitP95DeltaMs:
          a.phases.commit.count && b.phases.commit.count
            ? b.phases.commit.p95Ms - a.phases.commit.p95Ms
            : null,
        firstFrameDeltaMs:
          b.gaps.find((g) => g.endMs >= b.inputTimesMs[0])?.durationMs -
          a.gaps.find((g) => g.endMs >= a.inputTimesMs[0])?.durationMs,
      });
    }
  }
  const blocks = [];
  for (let i = 0; i < pairs.length; i += 2)
    blocks.push((pairs[i].improvement + pairs[i + 1].improvement) / 2);
  const bootstrap = [];
  // Resample independent ABBA blocks, never individual frames. With three
  // blocks the interval is deliberately coarse; preserve every observation.
  for (const a of blocks)
    for (const b of blocks)
      for (const c of blocks) bootstrap.push((a + b + c) / 3);
  bootstrap.sort((a, b) => a - b);
  const byRole = (role) => {
    const reports = runs.filter((r) => r.role === role).map((r) => r.report);
    const count = reports.reduce((sum, r) => sum + r.phases.active.count, 0);
    return {
      runP95Ms: reports.map((r) => r.phases.active.p95Ms),
      medianP95Ms: median(reports.map((r) => r.phases.active.p95Ms)),
      activeFrames: count,
      over100Rate:
        reports.reduce((sum, r) => sum + r.phases.active.over100, 0) / count,
      wallTimesMs: reports.map((r) => r.commitObservedAtMs - r.inputTimesMs[0]),
      commitP95Ms: reports.map((r) => r.phases.commit.p95Ms),
    };
  };
  const improvement = median(pairs.map((p) => p.improvement));
  const heavy =
    reference.scenario.name === scenarios[1] ||
    reference.scenario.name === scenarios[2];
  const latencyGate = heavy
    ? improvement >= 0.2 &&
      median(pairs.map((p) => p.over100RateDelta)) < 0 &&
      median(pairs.map((p) => p.wallTimeDeltaMs)) <= 0
      ? "PASS"
      : "NO-GO"
    : improvement >= -0.1
      ? "PASS"
      : "NO-GO";
  return {
    scenario: reference.scenario.name,
    traceEnabled: reference.traceEnabled,
    browser: reference.browser,
    runtime: reference.runtime,
    fixtureSha256: reference.fixtureSha256,
    source: {
      control: controlSha,
      candidate: candidateSha,
      harness: reference.harnessSha,
    },
    cycles: blocks.length,
    control: byRole("control"),
    candidate: byRole("candidate"),
    pairedMedianImprovement: improvement,
    blockMeanImprovements: blocks,
    blockBootstrap95: [
      bootstrap[Math.floor(bootstrap.length * 0.025)],
      bootstrap[Math.ceil(bootstrap.length * 0.975) - 1],
    ],
    pairedMedianOver100RateDelta: median(pairs.map((p) => p.over100RateDelta)),
    pairedMedianWallTimeDeltaMs: median(pairs.map((p) => p.wallTimeDeltaMs)),
    pairs,
    latencyGate,
    interpretation:
      "Latency screening only. GO also requires independent replication, hit/data, memory, pen and exact-head CI gates. Trace-on results are diagnostics.",
  };
}

async function main() {
  const root = process.argv[2];
  check(root, "Usage: compare-stable-culling.mjs results-directory");
  const summaries = [];
  for (const mode of ["off", "on"]) {
    for (const scenario of scenarios) {
      const runs = [];
      for (let cycle = 1; cycle <= (mode === "off" ? 3 : 1); cycle++) {
        for (let position = 1; position <= 4; position++) {
          const role =
            position === 1 || position === 4 ? "control" : "candidate";
          const log = await readFile(
            `${root}/${mode}-${cycle}-${position}-${role}.log`,
            "utf8",
          );
          const report = parseProfileLog(log, scenario);
          check(report.traceEnabled === (mode === "on"), "Trace mode mismatch");
          runs.push({ role, report });
        }
      }
      summaries.push(compareRuns(runs));
    }
  }
  await writeFile(
    `${root}/comparison.json`,
    JSON.stringify(summaries, null, 2) + "\n",
  );
  console.log("C39_PAIRED_SUMMARY " + JSON.stringify(summaries));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
