import type {
  CoordinatePlotDefinition,
  PlotSeries,
} from "../board/coordinate-plot";
import type { Vec2 } from "../board/primitives";
import {
  cacheKey,
  compileExplicit,
  compileParametric,
  diagnostic,
} from "./preparation";
import { sampleExplicitSeries, sampleParametricSeries } from "./safe-sampler";
import type {
  CoordinatePlotSamplingInput,
  CoordinatePlotSeriesSamplingResult,
  PlotSamplingDiagnostic,
  PlotSamplingOptions,
  SampledPlotSeries,
} from "./types";

export function emptySample(): SampledPlotSeries {
  return {
    dataBounds: null,
    metrics: {
      breakCount: 0,
      clippedEdgeCount: 0,
      evaluationCount: 0,
      pointCount: 0,
      refinementCount: 0,
      undefinedCounts: {
        "division-by-zero": 0,
        domain: 0,
        "non-finite": 0,
      },
    },
    missingBindings: [],
    segments: [],
    stopReason: null,
    truncated: false,
  };
}

export function truncateSample(
  sample: SampledPlotSeries,
  pointLimit: number,
): SampledPlotSeries {
  if (sample.metrics.pointCount <= pointLimit) return sample;
  const segments: Vec2[][] = [];
  let remaining = pointLimit;
  for (const segment of sample.segments) {
    if (remaining < 2) break;
    const take = Math.min(segment.length, remaining);
    if (take >= 2) {
      segments.push(segment.slice(0, take));
      remaining -= take;
    }
  }
  const pointCount = pointLimit - remaining;
  return {
    ...sample,
    metrics: { ...sample.metrics, pointCount },
    segments,
    stopReason: "point-limit",
    truncated: true,
  };
}

export function resultStatus(
  sample: SampledPlotSeries,
): CoordinatePlotSeriesSamplingResult["status"] {
  if (sample.stopReason === "aborted") return "aborted";
  if (
    sample.stopReason === "expression-budget" ||
    sample.stopReason === "invalid-input" ||
    sample.stopReason === "missing-bindings"
  ) {
    return "invalid";
  }
  if (sample.truncated) return "truncated";
  return sample.segments.length === 0 ? "empty" : "sampled";
}

export function sampleSeries(input: {
  readonly bindings: Readonly<Record<string, number>>;
  readonly definition: CoordinatePlotDefinition;
  readonly options: PlotSamplingOptions | undefined;
  readonly parameterNames: readonly string[];
  readonly parent: CoordinatePlotSamplingInput;
  readonly series: PlotSeries;
}):
  | {
      readonly diagnostics: readonly PlotSamplingDiagnostic[];
      readonly ok: false;
    }
  | {
      readonly cacheHit: boolean;
      readonly ok: true;
      readonly sample: SampledPlotSeries;
    } {
  const key = cacheKey({
    bindings: input.bindings,
    boardZoom: input.parent.boardZoom,
    definition: input.definition,
    options: input.options,
    pixelSize: input.parent.pixelSize,
    series: input.series,
  });
  const cached = input.parent.cache?.get(key);
  if (cached !== undefined) return { cacheHit: true, ok: true, sample: cached };

  const compiled =
    input.series.kind === "explicit"
      ? compileExplicit({
          bindings: input.bindings,
          definition: input.definition,
          parameterNames: input.parameterNames,
          series: input.series,
        })
      : compileParametric({
          bindings: input.bindings,
          parameterNames: input.parameterNames,
          series: input.series,
        });
  if (!compiled.ok) return compiled;

  const common = {
    boardZoom: input.parent.boardZoom,
    options: input.options,
    parameters: input.bindings,
    pixelSize: input.parent.pixelSize,
    signal: input.parent.signal,
    viewport: input.definition.coordinateViewport,
  };
  const sample =
    input.series.kind === "explicit" && "expression" in compiled
      ? compiled.domain === null
        ? emptySample()
        : sampleExplicitSeries({
            ...common,
            domain: compiled.domain,
            expression: compiled.expression,
          })
      : input.series.kind === "parametric" && "xExpression" in compiled
        ? sampleParametricSeries({
            ...common,
            closed: input.series.closed,
            range: compiled.range,
            xExpression: compiled.xExpression,
            yExpression: compiled.yExpression,
          })
        : null;
  if (sample === null) {
    return {
      diagnostics: [
        diagnostic(
          "sampling.expression-evaluation-failed",
          "series",
          "Compiled series kind did not match the source series.",
        ),
      ],
      ok: false,
    };
  }
  if (sample.stopReason !== "aborted") input.parent.cache?.set(key, sample);
  return { cacheHit: false, ok: true, sample };
}
