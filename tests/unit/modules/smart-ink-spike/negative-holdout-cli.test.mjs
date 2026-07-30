import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { smartInkCorpusSchemaVersion } from "../../../../src/modules/smart-ink-spike/public.ts";

const execFileAsync = promisify(execFile);

describe("Phase 9 Smart Ink negative holdout evaluator", () => {
  it("writes a point-free report for an attributed negative corpus", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "tutorboard-negative-holdout-"),
    );
    try {
      const input = join(directory, "negative.json");
      const output = join(directory, "report.json");
      await writeFile(
        input,
        `${JSON.stringify({
          samples: [
            {
              acceptableKinds: [],
              expectedKind: "negative",
              id: "quickdraw-negative-test",
              metadata: {
                browser: "other",
                deviceProfile: "other-device",
                durationMs: 20,
                pointerType: "unknown",
                sourceCategory: "squiggle",
                sourceDataset: "quickdraw",
                sourceGroupId: "quickdraw-group-00000000000000000001",
                traceOrigin: "recorded-trajectory",
              },
              points: [
                { x: 1, y: 1 },
                { x: 1, y: 1 },
              ],
              provenance: "external-human",
              shouldPropose: false,
            },
          ],
          schemaVersion: smartInkCorpusSchemaVersion,
        })}\n`,
        "utf8",
      );

      await execFileAsync(
        process.execPath,
        [
          "scripts/evaluate-smart-ink-negative-holdout.mjs",
          "--input",
          input,
          "--minimum-confidence",
          "0.34",
          "--ambiguity-margin",
          "0.04",
          "--minimum-negatives",
          "1",
          "--output",
          output,
          "--require-pass",
        ],
        { cwd: process.cwd() },
      );
      const report = JSON.parse(await readFile(output, "utf8"));

      expect(report).toMatchObject({
        failures: [],
        falsePositiveCount: 0,
        passed: true,
        recognizerVersion: "tutorboard.smart-ink-geometric/0.3-spike",
        schemaVersion: "tutorboard.smart-ink-negative-holdout-evaluation/0.1",
      });
      expect(JSON.stringify(report)).not.toContain("points");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
