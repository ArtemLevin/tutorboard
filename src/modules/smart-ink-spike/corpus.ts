import {
  smartInkCorpusDeviceProfiles,
  smartInkCorpusSchemaVersion,
  smartInkExternalDatasets,
  smartInkPrimitiveKinds,
  smartInkTraceOrigins,
  type SmartInkBenchmarkMetrics,
  type SmartInkClassMetrics,
  type SmartInkCorpus,
  type SmartInkCorpusExpectedKind,
  type SmartInkCorpusSample,
  type SmartInkPrimitiveKind,
  type SmartInkProductionGateAssessment,
  type SmartInkRecognizerOptions,
} from "./types";
import { recognizeSmartInkStroke } from "./recognizer";

const productionMinimumPerClass = 40;
const productionMinimumNegatives = 60;
const maximumCorpusSampleCount = 1_000;
const maximumCorpusPointsPerSample = 4_096;
const maximumCorpusDurationMs = 300_000;
const maximumCorpusIdLength = 160;
const maximumSourceGroupIdLength = 96;
const specializedKinds = new Set<SmartInkPrimitiveKind>([
  "circle",
  "ellipse",
  "rectangle",
  "square",
]);
const pairedKind: Readonly<
  Partial<Record<SmartInkPrimitiveKind, SmartInkPrimitiveKind>>
> = {
  circle: "ellipse",
  ellipse: "circle",
  rectangle: "square",
  square: "rectangle",
};

type ConfusionPrediction = SmartInkPrimitiveKind | "unrecognized";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitiveKind(value: unknown): value is SmartInkPrimitiveKind {
  return (
    typeof value === "string" &&
    smartInkPrimitiveKinds.some((kind) => kind === value)
  );
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * quantile),
  );
  return sorted[index]!;
}

function emptyPredictionRow(): Record<ConfusionPrediction, number> {
  return {
    circle: 0,
    ellipse: 0,
    line: 0,
    rectangle: 0,
    square: 0,
    triangle: 0,
    unrecognized: 0,
  };
}

function createConfusionMatrix(): Record<
  SmartInkCorpusExpectedKind,
  Record<ConfusionPrediction, number>
> {
  return {
    circle: emptyPredictionRow(),
    ellipse: emptyPredictionRow(),
    line: emptyPredictionRow(),
    negative: emptyPredictionRow(),
    rectangle: emptyPredictionRow(),
    square: emptyPredictionRow(),
    triangle: emptyPredictionRow(),
  };
}

