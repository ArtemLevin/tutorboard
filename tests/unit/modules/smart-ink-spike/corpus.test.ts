import { describe, expect, it } from "vitest";

import {
  assessSmartInkCalibrationGate,
  assessSmartInkProductionGate,
  assertSmartInkCorpus,
  evaluateSmartInkCorpus,
  parseSmartInkCorpus,
  smartInkCorpusSchemaVersion,
  type SmartInkCorpus,
} from "../../../../src/modules/smart-ink-spike/public";
import { createSyntheticBenchmarkCorpus } from "./corpus-fixtures";

describe("Phase 9 Smart Ink corpus benchmark", () => {
  it("evaluates positive and negative samples with a deterministic matrix", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    let clock = 0;
    const metrics = evaluateSmartInkCorpus(corpus, {}, () => {
      clock += 0.5;
      return clock;
    });

    expect(metrics.sampleCount).toBe(66);
    expect(metrics.positiveCount).toBe(6);
    expect(metrics.negativeCount).toBe(60);
    expect(metrics.confusionMatrix.circle.circle).toBe(1);
    expect(metrics.confusionMatrix.negative.unrecognized).toBeGreaterThan(0);
    expect(metrics.latencyMs).toEqual({ p50: 0.5, p95: 0.5, p99: 0.5 });
    expect(metrics.macroPrecision).toBeGreaterThanOrEqual(0.94);
    expect(metrics.falsePositiveRate).toBeLessThanOrEqual(0.02);
    expect(metrics.specializedTop2Accuracy).toBeGreaterThanOrEqual(0.98);
    console.info(
      `Smart Ink synthetic baseline: precision=${metrics.macroPrecision.toFixed(3)}, ` +
        `negative FPR=${metrics.falsePositiveRate.toFixed(3)}, ` +
        `top-2=${metrics.specializedTop2Accuracy.toFixed(3)}`,
    );
  });

  it("does not let synthetic fixtures unlock the production gate", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const assessment = assessSmartInkProductionGate(corpus);

    expect(assessment.eligible).toBe(false);
    expect(assessment.passed).toBe(false);
    expect(assessment.metrics.sampleCount).toBe(0);
    expect(assessment.failures).toContain("captured-line:0/40");
    expect(assessment.failures).toContain("captured-negative:0/60");
    expect(assessment.failures).toContain("captured-browser-missing:chromium");
    expect(assessment.failures).toContain("captured-browser-missing:firefox");
  });

  it("does not count ambiguous candidates as automatic predictions", () => {
    const metrics = evaluateSmartInkCorpus(createSyntheticBenchmarkCorpus(), {
      ambiguityMargin: 1,
      minimumConfidence: 0,
    });

    expect(metrics.ambiguityRate).toBe(1);
    expect(metrics.macroRecall).toBe(0);
    expect(metrics.falsePositiveRate).toBe(0);
    expect(metrics.confusionMatrix.circle.ambiguous).toBe(1);
    expect(metrics.confusionMatrix.negative.ambiguous).toBe(60);
  });

  it("rejects malformed or mislabeled corpus samples", () => {
    const malformed = {
      samples: [
        {
          acceptableKinds: ["line"],
          expectedKind: "negative",
          id: "bad-negative",
          metadata: {
            browser: "other",
            deviceProfile: "synthetic-fixture",
            durationMs: 10,
            pointerType: "mouse",
          },
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          provenance: "synthetic",
          shouldPropose: true,
        },
      ],
      schemaVersion: smartInkCorpusSchemaVersion,
    } as SmartInkCorpus;

    expect(() => assertSmartInkCorpus(malformed)).toThrow(
      "must not propose a primitive",
    );
  });

  it("rejects unsupported corpus schema versions", () => {
    const corpus = {
      samples: [],
      schemaVersion: "tutorboard.smart-ink-corpus/9.9",
    } as unknown as SmartInkCorpus;

    expect(() => assertSmartInkCorpus(corpus)).toThrow(
      "Unsupported Smart Ink corpus schema",
    );
  });

  it("runtime-validates imported coordinates and metadata", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const serialized = JSON.stringify(corpus);

    expect(parseSmartInkCorpus(JSON.parse(serialized))).toEqual(corpus);

    const invalid = JSON.parse(serialized) as {
      samples: { points: { x: unknown; y: number }[] }[];
    };
    invalid.samples[0]!.points[0]!.x = "not-a-coordinate";
    expect(() => parseSmartInkCorpus(invalid)).toThrow(
      "contains invalid coordinates",
    );
  });

  it("rejects misleading alternatives and free-form device metadata", () => {
    const corpus = structuredClone(createSyntheticBenchmarkCorpus());
    const sample = corpus.samples[0]!;

    const invalidAlternative = {
      ...corpus,
      samples: [
        { ...sample, acceptableKinds: [sample.expectedKind, "triangle"] },
        ...corpus.samples.slice(1),
      ],
    };
    expect(() => parseSmartInkCorpus(invalidAlternative)).toThrow(
      "invalid class alternative",
    );

    const invalidDevice = {
      ...corpus,
      samples: [
        {
          ...sample,
          metadata: { ...sample.metadata, deviceProfile: "personal-name" },
        },
        ...corpus.samples.slice(1),
      ],
    };
    expect(() => parseSmartInkCorpus(invalidDevice)).toThrow(
      "invalid deviceProfile",
    );

    const capturedWithSyntheticMetadata = {
      ...corpus,
      samples: [{ ...sample, provenance: "captured" }],
    };
    expect(() => parseSmartInkCorpus(capturedWithSyntheticMetadata)).toThrow(
      "cannot use synthetic device metadata",
    );
  });

  it("bounds imported corpus and per-sample point counts", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const oversizedSample = {
      ...corpus.samples[0]!,
      points: Array.from({ length: 4_097 }, (_, index) => ({
        x: index,
        y: 0,
      })),
    };
    expect(() =>
      parseSmartInkCorpus({ ...corpus, samples: [oversizedSample] }),
    ).toThrow("unsupported point count");

    expect(() =>
      parseSmartInkCorpus({
        ...corpus,
        samples: Array.from({ length: 1_001 }, (_, index) => ({
          ...corpus.samples[0]!,
          id: `bounded-${index}`,
        })),
      }),
    ).toThrow("exceeds 1000 samples");
  });

  it("excludes synthetic samples from production-gate metrics", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const capturedLine = {
      ...corpus.samples.find(({ expectedKind }) => expectedKind === "line")!,
      id: "captured-line-one",
      metadata: {
        browser: "chromium" as const,
        deviceProfile: "windows-laptop" as const,
        durationMs: 300,
        pointerType: "mouse" as const,
      },
      provenance: "captured" as const,
    };
    const mixed = { ...corpus, samples: [...corpus.samples, capturedLine] };

    const assessment = assessSmartInkProductionGate(mixed);

    expect(assessment.metrics.sampleCount).toBe(1);
    expect(assessment.metrics.positiveCount).toBe(1);
  });

  it("accepts bounded external-human metadata without treating it as browser capture", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const circle = corpus.samples.find(
      ({ expectedKind }) => expectedKind === "circle",
    )!;
    const external = {
      ...circle,
      id: "external-circle",
      metadata: {
        browser: "other" as const,
        deviceProfile: "other-device" as const,
        durationMs: 620,
        pointerType: "unknown" as const,
        sourceDataset: "quickdraw" as const,
        sourceGroupId: "quickdraw-group-0123456789abcdef",
        traceOrigin: "recorded-trajectory" as const,
      },
      provenance: "external-human" as const,
    };
    const mixed = { ...corpus, samples: [...corpus.samples, external] };

    expect(() => parseSmartInkCorpus(mixed)).not.toThrow();
    expect(assessSmartInkCalibrationGate(mixed).metrics.sampleCount).toBe(1);
    expect(assessSmartInkProductionGate(mixed).metrics.sampleCount).toBe(0);
  });

  it("rejects external records that impersonate known browser capture", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const circle = corpus.samples.find(
      ({ expectedKind }) => expectedKind === "circle",
    )!;
    const external = {
      ...circle,
      metadata: {
        browser: "chromium",
        deviceProfile: "windows-laptop",
        durationMs: 620,
        pointerType: "mouse",
        sourceDataset: "quickdraw",
        sourceGroupId: "quickdraw-group-0123456789abcdef",
        traceOrigin: "recorded-trajectory",
      },
      provenance: "external-human",
    };

    expect(() =>
      parseSmartInkCorpus({ ...corpus, samples: [external] }),
    ).toThrow("dataset-only metadata");
  });

  it("rejects inconsistent external trajectory provenance", () => {
    const corpus = createSyntheticBenchmarkCorpus();
    const rectangle = corpus.samples.find(
      ({ expectedKind }) => expectedKind === "rectangle",
    )!;
    const inconsistent = {
      ...rectangle,
      id: "external-inconsistent",
      metadata: {
        browser: "other",
        deviceProfile: "other-device",
        durationMs: 0,
        pointerType: "unknown",
        sourceDataset: "hds",
        sourceGroupId: "hds-group-0123456789abcdef",
        traceOrigin: "recorded-trajectory",
      },
      provenance: "external-human",
    };

    expect(() =>
      parseSmartInkCorpus({ ...corpus, samples: [inconsistent] }),
    ).toThrow("inconsistent trace provenance");
  });
});
