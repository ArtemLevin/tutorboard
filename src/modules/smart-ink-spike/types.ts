import type { Vec2 } from "../../core/public";

export const smartInkPrimitiveKinds = [
  "line",
  "circle",
  "ellipse",
  "rectangle",
  "square",
  "triangle",
] as const;

export type SmartInkPrimitiveKind = (typeof smartInkPrimitiveKinds)[number];

export interface FittedLine {
  readonly end: Vec2;
  readonly kind: "line";
  readonly start: Vec2;
}

export interface FittedCircle {
  readonly center: Vec2;
  readonly kind: "circle";
  readonly radius: number;
}

export interface FittedEllipse {
  readonly center: Vec2;
  readonly kind: "ellipse";
  readonly radius: Vec2;
  readonly rotation: number;
}

export interface FittedPolygon {
  readonly kind: "rectangle" | "square" | "triangle";
  readonly vertices: readonly Vec2[];
}

export type SmartInkFittedGeometry =
  FittedCircle | FittedEllipse | FittedLine | FittedPolygon;

export interface SmartInkCandidate {
  readonly confidence: number;
  readonly diagnostics: Readonly<Record<string, number>>;
  readonly fitError: number;
  readonly geometry: SmartInkFittedGeometry;
  readonly kind: SmartInkPrimitiveKind;
}

export type SmartInkProposalStatus =
  "ambiguous" | "recognized" | "unrecognized";

export interface SmartInkProposal {
  readonly candidates: readonly SmartInkCandidate[];
  readonly diagnostics: readonly string[];
  readonly recognizerVersion: "tutorboard.smart-ink-geometric/0.3-spike";
  readonly sampledPointCount: number;
  readonly schemaVersion: "tutorboard.smart-ink-proposal/0.1-spike";
  readonly sourceStrokeId: string;
  readonly status: SmartInkProposalStatus;
}

export interface SmartInkRecognizerOptions {
  readonly ambiguityMargin?: number;
  readonly minimumConfidence?: number;
  readonly sampleCount?: number;
}

export const smartInkCorpusSchemaVersion =
  "tutorboard.smart-ink-corpus/0.1" as const;

export type SmartInkCorpusExpectedKind = SmartInkPrimitiveKind | "negative";

export type SmartInkCorpusProvenance =
  "captured" | "external-human" | "synthetic";

export type SmartInkCorpusBrowser = "chromium" | "firefox" | "other";

export type SmartInkCorpusPointerType = "mouse" | "pen" | "touch" | "unknown";

export const smartInkExternalDatasets = ["hds", "quickdraw"] as const;

export type SmartInkExternalDataset = (typeof smartInkExternalDatasets)[number];

export const smartInkQuickDrawCategories = [
  "circle",
  "line",
  "square",
  "triangle",
  "squiggle",
  "star",
  "zigzag",
] as const;

export type SmartInkQuickDrawCategory =
  (typeof smartInkQuickDrawCategories)[number];

export const smartInkTraceOrigins = [
  "raster-contour",
  "recorded-trajectory",
] as const;

export type SmartInkTraceOrigin = (typeof smartInkTraceOrigins)[number];

export const smartInkCorpusDeviceProfiles = [
  "windows-laptop",
  "windows-desktop",
  "tablet",
  "other-device",
  "synthetic-fixture",
] as const;

export type SmartInkCorpusDeviceProfile =
  (typeof smartInkCorpusDeviceProfiles)[number];

export interface SmartInkCorpusSample {
  readonly acceptableKinds: readonly SmartInkPrimitiveKind[];
  readonly expectedKind: SmartInkCorpusExpectedKind;
  readonly id: string;
  readonly metadata: {
    readonly browser: SmartInkCorpusBrowser;
    readonly deviceProfile: SmartInkCorpusDeviceProfile;
    readonly durationMs: number;
    readonly pointerType: SmartInkCorpusPointerType;
    readonly sourceCategory?: SmartInkQuickDrawCategory;
    readonly sourceDataset?: SmartInkExternalDataset;
    readonly sourceGroupId?: string;
    readonly traceOrigin?: SmartInkTraceOrigin;
  };
  readonly points: readonly Vec2[];
  readonly provenance: SmartInkCorpusProvenance;
  readonly shouldPropose: boolean;
}