function assertCorpusSample(
  input: unknown,
  index: number,
): asserts input is SmartInkCorpusSample {
  if (!isRecord(input)) {
    throw new Error(`Smart Ink corpus sample ${index} must be an object.`);
  }
  if (
    typeof input.id !== "string" ||
    input.id.trim().length === 0 ||
    input.id.length > maximumCorpusIdLength
  ) {
    throw new Error("Smart Ink corpus sample id has an invalid length.");
  }
  if (
    input.expectedKind !== "negative" &&
    !isPrimitiveKind(input.expectedKind)
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has an unsupported expected kind.`,
    );
  }
  if (!Array.isArray(input.acceptableKinds)) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} must define acceptableKinds.`,
    );
  }
  const acceptableKinds = input.acceptableKinds;
  if (!acceptableKinds.every(isPrimitiveKind)) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has an unsupported acceptable kind.`,
    );
  }
  if (new Set(acceptableKinds).size !== acceptableKinds.length) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} repeats an acceptable kind.`,
    );
  }
  if (input.expectedKind !== "negative") {
    const sibling = pairedKind[input.expectedKind];
    const allowedKinds = new Set<SmartInkPrimitiveKind>([
      input.expectedKind,
      ...(sibling === undefined ? [] : [sibling]),
    ]);
    if (acceptableKinds.some((kind) => !allowedKinds.has(kind))) {
      throw new Error(
        `Smart Ink corpus sample ${input.id} has an invalid class alternative.`,
      );
    }
  }
  if (typeof input.shouldPropose !== "boolean") {
    throw new Error(
      `Smart Ink corpus sample ${input.id} must define shouldPropose.`,
    );
  }
  if (
    input.provenance !== "captured" &&
    input.provenance !== "external-human" &&
    input.provenance !== "synthetic"
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has unsupported provenance.`,
    );
  }
  if (
    !Array.isArray(input.points) ||
    input.points.length < 2 ||
    input.points.length > maximumCorpusPointsPerSample
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has an unsupported point count.`,
    );
  }
  if (
    input.points.some(
      (point) =>
        !isRecord(point) ||
        typeof point.x !== "number" ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y),
    )
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} contains invalid coordinates.`,
    );
  }
  if (!isRecord(input.metadata)) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} must define metadata.`,
    );
  }
  const metadata = input.metadata;
  if (
    metadata.browser !== "chromium" &&
    metadata.browser !== "firefox" &&
    metadata.browser !== "other"
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has unsupported browser metadata.`,
    );
  }
  if (
    typeof metadata.deviceProfile !== "string" ||
    !smartInkCorpusDeviceProfiles.some(
      (profile) => profile === metadata.deviceProfile,
    )
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has invalid deviceProfile.`,
    );
  }
  if (
    typeof metadata.durationMs !== "number" ||
    !Number.isFinite(metadata.durationMs) ||
    metadata.durationMs < 0 ||
    metadata.durationMs > maximumCorpusDurationMs
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has invalid durationMs.`,
    );
  }
  if (
    metadata.pointerType !== "mouse" &&
    metadata.pointerType !== "pen" &&
    metadata.pointerType !== "touch" &&
    metadata.pointerType !== "unknown"
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has unsupported pointerType.`,
    );
  }
  if (
    input.provenance === "captured" &&
    metadata.deviceProfile === "synthetic-fixture"
  ) {
    throw new Error(
      `Captured Smart Ink corpus sample ${input.id} cannot use synthetic device metadata.`,
    );
  }
  if (
    metadata.sourceDataset !== undefined &&
    (typeof metadata.sourceDataset !== "string" ||
      !smartInkExternalDatasets.some(
        (dataset) => dataset === metadata.sourceDataset,
      ))
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has unsupported sourceDataset.`,
    );
  }
  if (
    metadata.sourceGroupId !== undefined &&
    (typeof metadata.sourceGroupId !== "string" ||
      metadata.sourceGroupId.length < 12 ||
      metadata.sourceGroupId.length > maximumSourceGroupIdLength ||
      !/^(?:hds|quickdraw)-group-[a-f0-9]{16,64}$/.test(metadata.sourceGroupId))
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has invalid sourceGroupId.`,
    );
  }
  if (
    metadata.traceOrigin !== undefined &&
    (typeof metadata.traceOrigin !== "string" ||
      !smartInkTraceOrigins.some(
        (traceOrigin) => traceOrigin === metadata.traceOrigin,
      ))
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} has unsupported traceOrigin.`,
    );
  }
  if (
    input.provenance === "external-human" &&
    (metadata.sourceDataset === undefined ||
      metadata.sourceGroupId === undefined ||
      metadata.traceOrigin === undefined ||
      metadata.browser !== "other" ||
      metadata.deviceProfile !== "other-device" ||
      metadata.pointerType !== "unknown")
  ) {
    throw new Error(
      `External Smart Ink corpus sample ${input.id} must use dataset-only metadata.`,
    );
  }
  if (
    input.provenance !== "external-human" &&
    (metadata.sourceDataset !== undefined ||
      metadata.sourceGroupId !== undefined ||
      metadata.traceOrigin !== undefined)
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} cannot attach an external dataset.`,
    );
  }
  if (
    input.provenance === "external-human" &&
    ((metadata.sourceDataset === "quickdraw" &&
      metadata.traceOrigin !== "recorded-trajectory") ||
      (metadata.sourceDataset === "hds" &&
        metadata.traceOrigin !== "raster-contour"))
  ) {
    throw new Error(
      `External Smart Ink corpus sample ${input.id} has inconsistent trace provenance.`,
    );
  }
  if (
    input.provenance !== "external-human" &&
    metadata.pointerType === "unknown"
  ) {
    throw new Error(
      `Smart Ink corpus sample ${input.id} must identify its pointer type.`,
    );
  }
  if (
    input.expectedKind === "negative" &&
    (input.shouldPropose || acceptableKinds.length > 0)
  ) {
    throw new Error(
      `Negative Smart Ink corpus sample ${input.id} must not propose a primitive.`,
    );
  }
  if (
    input.expectedKind !== "negative" &&
    (!input.shouldPropose || !acceptableKinds.includes(input.expectedKind))
  ) {
    throw new Error(
      `Positive Smart Ink corpus sample ${input.id} must accept its expected kind.`,
    );
  }
}

export function assertSmartInkCorpus(
  input: unknown,
): asserts input is SmartInkCorpus {
  if (!isRecord(input)) {
    throw new Error("Smart Ink corpus must be an object.");
  }
  if (input.schemaVersion !== smartInkCorpusSchemaVersion) {
    throw new Error(
      `Unsupported Smart Ink corpus schema: ${String(input.schemaVersion)}.`,
    );
  }
  if (!Array.isArray(input.samples)) {
    throw new Error("Smart Ink corpus samples must be an array.");
  }
  if (input.samples.length > maximumCorpusSampleCount) {
    throw new Error(
      `Smart Ink corpus exceeds ${maximumCorpusSampleCount} samples.`,
    );
  }
  const ids = new Set<string>();
  for (const [index, sample] of input.samples.entries()) {
    assertCorpusSample(sample, index);
    if (ids.has(sample.id)) {
      throw new Error(`Duplicate Smart Ink corpus sample id: ${sample.id}.`);
    }
    ids.add(sample.id);
  }
}

