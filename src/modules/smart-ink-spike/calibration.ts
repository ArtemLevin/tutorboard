import {
  assessSmartInkCalibrationGate,
  evaluateSmartInkCorpus,
  findSmartInkQualityFailures,
} from "./corpus";
import { recognizeSmartInkStroke, smartInkPrimitiveFamily } from "./recognizer";
import {
  smartInkCorpusSchemaVersion,
  smartInkPrimitiveKinds,
  type SmartInkCalibrationOptions,
  type SmartInkCalibrationReport,
  type SmartInkCalibrationSplitSummary,
  type SmartInkCorpus,
  type SmartInkCorpusExpectedKind,
  type SmartInkCorpusSample,
  type SmartInkPrimitiveKind,
  type SmartInkRecognizerOptions,
} from "./types";

const reportSchemaVersion = "tutorboard.smart-ink-calibration/0.1";
const expectedKinds = [...smartInkPrimitiveKinds, "negative"] as const;
const defaultMinimumPerClass = 40;
const defaultMinimumNegatives = 60;
const maximumGridSize = 128;

interface ScoredSample {
  readonly acceptableKinds: readonly SmartInkPrimitiveKind[];
  readonly expectedKind: SmartInkCorpusExpectedKind;
  readonly forceAmbiguous: boolean;
  readonly gap: number;
  readonly secondKind: SmartInkPrimitiveKind;
  readonly topConfidence: number;
  readonly topKind: SmartInkPrimitiveKind;
}

interface SearchMetrics {
  readonly ambiguityRate: number;
  readonly falsePositiveRate: number;
  readonly macroPrecision: number;
  readonly macroRecall: number;
  readonly specializedTop2Accuracy: number;
  readonly unrecognizedRate: number;
}