export interface SmartInkCorpus {
  readonly samples: readonly SmartInkCorpusSample[];
  readonly schemaVersion: typeof smartInkCorpusSchemaVersion;
}

export interface SmartInkClassMetrics {
  readonly falseNegative: number;
  readonly falsePositive: number;
  readonly precision: number;
  readonly recall: number;
  readonly support: number;
  readonly truePositive: number;
}

export interface SmartInkBenchmarkMetrics {
  readonly ambiguityRate: number;
  readonly classMetrics: Readonly<
    Record<SmartInkPrimitiveKind, SmartInkClassMetrics>
  >;
  readonly confusionMatrix: Readonly<
    Record<
      SmartInkCorpusExpectedKind,
      Readonly<Record<SmartInkPrimitiveKind | "unrecognized", number>>
    >
  >;
  readonly falsePositiveRate: number;
  readonly latencyMs: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly macroPrecision: number;
  readonly macroRecall: number;
  readonly negativeCount: number;
  readonly positiveCount: number;
  readonly sampleCount: number;
  readonly specializedTop2Accuracy: number;
  readonly unrecognizedRate: number;
}

export interface SmartInkProductionGateAssessment {
  readonly eligible: boolean;
  readonly failures: readonly string[];
  readonly metrics: SmartInkBenchmarkMetrics;
  readonly passed: boolean;
}

export interface SmartInkHumanizationOptions {
  readonly height?: number;
  readonly pointCount?: number;
  readonly rotation?: number;
  readonly seed: number;
  readonly width?: number;
}

export interface SmartInkCalibrationOptions {
  readonly ambiguityMargins?: readonly number[];
  readonly calibrationRatio?: number;
  readonly minimumConfidences?: readonly number[];
  readonly minimumNegatives?: number;
  readonly minimumPerClass?: number;
  readonly sampleCount?: number;
  readonly seed: number;
  readonly targetAmbiguityRate?: number;
}

export interface SmartInkCalibrationSplitSummary {
  readonly calibrationCount: number;
  readonly calibrationCounts: Readonly<
    Record<SmartInkCorpusExpectedKind, number>
  >;
  readonly calibrationGroupCount: number;
  readonly holdoutCount: number;
  readonly holdoutCounts: Readonly<Record<SmartInkCorpusExpectedKind, number>>;
  readonly holdoutGroupCount: number;
  readonly sharedGroupCount: 0;
}

export interface SmartInkCalibrationReport {
  readonly calibrationMetrics: SmartInkBenchmarkMetrics;
  readonly eligible: boolean;
  readonly failures: readonly string[];
  readonly fullEvidenceAssessment: SmartInkProductionGateAssessment;
  readonly holdoutMetrics: SmartInkBenchmarkMetrics;
  readonly passed: boolean;
  readonly schemaVersion: "tutorboard.smart-ink-calibration/0.1";
  readonly search: {
    readonly candidateCount: number;
    readonly feasibleCandidateCount: number;
    readonly selectedOnCalibrationOnly: true;
  };
  readonly seed: number;
  readonly selectedOptions: Required<
    Pick<
      SmartInkRecognizerOptions,
      "ambiguityMargin" | "minimumConfidence" | "sampleCount"
    >
  >;
  readonly split: SmartInkCalibrationSplitSummary;
}

export interface SmartInkIndependentHoldoutOptions {
  readonly minimumNegatives: number;
  readonly minimumPerClass: number;
  readonly seed: number;
}

export interface SmartInkIndependentHoldoutResult {
  readonly corpus: SmartInkCorpus;
  readonly excludedDevelopmentGroupCount: number;
  readonly excludedDevelopmentSampleCount: number;
  readonly selectedCounts: Readonly<Record<SmartInkCorpusExpectedKind, number>>;
  readonly selectedGroupCount: number;
}

export interface SmartInkIndependentNegativeHoldoutOptions {
  readonly minimumPerCategory: number;
  readonly seed: number;
}

export interface SmartInkIndependentNegativeHoldoutResult {
  readonly corpus: SmartInkCorpus;
  readonly excludedDevelopmentGroupCount: number;
  readonly excludedDevelopmentSampleCount: number;
  readonly selectedCategoryCounts: Readonly<
    Record<"squiggle" | "star" | "zigzag", number>
  >;
  readonly selectedGroupCount: number;
}