export function parseSmartInkCorpus(input: unknown): SmartInkCorpus {
  assertSmartInkCorpus(input);
  return input;
}

export function evaluateSmartInkCorpus(
  corpus: SmartInkCorpus,
  options: SmartInkRecognizerOptions = {},
  now: () => number = () => globalThis.performance.now(),
): SmartInkBenchmarkMetrics {
  assertSmartInkCorpus(corpus);

  const confusionMatrix = createConfusionMatrix();
  const durations: number[] = [];
  const predictionCounts = new Map<SmartInkPrimitiveKind, number>();
  const truePositiveCounts = new Map<SmartInkPrimitiveKind, number>();
  const supportCounts = new Map<SmartInkPrimitiveKind, number>();
  let ambiguousCount = 0;
  let falsePositiveCount = 0;
  let negativeCount = 0;
  let positiveCount = 0;
  let specializedCount = 0;
  let specializedTop2Count = 0;

  for (const sample of corpus.samples) {
    const started = now();
    const proposal = recognizeSmartInkStroke(sample.id, sample.points, options);
    durations.push(Math.max(0, now() - started));

    const prediction =
      proposal.status === "unrecognized"
        ? "unrecognized"
        : (proposal.candidates[0]?.kind ?? "unrecognized");
    confusionMatrix[sample.expectedKind][prediction] += 1;

    if (proposal.status === "ambiguous") {
      ambiguousCount += 1;
    }
    if (prediction !== "unrecognized") {
      predictionCounts.set(
        prediction,
        (predictionCounts.get(prediction) ?? 0) + 1,
      );
    }

    if (sample.expectedKind === "negative") {
      negativeCount += 1;
      if (prediction !== "unrecognized") {
        falsePositiveCount += 1;
      }
      continue;
    }

    positiveCount += 1;
    supportCounts.set(
      sample.expectedKind,
      (supportCounts.get(sample.expectedKind) ?? 0) + 1,
    );
    if (prediction === sample.expectedKind) {
      truePositiveCounts.set(
        sample.expectedKind,
        (truePositiveCounts.get(sample.expectedKind) ?? 0) + 1,
      );
    }
    if (specializedKinds.has(sample.expectedKind)) {
      specializedCount += 1;
      if (
        proposal.status !== "unrecognized" &&
        proposal.candidates
          .slice(0, 2)
          .some(({ kind }) => kind === sample.expectedKind)
      ) {
        specializedTop2Count += 1;
      }
    }
  }

  const classMetrics = Object.fromEntries(
    smartInkPrimitiveKinds.map((kind) => {
      const support = supportCounts.get(kind) ?? 0;
      const truePositive = truePositiveCounts.get(kind) ?? 0;
      const predicted = predictionCounts.get(kind) ?? 0;
      const metrics: SmartInkClassMetrics = {
        falseNegative: support - truePositive,
        falsePositive: predicted - truePositive,
        precision: roundMetric(ratio(truePositive, predicted)),
        recall: roundMetric(ratio(truePositive, support)),
        support,
        truePositive,
      };
      return [kind, metrics];
    }),
  ) as unknown as Record<SmartInkPrimitiveKind, SmartInkClassMetrics>;

  const durationsSorted = [...durations].sort((left, right) => left - right);
  const classMetricValues = Object.values(classMetrics);
  return {
    ambiguityRate: roundMetric(ratio(ambiguousCount, corpus.samples.length)),
    classMetrics,
    confusionMatrix,
    falsePositiveRate: roundMetric(ratio(falsePositiveCount, negativeCount)),
    latencyMs: {
      p50: roundMetric(percentile(durationsSorted, 0.5)),
      p95: roundMetric(percentile(durationsSorted, 0.95)),
      p99: roundMetric(percentile(durationsSorted, 0.99)),
    },
    macroPrecision: roundMetric(
      classMetricValues.reduce((sum, current) => sum + current.precision, 0) /
        smartInkPrimitiveKinds.length,
    ),
    macroRecall: roundMetric(
      classMetricValues.reduce((sum, current) => sum + current.recall, 0) /
        smartInkPrimitiveKinds.length,
    ),
    negativeCount,
    positiveCount,
    sampleCount: corpus.samples.length,
    specializedTop2Accuracy: roundMetric(
      ratio(specializedTop2Count, specializedCount),
    ),
    unrecognizedRate: roundMetric(
      ratio(
        smartInkPrimitiveKinds.reduce(
          (sum, kind) => sum + confusionMatrix[kind].unrecognized,
          0,
        ),
        positiveCount,
      ),
    ),
  };
}

