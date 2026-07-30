import { assertSmartInkCorpus } from "./corpus";
import {
  smartInkCorpusSchemaVersion,
  smartInkPrimitiveKinds,
  type SmartInkCorpus,
  type SmartInkCorpusExpectedKind,
  type SmartInkCorpusSample,
  type SmartInkIndependentHoldoutOptions,
  type SmartInkIndependentHoldoutResult,
  type SmartInkIndependentNegativeHoldoutOptions,
  type SmartInkIndependentNegativeHoldoutResult,
} from "./types";

const expectedKinds = [...smartInkPrimitiveKinds, "negative"] as const;
const negativeCategories = ["squiggle", "star", "zigzag"] as const;

function emptyCounts(): Record<SmartInkCorpusExpectedKind, number> {
  return {
    circle: 0,
    ellipse: 0,
    line: 0,
    negative: 0,
    rectangle: 0,
    square: 0,
    triangle: 0,
  };
}

function stableRank(seed: number, value: string): number {
  let hash = (2_166_136_261 ^ (seed >>> 0)) >>> 0;
  const input = `smart-ink-independent-holdout:${seed}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function groupId(sample: SmartInkCorpusSample): string {
  return sample.metadata.sourceGroupId ?? `sample:${sample.id}`;
}

function positiveInteger(value: number, name: string, maximum = 1_000): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `Smart Ink holdout ${name} must be an integer between 1 and ${maximum}.`,
    );
  }
}

export function buildIndependentSmartInkHoldout(
  development: SmartInkCorpus,
  candidates: SmartInkCorpus,
  options: SmartInkIndependentHoldoutOptions,
): SmartInkIndependentHoldoutResult {
  assertSmartInkCorpus(development);
  assertSmartInkCorpus(candidates);
  positiveInteger(options.seed, "seed", 0x7fffffff);
  positiveInteger(options.minimumPerClass, "minimumPerClass");
  positiveInteger(options.minimumNegatives, "minimumNegatives");

  const developmentIds = new Set(development.samples.map(({ id }) => id));
  const developmentGroups = new Set(development.samples.map(groupId));
  const excludedCandidateGroups = new Set(
    candidates.samples
      .filter((sample) => developmentGroups.has(groupId(sample)))
      .map(groupId),
  );
  const eligible = candidates.samples.filter(
    (sample) =>
      sample.provenance === "external-human" &&
      !developmentIds.has(sample.id) &&
      !developmentGroups.has(groupId(sample)),
  );
  const selected: SmartInkCorpusSample[] = [];
  const selectedCounts = emptyCounts();
  for (const kind of expectedKinds) {
    const required =
      kind === "negative" ? options.minimumNegatives : options.minimumPerClass;
    const ranked = eligible
      .filter((sample) => sample.expectedKind === kind)
      .sort(
        (left, right) =>
          stableRank(options.seed, left.id) -
            stableRank(options.seed, right.id) ||
          left.id.localeCompare(right.id),
      );
    if (ranked.length < required) {
      throw new Error(
        `Independent Smart Ink holdout has ${ranked.length}/${required} eligible ${kind} samples.`,
      );
    }
    selected.push(...ranked.slice(0, required));
    selectedCounts[kind] = required;
  }

  const ids = new Set<string>();
  for (const sample of selected) {
    if (ids.has(sample.id)) {
      throw new Error(`Independent holdout repeats sample id ${sample.id}.`);
    }
    ids.add(sample.id);
  }

  return {
    corpus: {
      samples: selected,
      schemaVersion: smartInkCorpusSchemaVersion,
    },
    excludedDevelopmentGroupCount: excludedCandidateGroups.size,
    excludedDevelopmentSampleCount: candidates.samples.filter((sample) =>
      developmentIds.has(sample.id),
    ).length,
    selectedCounts,
    selectedGroupCount: new Set(selected.map(groupId)).size,
  };
}

export function buildIndependentSmartInkNegativeHoldout(
  development: SmartInkCorpus,
  candidates: SmartInkCorpus,
  options: SmartInkIndependentNegativeHoldoutOptions,
): SmartInkIndependentNegativeHoldoutResult {
  assertSmartInkCorpus(development);
  assertSmartInkCorpus(candidates);
  positiveInteger(options.seed, "seed", 0x7fffffff);
  positiveInteger(options.minimumPerCategory, "minimumPerCategory");

  const developmentIds = new Set(development.samples.map(({ id }) => id));
  const developmentGroups = new Set(development.samples.map(groupId));
  const excludedCandidateGroups = new Set(
    candidates.samples
      .filter((sample) => developmentGroups.has(groupId(sample)))
      .map(groupId),
  );
  const eligible = candidates.samples.filter(
    (sample) =>
      sample.provenance === "external-human" &&
      sample.expectedKind === "negative" &&
      sample.metadata.sourceDataset === "quickdraw" &&
      !developmentIds.has(sample.id) &&
      !developmentGroups.has(groupId(sample)),
  );
  const selected: SmartInkCorpusSample[] = [];
  const selectedCategoryCounts = {
    squiggle: 0,
    star: 0,
    zigzag: 0,
  };
  for (const category of negativeCategories) {
    const ranked = eligible
      .filter((sample) => sample.metadata.sourceCategory === category)
      .sort(
        (left, right) =>
          stableRank(options.seed, left.id) -
            stableRank(options.seed, right.id) ||
          left.id.localeCompare(right.id),
      );
    if (ranked.length < options.minimumPerCategory) {
      throw new Error(
        `Independent Smart Ink negative holdout has ${ranked.length}/${options.minimumPerCategory} eligible ${category} samples.`,
      );
    }
    selected.push(...ranked.slice(0, options.minimumPerCategory));
    selectedCategoryCounts[category] = options.minimumPerCategory;
  }

  return {
    corpus: {
      samples: selected,
      schemaVersion: smartInkCorpusSchemaVersion,
    },
    excludedDevelopmentGroupCount: excludedCandidateGroups.size,
    excludedDevelopmentSampleCount: candidates.samples.filter((sample) =>
      developmentIds.has(sample.id),
    ).length,
    selectedCategoryCounts,
    selectedGroupCount: new Set(selected.map(groupId)).size,
  };
}
