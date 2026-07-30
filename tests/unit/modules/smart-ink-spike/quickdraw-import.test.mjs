import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  parseSmartInkCorpus,
  smartInkCorpusSchemaVersion,
} from "../../../../src/modules/smart-ink-spike/public.ts";

const execFileAsync = promisify(execFile);

function quickDrawRecord(keyId, word, points, recognized = true) {
  return JSON.stringify({
    drawing: [
      [
        points.map(([x]) => x),
        points.map(([, y]) => y),
        points.map(([, , timestamp]) => timestamp),
      ],
    ],
    key_id: keyId,
    recognized,
    word,
  });
}

describe("Phase 9 Quick, Draw! corpus importer", () => {
  it("reservoir-samples raw human trajectories and preserves provenance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tutorboard-quickdraw-"));
    try {
      const input = join(directory, "circle.ndjson");
      const output = join(directory, "corpus.json");
      const records = [
        quickDrawRecord("one", "circle", [
          [0, 10, 0],
          [10, 0, 12],
          [20, 10, 25],
          [10, 20, 40],
          [0, 10, 55],
        ]),
        quickDrawRecord("two", "circle", [
          [1, 11, 0],
          [11, 1, 10],
          [21, 11, 20],
          [11, 21, 30],
          [1, 11, 45],
        ]),
        quickDrawRecord("ignored-word", "square", [
          [0, 0, 0],
          [10, 10, 10],
        ]),
        quickDrawRecord(
          "ignored-unrecognized",
          "circle",
          [
            [0, 0, 0],
            [10, 10, 10],
          ],
          false,
        ),
      ];
      await writeFile(input, `${records.join("\n")}\n`, "utf8");

      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "scripts/import-quickdraw-corpus.mjs",
          "--input",
          `circle=${input}`,
          "--max-per-input",
          "1",
          "--seed",
          "123",
          "--output",
          output,
        ],
        { cwd: process.cwd() },
      );
      const corpus = parseSmartInkCorpus(
        JSON.parse(await readFile(output, "utf8")),
      );

      expect(corpus.schemaVersion).toBe(smartInkCorpusSchemaVersion);
      expect(corpus.samples).toHaveLength(1);
      expect(corpus.samples[0]).toMatchObject({
        acceptableKinds: ["circle", "ellipse"],
        expectedKind: "circle",
        metadata: {
          browser: "other",
          deviceProfile: "other-device",
          pointerType: "unknown",
          sourceDataset: "quickdraw",
          sourceGroupId: expect.stringMatching(
            /^quickdraw-group-[a-f0-9]{20}$/,
          ),
          traceOrigin: "recorded-trajectory",
        },
        provenance: "external-human",
        shouldPropose: true,
      });
      expect(corpus.samples[0].id).not.toContain("one");
      expect(corpus.samples[0].id).not.toContain("two");
      expect(stdout).toContain("circle: imported 1/2 eligible records");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("refuses to manufacture missing Quick, Draw! classes", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          "scripts/import-quickdraw-corpus.mjs",
          "--input",
          "ellipse=ellipse.ndjson",
          "--output",
          "unused.json",
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "do not relabel derived geometry as human",
      ),
    });
  });

  it("allows only reviewed mappings in official streaming mode", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          "scripts/import-quickdraw-corpus.mjs",
          "--official",
          "negative=circle",
          "--output",
          "unused.json",
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Unsupported official Quick, Draw! mapping",
      ),
    });
  });
});