export function assessSmartInkProductionGate(
  corpus: SmartInkCorpus,
  options: SmartInkRecognizerOptions = {},
  now: () => number = () => globalThis.performance.now(),
): SmartInkProductionGateAssessment {
  assertSmartInkCorpus(corpus);
  const capturedCorpus: SmartInkCorpus = {
    samples: corpus.samples.filter(
      (sample) => sample.provenance === "captured",
    ),
    schemaVersion: smartInkCorpusSchemaVersion,
  };
  const metrics = evaluateSmartInkCorpus(capturedCorpus, options, now);
  const failures: string[] = [];

  for (const kind of smartInkPrimitiveKinds) {
    const capturedCount = corpus.samples.filter(
      (sample) =>
        sample.provenance === "captured" && sample.expectedKind === kind,
    ).length;
    if (capturedCount < productionMinimumPerClass) {
      failures.push(
        `captured-${kind}:${capturedCount}/${productionMinimumPerClass}`,
      );
    }
  }
  const capturedNegatives = corpus.samples.filter(
    (sample) =>
      sample.provenance === "captured" && sample.expectedKind === "negative",
  ).length;
  if (capturedNegatives < productionMinimumNegatives) {
    failures.push(
      `captured-negative:${capturedNegatives}/${productionMinimumNegatives}`,
    );
  }
  const capturedBrowsers = new Set(
    corpus.samples
      .filter((sample) => sample.provenance === "captured")
      .map((sample) => sample.metadata.browser),
  );
  for (const browser of ["chromium", "firefox"] as const) {
    if (!capturedBrowsers.has(browser)) {
      failures.push(`captured-browser-missing:${browser}`);
    }
  }

  const eligibilityFailureCount = failures.length;
  failures.push(...findSmartInkQualityFailures(metrics));

  return {
    eligible: eligibilityFailureCount === 0,
    failures,
    metrics,
    passed: failures.length === 0,
  };
}

export function assessSmartInkCalibrationGate(
  corpus: SmartInkCorpus,
  options: SmartInkRecognizerOptions = {},
  now: () => number = () => globalThis.performance.now(),
): SmartInkProductionGateAssessment {
  assertSmartInkCorpus(corpus);
  const humanCorpus: SmartInkCorpus = {
    samples: corpus.samples.filter(
      (sample) => sample.provenance !== "synthetic",
    ),
    schemaVersion: smartInkCorpusSchemaVersion,
  };
  const metrics = evaluateSmartInkCorpus(humanCorpus, options, now);
  const failures: string[] = [];

  for (const kind of smartInkPrimitiveKinds) {
    const humanCount = humanCorpus.samples.filter(
      (sample) => sample.expectedKind === kind,
    ).length;
    if (humanCount < productionMinimumPerClass) {
      failures.push(`human-${kind}:${humanCount}/${productionMinimumPerClass}`);
    }
  }
  const humanNegatives = humanCorpus.samples.filter(
    (sample) => sample.expectedKind === "negative",
  ).length;
  if (humanNegatives < productionMinimumNegatives) {
    failures.push(
      `human-negative:${humanNegatives}/${productionMinimumNegatives}`,
    );
  }

  const eligibilityFailureCount = failures.length;
  failures.push(...findSmartInkQualityFailures(metrics));

  return {
    eligible: eligibilityFailureCount === 0,
    failures,
    metrics,
    passed: failures.length === 0,
  };
}

export function findSmartInkQualityFailures(
  metrics: SmartInkBenchmarkMetrics,
): readonly string[] {
  const failures: string[] = [];
  if (metrics.macroPrecision < 0.94) {
    failures.push(`macro-precision:${metrics.macroPrecision}<0.94`);
  }
  if (metrics.falsePositiveRate > 0.02) {
    failures.push(`false-positive-rate:${metrics.falsePositiveRate}>0.02`);
  }
  if (metrics.specializedTop2Accuracy < 0.98) {
    failures.push(`specialized-top2:${metrics.specializedTop2Accuracy}<0.98`);
  }
  if (metrics.unrecognizedRate > 0.1) {
    failures.push(`unrecognized-rate:${metrics.unrecognizedRate}>0.1`);
  }
  if (metrics.latencyMs.p95 > 150) {
    failures.push(`latency-p95:${metrics.latencyMs.p95}>150`);
  }
  return failures;
}
