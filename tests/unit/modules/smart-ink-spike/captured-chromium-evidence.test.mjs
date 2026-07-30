import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  assessSmartInkCalibrationGate,
  assessSmartInkProductionGate,
  parseSmartInkCorpus,
  smartInkRecognizerVersion,
} from "../../../../src/modules/smart-ink-spike/public.ts";

const evidenceRoot = join(
  process.cwd(),
  "tests",
  "fixtures",
  "smart-ink-corpus",
  "captured-chromium-v1",
);

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

function counts(corpus) {
  return Object.fromEntries(
    [
      "circle",
      "ellipse",
      "line",
      "negative",
      "rectangle",
      "square",
      "triangle",
    ].map((kind) => [
      kind,
      corpus.samples.filter(({ expectedKind }) => expectedKind === kind).length,
    ]),
  );
}

function withoutLatency(metrics) {
  const deterministic = structuredClone(metrics);
  delete deterministic.latencyMs;
  return deterministic;
}

describe("Phase 9 Smart Ink captured Chromium development evidence", () => {
  it("pins the uploaded corpus and its bounded anonymous metadata", async () => {
    const manifest = await readJson(join(evidenceRoot, "manifest.json"));
    for (const artifact of manifest.artifacts) {
      expect(await sha256(join(evidenceRoot, artifact.path))).toBe(
        artifact.sha256,
      );
    }

    const corpus = parseSmartInkCorpus(
      await readJson(join(evidenceRoot, "corpus.json.gz")),
    );
    expect(corpus.samples).toHaveLength(241);
    expect(counts(corpus)).toEqual(manifest.capture.classCounts);
    expect(new Set(corpus.samples.map(({ id }) => id)).size).toBe(241);
    expect(
      new Set(corpus.samples.map(({ metadata }) => metadata.browser)),
    ).toEqual(new Set(["chromium"]));
    expect(
      new Set(corpus.samples.map(({ metadata }) => metadata.deviceProfile)),
    ).toEqual(new Set(["windows-laptop"]));
    expect(
      new Set(corpus.samples.map(({ metadata }) => metadata.pointerType)),
    ).toEqual(new Set(["pen"]));
    expect(new Set(corpus.samples.map(({ provenance }) => provenance))).toEqual(
      new Set(["captured"]),
    );

    for (const sample of corpus.samples) {
      expect(Object.keys(sample).sort()).toEqual([
        "acceptableKinds",
        "expectedKind",
        "id",
        "metadata",
        "points",
        "provenance",
        "shouldPropose",
      ]);
      expect(Object.keys(sample.metadata).sort()).toEqual([
        "browser",
        "deviceProfile",
        "durationMs",
        "pointerType",
      ]);
      expect(
        sample.points.every((point) => Object.keys(point).length === 2),
      ).toBe(true);
    }
  });

  it("reproduces v4 metrics and keeps Firefox as a separate gate", async () => {
    const corpus = parseSmartInkCorpus(
      await readJson(join(evidenceRoot, "corpus.json.gz")),
    );
    const committed = await readJson(
      join(evidenceRoot, "development-report.v4.json"),
    );
    const actual = assessSmartInkCalibrationGate(
      corpus,
      committed.options,
      () => 0,
    );

    expect(smartInkRecognizerVersion).toBe(
      "tutorboard.smart-ink-geometric/0.4-spike",
    );
    expect(actual.failures).toEqual(committed.failures);
    expect(withoutLatency(actual.metrics)).toEqual(
      withoutLatency(committed.metrics),
    );
    expect(actual.metrics.falsePositiveRate).toBe(0);
    expect(actual.metrics.macroPrecision).toBe(0.964372);
    expect(actual.metrics.macroRecall).toBe(0.952591);
    expect(actual.metrics.specializedTop2Accuracy).toBe(1);
    expect(actual.metrics.unrecognizedRate).toBe(0.021127);

    const production = assessSmartInkProductionGate(
      corpus,
      committed.options,
      () => 0,
    );
    expect(production.eligible).toBe(false);
    expect(production.passed).toBe(false);
    expect(production.failures).toContain("captured-browser-missing:firefox");
  });
});
