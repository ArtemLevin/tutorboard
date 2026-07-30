import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  assessSmartInkCalibrationGate,
  parseSmartInkCorpus,
} from "../../../../src/modules/smart-ink-spike/public.ts";

const fixtureRoot = join(
  process.cwd(),
  "tests",
  "fixtures",
  "smart-ink-corpus",
);
const evidenceRoot = join(fixtureRoot, "external-v2");

async function readJson(path) {
  const bytes = await readFile(path);
  return JSON.parse(
    path.endsWith(".gz")
      ? gunzipSync(bytes).toString("utf8")
      : bytes.toString("utf8"),
  );
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function withoutLatency(metrics) {
  const deterministic = structuredClone(metrics);
  delete deterministic.latencyMs;
  return deterministic;
}

describe("Phase 9 Smart Ink v2 independent evidence", () => {
  it("pins artifacts and has no development sample or group leakage", async () => {
    const manifest = await readJson(join(evidenceRoot, "manifest.json"));
    for (const artifact of manifest.artifacts) {
      expect(await sha256(join(evidenceRoot, artifact.path))).toBe(
        artifact.sha256,
      );
    }

    const holdout = parseSmartInkCorpus(
      await readJson(join(evidenceRoot, "holdout.seed-170731.json.gz")),
    );
    const development = await Promise.all(
      ["quickdraw.seed-90210.json.gz", "hds.seed-90210.json.gz"].map(
        async (path) =>
          parseSmartInkCorpus(
            await readJson(join(fixtureRoot, "external", path)),
          ),
      ),
    );
    const developmentIds = new Set(
      development.flatMap(({ samples }) => samples.map(({ id }) => id)),
    );
    const developmentGroups = new Set(
      development.flatMap(({ samples }) =>
        samples.map(({ metadata, id }) => metadata.sourceGroupId ?? id),
      ),
    );

    expect(holdout.samples).toHaveLength(360);
    expect(
      holdout.samples.filter(({ id }) => developmentIds.has(id)),
    ).toHaveLength(0);
    expect(
      holdout.samples.filter(({ id, metadata }) =>
        developmentGroups.has(metadata.sourceGroupId ?? id),
      ),
    ).toHaveLength(0);
    expect(
      new Set(holdout.samples.map(({ metadata }) => metadata.sourceGroupId))
        .size,
    ).toBe(257);
  });

  it("keeps the v2 result historical and pins the v3 regression", async () => {
    const holdout = parseSmartInkCorpus(
      await readJson(join(evidenceRoot, "holdout.seed-170731.json.gz")),
    );
    const historical = await readJson(
      join(evidenceRoot, "holdout-report.seed-170731.json"),
    );
    const regression = await readJson(
      join(fixtureRoot, "external-v3", "v2-regression-report.seed-170731.json"),
    );
    const actual = assessSmartInkCalibrationGate(holdout, regression.options);

    expect(historical.passed).toBe(false);
    expect(historical.failures).toEqual(["false-positive-rate:0.033333>0.02"]);
    expect(actual.eligible).toBe(true);
    expect(actual.passed).toBe(true);
    expect(actual.failures).toEqual([]);
    expect(withoutLatency(actual.metrics)).toEqual(
      withoutLatency(regression.metrics),
    );
  });
});
