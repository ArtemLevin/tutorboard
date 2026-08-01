import type {
  CoordinatePlotDefinition,
  PlotSeriesKind,
} from "../board/coordinate-plot";
import type { PlotSeriesId } from "../board/identifiers";
import type { Size2, Vec2 } from "../board/primitives";
import type {
  CompiledPlotExpression,
  ExpressionDiagnostic,
  PlotEvaluationUndefinedReason,
} from "../plot-expression/public";

export interface PlotDataBounds {
  readonly xMax: number;
  readonly xMin: number;
  readonly yMax: number;
  readonly yMin: number;
}

export interface PlotSamplingAbortSignal {
  readonly aborted: boolean;
}

export type PlotSamplingStopReason =
  | "aborted"
  | "evaluation-limit"
  | "expression-budget"
  | "invalid-input"
  | "missing-bindings"
  | "point-limit";

export interface PlotSamplingMetrics {
  readonly breakCount: number;
  readonly clippedEdgeCount: number;
  readonly evaluationCount: number;
  readonly pointCount: number;
  readonly refinementCount: number;
  readonly undefinedCounts: Readonly<
    Record<PlotEvaluationUndefinedReason, number>
  >;
}

export interface SampledPlotSeries {
  readonly dataBounds: PlotDataBounds | null;
  readonly metrics: PlotSamplingMetrics;
  readonly missingBindings: readonly string[];
  readonly segments: readonly (readonly Vec2[])[];
  readonly stopReason: PlotSamplingStopReason | null;
  readonly truncated: boolean;
}

export interface PlotSamplingOptions {
  readonly initialIntervals?: number | undefined;
  readonly maximumDepth?: number | undefined;
  readonly maximumEvaluations?: number | undefined;
  readonly maximumSegmentPixels?: number | undefined;
  readonly pointLimit?: number | undefined;
  readonly tolerancePixels?: number | undefined;
}

interface PlotSamplingBaseInput {
  readonly boardZoom: number;
  readonly parameters: Readonly<Record<string, number>>;
  readonly pixelSize: Size2;
  readonly signal?: PlotSamplingAbortSignal | undefined;
  readonly viewport: {
    readonly xMax: number;
    readonly xMin: number;
    readonly yMax: number;
    readonly yMin: number;
  };
  readonly options?: PlotSamplingOptions | undefined;
}

export interface ExplicitPlotSamplingInput extends PlotSamplingBaseInput {
  readonly domain: {
    readonly max: number;
    readonly min: number;
  };
  readonly expression: CompiledPlotExpression;
}

export interface ParametricPlotSamplingInput extends PlotSamplingBaseInput {
  readonly closed: boolean;
  readonly range: {
    readonly max: number;
    readonly min: number;
  };
  readonly xExpression: CompiledPlotExpression;
  readonly yExpression: CompiledPlotExpression;
}

export const plotSamplingDiagnosticCodes = [
  "sampling.invalid-pixel-size",
  "sampling.invalid-board-zoom",
  "sampling.invalid-viewport",
  "sampling.invalid-domain",
  "sampling.invalid-range",
  "sampling.invalid-parameter-value",
  "sampling.expression-evaluation-failed",
  "sampling.total-point-limit",
] as const;

export type PlotSamplingDiagnosticCode =
  (typeof plotSamplingDiagnosticCodes)[number];

export interface PlotSamplingDiagnostic {
  readonly code: PlotSamplingDiagnosticCode | ExpressionDiagnostic["code"];
  readonly end: number | null;
  readonly field: string;
  readonly message: string;
  readonly start: number | null;
}

export type CoordinatePlotSeriesSamplingStatus =
  "aborted" | "empty" | "hidden" | "invalid" | "sampled" | "truncated";

export interface CoordinatePlotSeriesSamplingResult {
  readonly cacheHit: boolean;
  readonly diagnostics: readonly PlotSamplingDiagnostic[];
  readonly kind: PlotSeriesKind;
  readonly sample: SampledPlotSeries | null;
  readonly seriesId: PlotSeriesId;
  readonly status: CoordinatePlotSeriesSamplingStatus;
}

export interface CoordinatePlotSamplingOptions {
  readonly maximumTotalPoints?: number | undefined;
  readonly sampling?: PlotSamplingOptions | undefined;
}

export interface CoordinatePlotSamplingInput {
  readonly boardZoom: number;
  readonly cache?: PlotSamplingCache | undefined;
  readonly definition: CoordinatePlotDefinition;
  readonly options?: CoordinatePlotSamplingOptions | undefined;
  readonly pixelSize: Size2;
  readonly signal?: PlotSamplingAbortSignal | undefined;
}

export interface CoordinatePlotSamplingResult {
  readonly cacheHits: number;
  readonly samplerVersion: string;
  readonly series: readonly CoordinatePlotSeriesSamplingResult[];
  readonly totalPointCount: number;
  readonly truncated: boolean;
}

export interface PlotSamplingCache {
  clear(): void;
  get(key: string): SampledPlotSeries | undefined;
  readonly size: number;
  set(key: string, value: SampledPlotSeries): void;
}
