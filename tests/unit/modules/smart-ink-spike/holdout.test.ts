import { describe, expect, it } from "vitest";

import {
  buildIndependentSmartInkHoldout,
  buildIndependentSmartInkNegativeHoldout,
  smartInkCorpusSchemaVersion,
  type SmartInkCorpus,
  type SmartInkCorpusExpectedKind,
  type SmartInkCorpusSample,
} from "../../../../src/modules/smart-ink-spike/public";

function sample(
  id: string,
  expectedKind: SmartInkCorpusExpectedKind,
  sourceGroupId: string,
  sourceCategory?:
    "circle" | "line" | "square" | "triangle" | "squiggle" | "star" | "zigzag",
): SmartInkCorpusSample {
  const acceptableKinds =
    expectedKind === "negative"
      ? []
      : expectedKind === "circle"
        ? (["circle", "ellipse"] as const)
        : expectedKind === "ellipse"
          ? (["ellipse", "circle"] as const)
          : expectedKind === "rectangle"
            ? (["rectangle", "square"] as const)
            : expectedKind === "square"
              ? (["square", "rectangle"] as const)
              : [expectedKind];
  return {
    acceptableKinds,
    expectedKind,
    id,
    metadata: {
      browser: "other",
      deviceProfile: "other-device",
      durationMs: 100,
      pointerType: "unknown",
      ...(sourceCategory === undefined ? {} : { sourceCategory }),
      sourceDataset: "quickdraw",
      sourceGroupId,
      traceOrigin: "recorded-trajectory",
    },
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    provenance: "external-human",
    shouldPropose: expectedKind !== "negative",
  };
}

function corpus(samples: readonly SmartInkCorpusSample[]): SmartInkCorpus {
  return { samples, schemaVersion: smartInkCorpusSchemaVersion };
}

describe("Phase 9 independent Smart Ink holdout", () => {
  it("excludes development ids and source groups before deterministic quotas", () => {
    const group = (value: number) =>
      `quickdraw-group-${value.toString(16).padStart(20, "0")}`;
    const development = corpus([sample("development-line", "line", group(1))]);
    const candidates = corpus([
      sample("shared-group", "line", group(1)),
      sample("development-line", "line", group(2)),
      ...(
        [
          "line",
          "circle",
          "ellipse",
          "rectangle",
          "square",
          "triangle",
          "negative",
        ] as const
      ).map((kind, index) => sample(`new-${kind}`, kind, group(index + 3))),
    ]);

    const result = buildIndependentSmartInkHoldout(development, candidates, {
      minimumNegatives: 1,
      minimumPerClass: 1,
      seed: 17,
    });

    expect(result.corpus.samples.map(({ id }) => id).sort()).toEqual(
      [
        "new-circle",
        "new-ellipse",
        "new-line",
        "new-negative",
        "new-rectangle",
        "new-square",
        "new-triangle",
      ].sort(),
    );
    expect(result.excludedDevelopmentGroupCount).toBe(1);
    expect(result.excludedDevelopmentSampleCount).toBe(1);
    expect(result.selectedGroupCount).toBe(7);
  });

  it("fails closed when an independent class quota is unavailable", () => {
    expect(() =>
      buildIndependentSmartInkHoldout(corpus([]), corpus([]), {
        minimumNegatives: 1,
        minimumPerClass: 1,
        seed: 17,
      }),
    ).toThrow("0/1 eligible line samples");
  });

  it("builds a category-balanced independent negative confirmation set", () => {
    const group = (value: number) =>
      `quickdraw-group-${value.toString(16).padStart(20, "0")}`;
    const development = corpus([
      sample("seen-squiggle", "negative", group(1), "squiggle"),
    ]);
    const candidates = corpus([
      sample("shared-squiggle", "negative", group(1), "squiggle"),
      sample("new-squiggle", "negative", group(2), "squiggle"),
      sample("new-star", "negative", group(3), "star"),
      sample("new-zigzag", "negative", group(4), "zigzag"),
    ]);

    const result = buildIndependentSmartInkNegativeHoldout(
      development,
      candidates,
      { minimumPerCategory: 1, seed: 19 },
    );

    expect(result.corpus.samples.map(({ id }) => id).sort()).toEqual([
      "new-squiggle",
      "new-star",
      "new-zigzag",
    ]);
    expect(result.selectedCategoryCounts).toEqual({
      squiggle: 1,
      star: 1,
      zigzag: 1,
    });
    expect(result.excludedDevelopmentGroupCount).toBe(1);
    expect(result.selectedGroupCount).toBe(3);
  });
});
