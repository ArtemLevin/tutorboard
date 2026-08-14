import type { SmartInkV2Features, SmartInkV2ShapeKind } from "./types";

export const smartInkV2FeatureNames = [
  "aspectRatio",
  "closure",
  "cornerConcentration",
  "endpointEfficiency",
  "meanPressure",
  "pathToDiagonal",
  "pressureVariation",
  "retracing",
  "selfIntersections",
  "speedVariation",
  "turningConsistency",
] as const satisfies readonly (keyof SmartInkV2Features)[];

export interface SmartInkTrainingExample {
  readonly expectedKind: SmartInkV2ShapeKind;
  readonly features: SmartInkV2Features;
}

export interface SmartInkLinearModelArtifact {
  readonly bias: Readonly<Record<SmartInkV2ShapeKind, number>>;
  readonly featureNames: typeof smartInkV2FeatureNames;
  readonly schemaVersion: "tutorboard.smart-ink-linear-model/1.0";
  readonly weights: Readonly<Record<SmartInkV2ShapeKind, readonly number[]>>;
}

const kinds: readonly SmartInkV2ShapeKind[] = [
  "line",
  "circle",
  "ellipse",
  "rectangle",
  "square",
  "triangle",
  "arrow",
];

function vector(features: SmartInkV2Features): readonly number[] {
  return smartInkV2FeatureNames.map((name) => features[name]);
}

export function trainSmartInkLinearModel(
  examples: readonly SmartInkTrainingExample[],
): SmartInkLinearModelArtifact {
  const means = new Map<SmartInkV2ShapeKind, number[]>();
  const counts = new Map<SmartInkV2ShapeKind, number>();
  for (const kind of kinds)
    means.set(
      kind,
      Array.from({ length: smartInkV2FeatureNames.length }, () => 0),
    );
  for (const example of examples) {
    const row = means.get(example.expectedKind)!;
    const values = vector(example.features);
    for (let index = 0; index < row.length; index += 1)
      row[index]! += values[index]!;
    counts.set(
      example.expectedKind,
      (counts.get(example.expectedKind) ?? 0) + 1,
    );
  }
  for (const kind of kinds) {
    const count = Math.max(1, counts.get(kind) ?? 0);
    const row = means.get(kind)!;
    for (let index = 0; index < row.length; index += 1) row[index]! /= count;
  }
  const global = Array.from({ length: smartInkV2FeatureNames.length }, () => 0);
  for (const kind of kinds) {
    const row = means.get(kind)!;
    for (let index = 0; index < row.length; index += 1)
      global[index]! += row[index]! / kinds.length;
  }
  const weights = {} as Record<SmartInkV2ShapeKind, readonly number[]>;
  const bias = {} as Record<SmartInkV2ShapeKind, number>;
  for (const kind of kinds) {
    weights[kind] = means
      .get(kind)!
      .map((value, index) => value - global[index]!);
    bias[kind] = Math.log(
      (counts.get(kind) ?? 1) / Math.max(1, examples.length),
    );
  }
  return {
    bias,
    featureNames: smartInkV2FeatureNames,
    schemaVersion: "tutorboard.smart-ink-linear-model/1.0",
    weights,
  };
}