interface SearchCandidate {
  readonly feasible: boolean;
  readonly metrics: SearchMetrics;
  readonly options: Required<
    Pick<
      SmartInkRecognizerOptions,
      "ambiguityMargin" | "minimumConfidence" | "sampleCount"
    >
  >;
  readonly score: number;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

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

function countSamples(
  samples: readonly SmartInkCorpusSample[],
): Record<SmartInkCorpusExpectedKind, number> {
  const counts = emptyCounts();
  for (const sample of samples) {
    counts[sample.expectedKind] += 1;
  }
  return counts;
}

function stableFraction(seed: number, value: string): number {
  let hash = (2_166_136_261 ^ (seed >>> 0)) >>> 0;
  const input = `smart-ink-calibration:${seed}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return hash / 0x1_0000_0000;
}

function sourceGroup(sample: SmartInkCorpusSample): string {
  return sample.metadata.sourceGroupId ?? `sample:${sample.id}`;
}

function validateGrid(
  values: readonly number[] | undefined,
  fallback: readonly number[],
  name: string,
): readonly number[] {
  const grid = values ?? fallback;
  if (
    grid.length === 0 ||
    grid.length > maximumGridSize ||
    grid.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error(
      `Smart Ink calibration ${name} must contain 1-${maximumGridSize} finite values in [0, 1].`,
    );
  }
  return [...new Set(grid)].sort((left, right) => left - right);
}

function integerOption(
  value: number | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(
      `Smart Ink calibration ${name} must be an integer between 1 and ${maximum}.`,
    );
  }
  return resolved;
}

function defaultConfidenceGrid(): readonly number[] {
  return Array.from({ length: 56 }, (_, index) =>
    Number((0.25 + index * 0.01).toFixed(2)),
  );
}

function defaultAmbiguityGrid(): readonly number[] {
  return Array.from({ length: 19 }, (_, index) =>
    Number((0.02 + index * 0.01).toFixed(2)),
  );
}

function splitHumanCorpus(
  corpus: SmartInkCorpus,
  calibrationRatio: number,
  seed: number,
): {
  readonly calibration: SmartInkCorpus;
  readonly holdout: SmartInkCorpus;
  readonly summary: SmartInkCalibrationSplitSummary;
} {
  const groups = new Map<string, SmartInkCorpusSample[]>();
  for (const sample of corpus.samples) {
    const key = sourceGroup(sample);
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  const totalCounts = countSamples(corpus.samples);
  const calibrationCounts = emptyCounts();
  const calibration: SmartInkCorpusSample[] = [];
  const holdout: SmartInkCorpusSample[] = [];
  let calibrationGroupCount = 0;
  let holdoutGroupCount = 0;

  const orderedGroups = [...groups.entries()].sort(
    ([left], [right]) =>
      stableFraction(seed, left) - stableFraction(seed, right) ||
      left.localeCompare(right),
  );

  for (const [key, samples] of orderedGroups) {
    const groupCounts = countSamples(samples);
    const error = (assignToCalibration: boolean) =>
      expectedKinds.reduce((sum, kind) => {
        const nextCount =
          calibrationCounts[kind] +
          (assignToCalibration ? groupCounts[kind] : 0);
        const target = totalCounts[kind] * calibrationRatio;
        return sum + Math.abs(nextCount - target);
      }, 0);
    const calibrationError = error(true);
    const holdoutError = error(false);
    const assignToCalibration =
      calibrationError < holdoutError ||
      (calibrationError === holdoutError &&
        stableFraction(seed + 1, key) < calibrationRatio);

    if (assignToCalibration) {
      calibration.push(...samples);
      calibrationGroupCount += 1;
      for (const kind of expectedKinds) {
        calibrationCounts[kind] += groupCounts[kind];
      }
    } else {
      holdout.push(...samples);
      holdoutGroupCount += 1;
    }
  }

  const holdoutCounts = countSamples(holdout);
  return {
    calibration: {
      samples: calibration,
      schemaVersion: smartInkCorpusSchemaVersion,
    },
    holdout: {
      samples: holdout,
      schemaVersion: smartInkCorpusSchemaVersion,
    },
    summary: {
      calibrationCount: calibration.length,
      calibrationCounts,
      calibrationGroupCount,
      holdoutCount: holdout.length,
      holdoutCounts,
      holdoutGroupCount,
      sharedGroupCount: 0,
    },
  };
}

function scoreCorpus(
  corpus: SmartInkCorpus,
  sampleCount: number,
): readonly ScoredSample[] {
  return corpus.samples.map((sample) => {
    const proposal = recognizeSmartInkStroke(sample.id, sample.points, {
      ambiguityMargin: 0,
      minimumConfidence: 0,
      sampleCount,
    });
    const first = proposal.candidates[0];
    const second = proposal.candidates.find(
      (candidate) =>
        first !== undefined &&
        smartInkPrimitiveFamily(candidate.kind) !==
          smartInkPrimitiveFamily(first.kind),
    );
    if (first === undefined || second === undefined) {
      return {
        acceptableKinds: sample.acceptableKinds,
        expectedKind: sample.expectedKind,
        forceAmbiguous: false,
        gap: 1,
        secondKind: "line",
        topConfidence: -1,
        topKind: "line",
      };
    }
    return {
      acceptableKinds: sample.acceptableKinds,
      expectedKind: sample.expectedKind,
      forceAmbiguous: proposal.diagnostics.some((diagnostic) =>
        diagnostic.startsWith("ambiguous:smooth-oval:"),
      ),
      gap: first.confidence - second.confidence,
      secondKind: second.kind,
      topConfidence: first.confidence,
      topKind: first.kind,
    };
  });
}

function evaluateSearchCandidate(
  samples: readonly ScoredSample[],
  minimumConfidence: number,
  ambiguityMargin: number,
): SearchMetrics {
  const predicted = new Map<SmartInkPrimitiveKind, number>();
  const predictionAccepted = new Map<SmartInkPrimitiveKind, number>();
  const support = new Map<SmartInkPrimitiveKind, number>();
  const expectedAccepted = new Map<SmartInkPrimitiveKind, number>();
  let ambiguityCount = 0;
  let falsePositiveCount = 0;
  let negativeCount = 0;
  let positiveCount = 0;
  let specializedCount = 0;
  let specializedTop2Count = 0;
  let unrecognizedCount = 0;

  for (const sample of samples) {
    const confident = sample.topConfidence >= minimumConfidence;
    const ambiguous =
      confident && (sample.forceAmbiguous || sample.gap < ambiguityMargin);
    const recognized = confident && !ambiguous;
    if (
      sample.expectedKind === "circle" ||
      sample.expectedKind === "ellipse" ||
      sample.expectedKind === "rectangle" ||
      sample.expectedKind === "square"
    ) {
      specializedCount += 1;
      if (
        sample.acceptableKinds.includes(sample.topKind) ||
        sample.acceptableKinds.includes(sample.secondKind)
      ) {
        specializedTop2Count += 1;
      }
    }
    if (ambiguous) {
      ambiguityCount += 1;
    }
    if (!recognized) {
      if (sample.expectedKind !== "negative") {
        positiveCount += 1;
        if (!confident) unrecognizedCount += 1;
        support.set(
          sample.expectedKind,
          (support.get(sample.expectedKind) ?? 0) + 1,
        );
      } else {
        negativeCount += 1;
      }
      continue;
    }

    predicted.set(sample.topKind, (predicted.get(sample.topKind) ?? 0) + 1);
    if (sample.expectedKind === "negative") {
      negativeCount += 1;
      falsePositiveCount += 1;
      continue;
    }

    positiveCount += 1;
    support.set(
      sample.expectedKind,
      (support.get(sample.expectedKind) ?? 0) + 1,
    );
    if (sample.acceptableKinds.includes(sample.topKind)) {
      predictionAccepted.set(
        sample.topKind,
        (predictionAccepted.get(sample.topKind) ?? 0) + 1,
      );
      expectedAccepted.set(
        sample.expectedKind,
        (expectedAccepted.get(sample.expectedKind) ?? 0) + 1,
      );
    }
  }

  const perClass = smartInkPrimitiveKinds.map((kind) => ({
    precision: ratio(
      predictionAccepted.get(kind) ?? 0,
      predicted.get(kind) ?? 0,
    ),
    recall: ratio(expectedAccepted.get(kind) ?? 0, support.get(kind) ?? 0),
  }));
  return {
    ambiguityRate: roundMetric(ratio(ambiguityCount, samples.length)),
    falsePositiveRate: roundMetric(ratio(falsePositiveCount, negativeCount)),
    macroPrecision: roundMetric(
      perClass.reduce((sum, metrics) => sum + metrics.precision, 0) /
        smartInkPrimitiveKinds.length,
    ),
    macroRecall: roundMetric(
      perClass.reduce((sum, metrics) => sum + metrics.recall, 0) /
        smartInkPrimitiveKinds.length,
    ),
    specializedTop2Accuracy: roundMetric(
      ratio(specializedTop2Count, specializedCount),
    ),
    unrecognizedRate: roundMetric(ratio(unrecognizedCount, positiveCount)),
  };
}

function candidateFeasible(metrics: SearchMetrics): boolean {
  return (
    metrics.macroPrecision >= 0.97 &&
    metrics.macroRecall >= 0.9 &&
    metrics.falsePositiveRate <= 0.02 &&
    metrics.specializedTop2Accuracy >= 0.98 &&
    metrics.unrecognizedRate <= 0.1 &&
    metrics.ambiguityRate <= 0.1
  );
}

function candidateScore(
  metrics: SearchMetrics,
  targetAmbiguityRate: number,
): number {
  const constraintPenalty =
    Math.max(0, 0.97 - metrics.macroPrecision) * 12 +
    Math.max(0, 0.9 - metrics.macroRecall) * 12 +
    Math.max(0, metrics.falsePositiveRate - 0.02) * 18 +
    Math.max(0, 0.98 - metrics.specializedTop2Accuracy) * 8 +
    Math.max(0, metrics.unrecognizedRate - 0.1) * 8 +
    Math.max(0, metrics.ambiguityRate - 0.1) * 8;
  return (
    metrics.macroRecall -
    metrics.falsePositiveRate * 2 -
    metrics.unrecognizedRate * 0.3 -
    Math.abs(metrics.ambiguityRate - targetAmbiguityRate) * 0.05 -
    constraintPenalty
  );
}

function selectCandidate(
  scoredSamples: readonly ScoredSample[],
  confidenceGrid: readonly number[],
  ambiguityGrid: readonly number[],
  sampleCount: number,
  targetAmbiguityRate: number,
): {
  readonly candidate: SearchCandidate;
  readonly candidateCount: number;
  readonly feasibleCandidateCount: number;
} {
  const candidates: SearchCandidate[] = [];
  for (const minimumConfidence of confidenceGrid) {
    for (const ambiguityMargin of ambiguityGrid) {
      const metrics = evaluateSearchCandidate(
        scoredSamples,
        minimumConfidence,
        ambiguityMargin,
      );
      candidates.push({
        feasible: candidateFeasible(metrics),
        metrics,
        options: {
          ambiguityMargin,
          minimumConfidence,
          sampleCount,
        },
        score: candidateScore(metrics, targetAmbiguityRate),
      });
    }
  }
  candidates.sort(
    (left, right) =>
      Number(right.feasible) - Number(left.feasible) ||
      right.score - left.score ||
      right.metrics.macroPrecision - left.metrics.macroPrecision ||
      right.metrics.macroRecall - left.metrics.macroRecall ||
      left.metrics.falsePositiveRate - right.metrics.falsePositiveRate ||
      left.options.minimumConfidence - right.options.minimumConfidence ||
      left.options.ambiguityMargin - right.options.ambiguityMargin,
  );
  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error("Smart Ink calibration search produced no candidates.");
  }
  return {
    candidate,
    candidateCount: candidates.length,
    feasibleCandidateCount: candidates.filter(({ feasible }) => feasible)
      .length,
  };
}

function evidenceFailures(
  corpus: SmartInkCorpus,
  minimumPerClass: number,
  minimumNegatives: number,
): readonly string[] {
  const counts = countSamples(corpus.samples);
  const failures: string[] = [];
  for (const kind of smartInkPrimitiveKinds) {
    if (counts[kind] < minimumPerClass) {
      failures.push(`human-${kind}:${counts[kind]}/${minimumPerClass}`);
    }
  }
  if (counts.negative < minimumNegatives) {
    failures.push(`human-negative:${counts.negative}/${minimumNegatives}`);
  }
  return failures;
}

function splitFailures(
  summary: SmartInkCalibrationSplitSummary,
): readonly string[] {
  const failures: string[] = [];
  for (const kind of expectedKinds) {
    if (summary.calibrationCounts[kind] === 0) {
      failures.push(`calibration-split-empty:${kind}`);
    }
    if (summary.holdoutCounts[kind] === 0) {
      failures.push(`holdout-split-empty:${kind}`);
    }
  }
  return failures;
}

export function calibrateSmartInkRecognizer(
  corpus: SmartInkCorpus,
  options: SmartInkCalibrationOptions,
): SmartInkCalibrationReport {
  if (!Number.isSafeInteger(options.seed)) {
    throw new Error("Smart Ink calibration seed must be a safe integer.");
  }
  const calibrationRatio = options.calibrationRatio ?? 0.7;
  if (
    !Number.isFinite(calibrationRatio) ||
    calibrationRatio < 0.5 ||
    calibrationRatio > 0.85
  ) {
    throw new Error(
      "Smart Ink calibration ratio must be between 0.5 and 0.85.",
    );
  }
  const sampleCount = integerOption(
    options.sampleCount,
    96,
    "sampleCount",
    512,
  );
  if (sampleCount < 8) {
    throw new Error("Smart Ink calibration sampleCount must be at least 8.");
  }
  const minimumPerClass = integerOption(
    options.minimumPerClass,
    defaultMinimumPerClass,
    "minimumPerClass",
    1_000,
  );
  const minimumNegatives = integerOption(
    options.minimumNegatives,
    defaultMinimumNegatives,
    "minimumNegatives",
    1_000,
  );
  const targetAmbiguityRate = options.targetAmbiguityRate ?? 0.12;
  if (
    !Number.isFinite(targetAmbiguityRate) ||
    targetAmbiguityRate < 0 ||
    targetAmbiguityRate > 0.5
  ) {
    throw new Error(
      "Smart Ink calibration targetAmbiguityRate must be in [0, 0.5].",
    );
  }

  const humanCorpus: SmartInkCorpus = {
    samples: corpus.samples.filter(
      (sample) => sample.provenance !== "synthetic",
    ),
    schemaVersion: smartInkCorpusSchemaVersion,
  };
  const inputFailures = evidenceFailures(
    humanCorpus,
    minimumPerClass,
    minimumNegatives,
  );
  const split = splitHumanCorpus(humanCorpus, calibrationRatio, options.seed);
  const partitionFailures = splitFailures(split.summary);
  if (
    split.calibration.samples.length === 0 ||
    split.holdout.samples.length === 0
  ) {
    throw new Error(
      "Smart Ink calibration requires non-empty calibration and holdout partitions.",
    );
  }

  const confidenceGrid = validateGrid(
    options.minimumConfidences,
    defaultConfidenceGrid(),
    "minimumConfidences",
  );
  const ambiguityGrid = validateGrid(
    options.ambiguityMargins,
    defaultAmbiguityGrid(),
    "ambiguityMargins",
  );
  const scoredSamples = scoreCorpus(split.calibration, sampleCount);
  const selection = selectCandidate(
    scoredSamples,
    confidenceGrid,
    ambiguityGrid,
    sampleCount,
    targetAmbiguityRate,
  );
  const selectedOptions = selection.candidate.options;
  const calibrationMetrics = evaluateSmartInkCorpus(
    split.calibration,
    selectedOptions,
  );
  const holdoutMetrics = evaluateSmartInkCorpus(split.holdout, selectedOptions);
  const holdoutFailures = findSmartInkQualityFailures(holdoutMetrics);
  const failures = [
    ...inputFailures,
    ...partitionFailures,
    ...(selection.candidate.feasible
      ? []
      : ["calibration-search:no-feasible-candidate"]),
    ...holdoutFailures.map((failure) => `holdout-${failure}`),
  ];
  const fullEvidenceAssessment = assessSmartInkCalibrationGate(
    humanCorpus,
    selectedOptions,
  );

  return {
    calibrationMetrics,
    eligible: inputFailures.length === 0 && partitionFailures.length === 0,
    failures,
    fullEvidenceAssessment,
    holdoutMetrics,
    passed: failures.length === 0,
    schemaVersion: reportSchemaVersion,
    search: {
      candidateCount: selection.candidateCount,
      feasibleCandidateCount: selection.feasibleCandidateCount,
      selectedOnCalibrationOnly: true,
    },
    seed: options.seed,
    selectedOptions,
    split: split.summary,
  };
}
