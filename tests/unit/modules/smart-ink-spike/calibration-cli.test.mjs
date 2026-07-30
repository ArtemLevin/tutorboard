import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createSyntheticBenchmarkCorpus } from "./corpus-fixtures.ts";

const execFileAsync = promisify(execFile);

function externalCorpus() {
  const synthetic = createSyntheticBenchmarkCorpus();
  const positives = synthetic.samples
    .filter(({ expectedKind }) => expectedKind !== "negative")
    .flatMap((sample, kindIndex) =>
      Array.from({ length: 6 }, (_, index) => {
        const hds =
          sample.expectedKind === "ellipse" ||
          sample.expectedKind === "rectangle";
        const dataset = hds ? "hds" : "quickdraw";
        const group = (kindIndex * 100 + index).toString(16).padStart(16, "0");
        return {
          ...sample,
          id: `cli-${sample.expectedKind}-${index}`,
          metadata: {
            browser: "other",
            deviceProfile: "other-device",
            durationMs: hds ? 0 : 400,
            pointerType: "unknown",
            sourceDataset: dataset,
            sourceGroupId: `${dataset}-group-${group}`,
            traceOrigin: hds ? "raster-contour" : "recorded-trajectory",
          },
          provenance: "external-human",
        };
      }),
    );
  const negatives = synthetic.samples
    .filter(({ expectedKind }) => expectedKind === "negative")
    .map((sample, index) => ({
      ...sample,
      id: `cli-negative-${index}`,
      metadata: {
        browser: "other",
        deviceProfile: "other-device",
        durationMs: 500,
        pointerType: "unknown",
        sourceDataset: "quickdraw",
        sourceGroupId: `quickdraw-group-${(900 + index)
          .toString(16)
          .padStart(16, "0")}`,
        traceOrigin: "recorded-trajectory",
      },
      provenance: "external-human",
    }));
  return { ...synthetic, samples: [...positives, ...negatives] };
}

describe("Phase 9 Smart Ink calibration CLI", () => {
  it("writes a point-free calibration report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tutorboard-calibration-"));
    try {
      const input = join(directory, "corpus.json");
      const output = join(directory, "report.json");
      await writeFile(input, JSON.stringify(externalCorpus()), "utf8");

      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "scripts/calibrate-smart-ink-corpus.mjs",
          "--input",
          input,
          "--seed",
          "90210",
          "--minimum-per-class",
          "2",
          "--minimum-negatives",
          "10",
          "--output",
          output,
        ],
        { cwd: process.cwd() },
      );
      const serialized = await readFile(output, "utf8");
      const report = JSON.parse(serialized);

      expect(report.schemaVersion).toBe("tutorboard.smart-ink-calibration/0.1");
      expect(report.selectedOptions.minimumConfidence).toBeGreaterThan(0);
      expect(serialized).not.toContain('"points"');
      expect(stdout).toContain("Selected minimumConfidence=");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
