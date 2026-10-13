#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const marker = "C39_REPRESENTATIVE_BASELINE ";
const scenarios = ["static-5000-10-images", "static-10000-10-images"];

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  assert(sorted.length > 0, "Missing numerical observations");
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function reportsFromLog(log) {
  const found = new Map();
  for (const line of log.split(/\r?\n/u)) {
    const index = line.indexOf(marker);
    if (index < 0) continue;
    const report = JSON.parse(line.slice(index + marker.length));
    const name = report.scenario?.name;
    if (!scenarios.includes(name)) continue;
    assert(!found.has(name), "Duplicate profile: " + name);
    found.set(name, report);
  }
  for (const name of scenarios) {
    assert(found.has(name), "Missing profile: " + name);
  }
  return found;
}

export function compareBoundedInkRuns(entries) {
  assert(
    entries.length > 0 && entries.length % 4 === 0,
    "Expected complete ABBA cycles",
  );
  const baselineRole = "control,candidate,candidate,control";
  const output = { schemaVersion: 1, cycles: entries.length / 4, scenes: {} };
  for (const name of scenarios) {
    const pairs = [];
    let reference = null;
    let browserVersion = null;
    const sourceByRole = new Map();
    for (let offset = 0; offset < entries.length; offset += 4) {
      const cycle = entries.slice(offset, offset + 4);
      assert(
        cycle.map((item) => item.role).join(",") === baselineRole,
        "Unexpected ABBA run order",
      );
      for (const entry of cycle) {
        const report = entry.reports.get(name);
        assert(report !== undefined, "Missing report");
        assert(
          /^[a-f0-9]{40}$/u.test(entry.sha) && report.baselineSha === entry.sha,
          "Source SHA mismatch",
        );
        if (reference === null) {
          reference = report;
          browserVersion = report.browser;
        } else {
          assert(report.browser === browserVersion, "Browser version mismatch");
          assert(
            JSON.stringify(report.scenario) ===
              JSON.stringify(reference.scenario) &&
              JSON.stringify(report.content) ===
                JSON.stringify(reference.content),
            "Fixture mismatch",
          );
          assert(
            JSON.stringify(report.before) ===
              JSON.stringify(reference.before) &&
              JSON.stringify(report.after) === JSON.stringify(reference.after),
            "Scene/layer state mismatch",
          );
        }
        assert(
          report.inputTimesMs?.length === 18,
          "Missing native wheel input sequence",
        );
        const old = sourceByRole.get(entry.role);
        assert(old === undefined || old === entry.sha, "Role SHA drift");
        sourceByRole.set(entry.role, entry.sha);
      }
      for (const [a, b] of [
        [cycle[0], cycle[1]],
        [cycle[3], cycle[2]],
      ]) {
        const control = a.reports.get(name).phases.active;
        const candidate = b.reports.get(name).phases.active;
        assert(control.p95Ms > 0 && candidate.p95Ms > 0, "Invalid p95");
        pairs.push({
          controlP95Ms: control.p95Ms,
          candidateP95Ms: candidate.p95Ms,
          improvementPercent: 100 * (1 - candidate.p95Ms / control.p95Ms),
          over100RateDelta:
            candidate.over100 / candidate.count -
            control.over100 / control.count,
        });
      }
    }
    const pairedImprovement = median(
      pairs.map((pair) => pair.improvementPercent),
    );
    const over100RateDelta = median(pairs.map((pair) => pair.over100RateDelta));
    output.scenes[name] = {
      controlSha: sourceByRole.get("control"),
      candidateSha: sourceByRole.get("candidate"),
      chromium: browserVersion,
      pairs,
      pairedImprovementPercent: pairedImprovement,
      medianOver100RateDelta: over100RateDelta,
      performanceGo: pairedImprovement >= 20 && over100RateDelta <= 0,
    };
  }
  output.performanceGo = scenarios.every(
    (name) => output.scenes[name].performanceGo,
  );
  output.caveats =
    "Runner-specific diagnostic. Pixel-hash parity, memory, long soak and correctness gates remain independent.";
  return output;
}

async function main() {
  const [manifest, output] = process.argv.slice(2);
  assert(manifest && output, "Expected manifest path and output JSON path");
  const rows = (await readFile(manifest, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  const entries = [];
  for (const row of rows) {
    assert(row.role === "control" || row.role === "candidate", "Invalid role");
    entries.push({
      ...row,
      reports: reportsFromLog(await readFile(row.log, "utf8")),
    });
  }
  const result = compareBoundedInkRuns(entries);
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.info("C39_BOUNDED_INK_ABBA " + JSON.stringify(result));
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
