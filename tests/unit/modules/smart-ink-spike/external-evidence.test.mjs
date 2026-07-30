import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  calibrateSmartInkRecognizer,
  parseSmartInkCorpus,
  smartInkCorpusSchemaVersion,
} from "../../../../src/modules/smart-ink-spike/public.ts";

const evidenceRoot = join(
  process.cwd(),
  "tests",
  "fixtures",
  "smart-ink-corpus",
  "external",
);

async function readJson(path) {
  const bytes = await readFile(join(evidenceRoot, path));
  return JSON.parse(
    path.endsWith(".gz")
      ? gunzipSync(bytes).toString("utf8")
      : bytes.toString("utf8"),
  );
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(join(evidenceRoot, path)))
    .digest("hex");
}

function counts(corpus) {
  const result = {};
  for (const sample of corpus.samples) {
    result[sample.expectedKind] = (result[sample.expectedKind] ?? 0) + 1;
  }
  return result;
}

describe("Phase 9 committed external-human evidence", () => {
  it("matches the pinned source manifest and pseudonymized corpus contract", async () => {
    const manifest = await readJson("manifest.json");
    const corpusArtifacts = manifest.artifacts.filter(
      ({ classCounts }) => classCounts !== undefined,
    );

    for (const artifact of manifest.artifacts) {
      expect(await sha256(artifact.path)).toBe(artifact.sha256);
    }
    for (const artifact of corpusArtifacts) {
      const corpus = parseSmartInkCorpus(await readJson(artifact.path));
      expect(corpus.samples).toHaveLength(artifact.sampleCount);
      expect(counts(corpus)).toEqual(artifact.classCounts);
      for (const sample of corpus.samples) {
        expect(sample).toMatchObject({
          metadata: {
            browser: "other",
            deviceProfile: "other-device",
            pointerType: "unknown",
          },
          provenance: "external-human",
        });
        expect(sample.id).not.toMatch(/user\./);
        expect(sample.metadata.sourceGroupId).toMatch(
          /^(hds|quickdraw)-group-[a-f0-9]{20}$/,
        );
      }
    }
  });

  it("keeps the v1 report immutable while v2 uses the same group split", async () => {
    const quickDraw = parseSmartInkCorpus(
      await readJson("quickdraw.seed-90210.json.gz"),
    );
    const hds = parseSmartInkCorpus(await readJson("hds.seed-90210.json.gz"));
    const committed = await readJson("calibration-report.seed-90210.json");
    const actual = calibrateSmartInkRecognizer(
      parseSmartInkCorpus({
        samples: [...quickDraw.samples, ...hds.samples],
        schemaVersion: smartInkCorpusSchemaVersion,
      }),
      { calibrationRatio: 0.7, seed: 90210 },
    );

    expect(actual.eligible).toBe(true);
    expect(actual.passed).toBe(false);
    expect(committed.selectedOptions).toEqual({
      ambiguityMargin: 0.2,
      minimumConfidence: 0.6,
      sampleCount: 96,
    });
    expect(actual.selectedOptions).not.toEqual(committed.selectedOptions);
    expect(actual.split).toEqual(committed.split);
  });
});
