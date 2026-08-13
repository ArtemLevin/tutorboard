import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  evaluateSmartInkCorpus,
  parseSmartInkCorpus,
} from "../../../../src/modules/smart-ink-spike/public.ts";

const fixtureRoot = join(
  process.cwd(),
  "tests",
  "fixtures",
  "smart-ink-corpus",
);
const evidenceRoot = join(fixtureRoot, "external-v3");

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

function groupId(sample) {
  return sample.metadata.sourceGroupId ?? sample.id;
}

function withoutLatency(metrics) {
  const deterministic = structuredClone(metrics);
  delete deterministic.latencyMs;
  return deterministic;
}

describe("Phase 9 Smart Ink v3 independent negative evidence", () => {
  it("pins balanced artifacts with no v1 or v2 leakage", async () => {
    const manifest = await readJson(join(evidenceRoot, "manifest.json"));
    for (const artifact of manifest.artifacts) {
      expect(await sha256(join(evidenceRoot, artifact.path))).toBe(
        artifact.sha256,
      );
    }

    const holdout = parseSmartInkCorpus(
      await readJson(
        join(evidenceRoot, "negative-holdout.seed-260730.json.gz"),
      ),
    );
    const development = await Promise.all(
      [
        join(fixtureRoot, "external", "quickdraw.seed-90210.json.gz"),
        join(fixtureRoot, "external-v2", "holdout.seed-170731.json.gz"),
      ].map(async (path) => parseSmartInkCorpus(await readJson(path))),
    );
    const developmentIds = new Set(
      development.flatMap(({ samples }) => samples.map(({ id }) => id)),
    );
    const developmentGroups = new Set(
      development.flatMap(({ samples }) => samples.map(groupId)),
    );

    expect(holdout.samples).toHaveLength(240);
    expect(new Set(holdout.samples.map(groupId)).size).toBe(240);
    expect(
      holdout.samples.filter(({ id }) => developmentIds.has(id)),
    ).toHaveLength(0);
    expect(
      holdout.samples.filter((sample) =>
        developmentGroups.has(groupId(sample)),
      ),
    ).toHaveLength(0);
    expect(
      Object.fromEntries(
        ["squiggle", "star", "zigzag"].map((category) => [
          category,
          holdout.samples.filter(
            ({ metadata }) => metadata.sourceCategory === category,
          ).length,
        ]),
      ),
    ).toEqual({ squiggle: 80, star: 80, zigzag: 80 });
  });

  it("reproduces the point-free negative result except runtime latency", async () => {
    const holdout = parseSmartInkCorpus(
      await readJson(
        join(evidenceRoot, "negative-holdout.seed-260730.json.gz"),
      ),
    );
    const committed = await readJson(
      join(evidenceRoot, "negative-holdout-report.v5.seed-260730.json"),
    );
    const actual = evaluateSmartInkCorpus(holdout, committed.options, () => 0);
    const falsePositiveCount = Object.entries(
      actual.confusionMatrix.negative,
    ).reduce(
      (count, [kind, current]) =>
        kind === "unrecognized" || kind === "ambiguous"
          ? count
          : count + current,
      0,
    );

    expect(committed.passed).toBe(true);
    expect(committed.failures).toEqual([]);
    expect(falsePositiveCount).toBe(1);
    expect(actual.falsePositiveRate).toBe(0.004167);
    expect(withoutLatency(actual)).toEqual(withoutLatency(committed.metrics));
  });
});
