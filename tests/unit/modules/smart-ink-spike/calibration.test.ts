import { describe, expect, it } from "vitest";

import {
  calibrateSmartInkRecognizer,
  smartInkCorpusSchemaVersion,
  type SmartInkCorpus,
  type SmartInkCorpusSample,
  type SmartInkPrimitiveKind,
} from "../../../../src/modules/smart-ink-spike/public";
import { negativeStrokes, positiveStrokes } from "./corpus-fixtures";

function groupId(dataset: "hds" | "quickdraw", index: number): string {
  return `${dataset}-group-${index.toString(16).padStart(16, "0")}`;
}

function externalSample(
  kind: SmartInkPrimitiveKind,
  index: number,
): SmartInkCorpusSample {
  const dataset =
    kind === "ellipse" || kind === "rectangle" ? "hds" : "quickdraw";
  return {
    acceptableKinds:
      kind === "circle"
        ? ["circle", "ellipse"]
        : kind === "ellipse"
          ? ["ellipse", "circle"]
          : kind === "square"
            ? ["square", "rectangle"]
            : kind === "rectangle"
              ? ["rectangle", "square"]
              : [kind],
    expectedKind: kind,
    id: `calibration-${kind}-${index}`,
    metadata: {
      browser: "other",
      deviceProfile: "other-device",
      durationMs: dataset === "hds" ? 0 : 420,
      pointerType: "unknown",
      sourceDataset: dataset,
      sourceGroupId:
        dataset === "hds"
          ? groupId(dataset, index)
          : groupId(dataset, index + smartInkKindOffset(kind)),
      traceOrigin: dataset === "hds" ? "raster-contour" : "recorded-trajectory",
    },
    points: positiveStrokes[kind],
    provenance: "external-human",
    shouldPropose: true,
  };
}

function smartInkKindOffset(kind: SmartInkPrimitiveKind): number {
  return (
    ["line", "circle", "ellipse", "rectangle", "square", "triangle"].indexOf(
      kind,
    ) * 100
  );
}

function calibrationCorpus(): SmartInkCorpus {
  const positives = (
    ["line", "circle", "ellipse", "rectangle", "square", "triangle"] as const
  ).flatMap((kind) =>
    Array.from({ length: 14 }, (_, index) => externalSample(kind, index)),
  );
  const negatives: SmartInkCorpusSample[] = Array.from(
    { length: 24 },
    (_, index) => ({
      acceptableKinds: [],
      expectedKind: "negative",
      id: `calibration-negative-${index}`,
      metadata: {
        browser: "other",
        deviceProfile: "other-device",
        durationMs: 510,
        pointerType: "unknown",
        sourceDataset: "quickdraw",
        sourceGroupId: groupId("quickdraw", 900 + index),
        traceOrigin: "recorded-trajectory",
      },
      points: negativeStrokes[index % negativeStrokes.length]!.points,
      provenance: "external-human",
      shouldPropose: false,
    }),
  );
  return {
    samples: [...positives, ...negatives],
    schemaVersion: smartInkCorpusSchemaVersion,
  };
}

describe("Phase 9 Smart Ink confidence calibration", () => {
  it("selects thresholds on a deterministic group-safe split", () => {
    const corpus = calibrationCorpus();
    const options = {
      minimumNegatives: 10,
      minimumPerClass: 6,
      seed: 90_210,
    };
    const first = calibrateSmartInkRecognizer(corpus, options);
    const second = calibrateSmartInkRecognizer(corpus, options);

    expect(first.selectedOptions).toEqual(second.selectedOptions);
    expect(first.split).toEqual(second.split);
    expect(first.split.sharedGroupCount).toBe(0);
    expect(first.split.calibrationCount + first.split.holdoutCount).toBe(
      corpus.samples.length,
    );
    expect(first.search.selectedOnCalibrationOnly).toBe(true);
    expect(first.search.candidateCount).toBeGreaterThan(100);
    expect(first.selectedOptions.minimumConfidence).toBeGreaterThanOrEqual(
      0.35,
    );
    expect(first.holdoutMetrics.sampleCount).toBe(first.split.holdoutCount);
    expect(first.schemaVersion).toBe("tutorboard.smart-ink-calibration/0.1");
  });

  it("excludes synthetic stress samples from calibration evidence", () => {
    const corpus = calibrationCorpus();
    const baseline = calibrateSmartInkRecognizer(corpus, {
      minimumNegatives: 10,
      minimumPerClass: 6,
      seed: 7,
    });
    const withSynthetic = calibrateSmartInkRecognizer(
      {
        ...corpus,
        samples: [
          ...corpus.samples,
          {
            ...corpus.samples[0]!,
            id: "synthetic-extra",
            metadata: {
              browser: "other",
              deviceProfile: "synthetic-fixture",
              durationMs: 10,
              pointerType: "mouse",
            },
            provenance: "synthetic",
          },
        ],
      },
      {
        minimumNegatives: 10,
        minimumPerClass: 6,
        seed: 7,
      },
    );

    expect(withSynthetic.selectedOptions).toEqual(baseline.selectedOptions);
    expect(withSynthetic.split).toEqual(baseline.split);
  });

  it("rejects unsafe split and grid options", () => {
    const corpus = calibrationCorpus();

    expect(() =>
      calibrateSmartInkRecognizer(corpus, {
        calibrationRatio: 0.99,
        seed: 1,
      }),
    ).toThrow("ratio must be between");
    expect(() =>
      calibrateSmartInkRecognizer(corpus, {
        minimumConfidences: [Number.NaN],
        seed: 1,
      }),
    ).toThrow("minimumConfidences");
  });

  it("keeps degenerate human samples as unrecognized evidence", () => {
    const corpus = calibrationCorpus();
    const degenerate: SmartInkCorpusSample = {
      ...corpus.samples[0]!,
      id: "calibration-degenerate",
      metadata: {
        ...corpus.samples[0]!.metadata,
        sourceGroupId: groupId("quickdraw", 9_999),
      },
      points: [
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ],
    };

    expect(() =>
      calibrateSmartInkRecognizer(
        { ...corpus, samples: [...corpus.samples, degenerate] },
        {
          minimumNegatives: 10,
          minimumPerClass: 6,
          seed: 12,
        },
      ),
    ).not.toThrow();
  });
});
