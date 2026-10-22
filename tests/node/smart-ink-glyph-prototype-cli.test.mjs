// @vitest-environment node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  smartInkGlyphCorpusVersion,
  targetForGlyph,
} from "../../tools/smart-ink-glyph-corpus.mjs";

const command = "scripts/train-smart-ink-glyph-prototype.mjs";

function sample(id, writerId, deviceId, character, labelStatus = "reviewed") {
  return {
    id,
    writerId,
    deviceId,
    browser: "chromium",
    deviceProfile: "windows-desktop",
    pointerType: "pen",
    labelStatus,
    provenance: "captured",
    target: targetForGlyph("Latn", character),
    strokes: [
      {
        points: [
          { x: 1, y: 1, timeMs: 0, pressure: 0.5 },
          { x: character === "I" ? 1 : 40, y: 60, timeMs: 10, pressure: 0.5 },
        ],
      },
    ],
  };
}

function corpus(samples) {
  return { schemaVersion: smartInkGlyphCorpusVersion, samples };
}

async function withCorpusFiles(work) {
  const directory = await mkdtemp(join(tmpdir(), "smart-ink-glyph-cli-"));
  const files = {
    train: join(directory, "train.json"),
    calibration: join(directory, "calibration.json"),
    holdout: join(directory, "holdout.json"),
    model: join(directory, "model.json"),
    report: join(directory, "report.json"),
  };
  try {
    await writeFile(
      files.train,
      JSON.stringify(
        corpus([
          sample("sample-train-i", "writer-0001", "device-0001", "I"),
          sample("sample-train-l", "writer-0001", "device-0001", "L"),
        ]),
      ),
    );
    await writeFile(
      files.calibration,
      JSON.stringify(
        corpus([
          sample("sample-calibration-i", "writer-0002", "device-0002", "I"),
        ]),
      ),
    );
    await writeFile(
      files.holdout,
      JSON.stringify(
        corpus([sample("sample-holdout-l", "writer-0003", "device-0003", "L")]),
      ),
    );
    await work(files);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function invoke(files) {
  return spawnSync(
    process.execPath,
    [
      command,
      "--train",
      files.train,
      "--calibration",
      files.calibration,
      "--holdout",
      files.holdout,
      "--model",
      files.model,
      "--report",
      files.report,
    ],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
  );
}

describe("Smart Ink glyph prototype CLI", () => {
  it("trains only on independent reviewed examples and emits non-identifying model", async () => {
    await withCorpusFiles(async (files) => {
      const completed = invoke(files);
      expect(completed.status, completed.stderr).toBe(0);
      const modelText = await readFile(files.model, "utf8");
      const reportText = await readFile(files.report, "utf8");
      expect(modelText).toContain("tutorboard.smart-ink-glyph-prototype/1");
      expect(modelText).not.toContain("writer-");
      expect(modelText).not.toContain("device-");
      expect(modelText).not.toContain("points");
      const report = JSON.parse(reportText);
      expect(report).toMatchObject({
        calibrated: false,
        trainedClasses: 2,
        trainingSamples: 2,
        calibration: { status: "experimental-uncalibrated", glyphs: 1 },
        holdout: { status: "experimental-uncalibrated", glyphs: 1 },
      });
      expect(report.holdout.falseAcceptanceRate).toBeNull();
      const repeated = invoke(files);
      expect(repeated.status).not.toBe(0);
      expect(await readFile(files.model, "utf8")).toBe(modelText);
      expect(await readFile(files.report, "utf8")).toBe(reportText);
    });
  }, 40_000);

  it("rejects unreviewed input and partition leakage before writing output", async () => {
    await withCorpusFiles(async (files) => {
      await writeFile(
        files.calibration,
        JSON.stringify(
          corpus([
            sample(
              "sample-unreviewed",
              "writer-0002",
              "device-0002",
              "I",
              "unreviewed",
            ),
          ]),
        ),
      );
      const unreviewed = invoke(files);
      expect(unreviewed.status).not.toBe(0);
      expect(unreviewed.stderr).toContain("reviewed");
      await writeFile(
        files.calibration,
        JSON.stringify(
          corpus([sample("sample-overlap", "writer-0002", "device-0001", "I")]),
        ),
      );
      const leakage = invoke(files);
      expect(leakage.status).not.toBe(0);
      expect(leakage.stderr).toContain("leakage");
    });
  }, 40_000);
});
