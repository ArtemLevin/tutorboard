import {
  coordinatePlotSamplerVersion,
  maximumSamplePointsPerCoordinatePlot,
  maximumSamplePointsPerSeries,
  maximumSamplingEvaluationsPerCoordinatePlot,
  maximumSamplingEvaluationsPerSeries,
} from "./limits";
import {
  diagnostic,
  invalidGeometryDiagnostics,
  invalidParameterDiagnostics,
  parameterBindings,
} from "./preparation";
import { emptySample, resultStatus, sampleSeries } from "./series-sampler";
import type {
  CoordinatePlotSamplingInput,
  CoordinatePlotSamplingResult,
  CoordinatePlotSeriesSamplingResult,
  PlotSamplingDiagnostic,
  PlotSamplingStopReason,
  SampledPlotSeries,
} from "./types";

function resolvedBudget(
  requested: number | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): number {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.floor(
        requested !== undefined && Number.isFinite(requested)
          ? requested
          : fallback,
      ),
    ),
  );
}

function exhaustedSample(reason: PlotSamplingStopReason): SampledPlotSeries {
  return { ...emptySample(), stopReason: reason, truncated: true };
}

export function sampleCoordinatePlotDefinition(
  input: CoordinatePlotSamplingInput,
): CoordinatePlotSamplingResult {
  const geometryDiagnostics = invalidGeometryDiagnostics(input);
  const parameterDiagnostics = invalidParameterDiagnostics(input.definition);
  const commonDiagnostics = [...geometryDiagnostics, ...parameterDiagnostics];
  const parameterNames = input.definition.parameters.map(({ name }) => name);
  const bindings = parameterBindings(input.definition);
  const totalPointLimit = resolvedBudget(
    input.options?.maximumTotalPoints,
    maximumSamplePointsPerCoordinatePlot,
    maximumSamplePointsPerCoordinatePlot,
    2,
  );
  const totalEvaluationLimit = resolvedBudget(
    input.options?.maximumTotalEvaluations,
    maximumSamplingEvaluationsPerCoordinatePlot,
    maximumSamplingEvaluationsPerCoordinatePlot,
    1,
  );
  const seriesPointLimit = resolvedBudget(
    input.options?.sampling?.pointLimit,
    maximumSamplePointsPerSeries,
    maximumSamplePointsPerSeries,
    2,
  );
  const seriesEvaluationLimit = resolvedBudget(
    input.options?.sampling?.maximumEvaluations,
    maximumSamplingEvaluationsPerSeries,
    maximumSamplingEvaluationsPerSeries,
    1,
  );
  const results: CoordinatePlotSeriesSamplingResult[] = [];
  let totalPointCount = 0;
  let consumedEvaluationCount = 0;
  let cacheHits = 0;
  let truncated = false;

  for (const series of input.definition.series) {
    if (!series.visible) {
      results.push({
        cacheHit: false,
        diagnostics: [],
        kind: series.kind,
        sample: null,
        seriesId: series.id,
        status: "hidden",
      });
      continue;
    }
    if (commonDiagnostics.length > 0) {
      results.push({
        cacheHit: false,
        diagnostics: commonDiagnostics,
        kind: series.kind,
        sample: null,
        seriesId: series.id,
        status: "invalid",
      });
      continue;
    }

    const remainingPoints = Math.max(0, totalPointLimit - totalPointCount);
    const remainingEvaluations = Math.max(
      0,
      totalEvaluationLimit - consumedEvaluationCount,
    );
    if (remainingPoints < 2 || remainingEvaluations < 1) {
      const pointLimitReached = remainingPoints < 2;
      const reason = pointLimitReached ? "point-limit" : "evaluation-limit";
      results.push({
        cacheHit: false,
        diagnostics: [
          diagnostic(
            pointLimitReached
              ? "sampling.total-point-limit"
              : "sampling.total-evaluation-limit",
            "series",
            pointLimitReached
              ? "The coordinate plot reached its total sampled-point limit."
              : "The coordinate plot reached its total evaluation limit.",
          ),
        ],
        kind: series.kind,
        sample: exhaustedSample(reason),
        seriesId: series.id,
        status: "truncated",
      });
      truncated = true;
      continue;
    }

    const effectivePointLimit = Math.min(seriesPointLimit, remainingPoints);
    const effectiveEvaluationLimit = Math.min(
      seriesEvaluationLimit,
      remainingEvaluations,
    );
    const sampled = sampleSeries({
      bindings,
      definition: input.definition,
      options: {
        ...input.options?.sampling,
        maximumEvaluations: effectiveEvaluationLimit,
        pointLimit: effectivePointLimit,
      },
      parameterNames,
      parent: input,
      series,
    });
    if (!sampled.ok) {
      results.push({
        cacheHit: false,
        diagnostics: sampled.diagnostics,
        kind: series.kind,
        sample: null,
        seriesId: series.id,
        status: "invalid",
      });
      continue;
    }

    if (sampled.cacheHit) cacheHits += 1;
    const sample = sampled.sample;
    totalPointCount += sample.metrics.pointCount;
    if (!sampled.cacheHit) {
      consumedEvaluationCount += sample.metrics.evaluationCount;
    }
    const status = resultStatus(sample);
    if (status === "truncated" || status === "aborted") truncated = true;
    const diagnostics: PlotSamplingDiagnostic[] = [];
    if (
      sample.stopReason === "point-limit" &&
      effectivePointLimit < seriesPointLimit
    ) {
      diagnostics.push(
        diagnostic(
          "sampling.total-point-limit",
          "series",
          "The coordinate plot reached its total sampled-point limit.",
        ),
      );
    }
    if (
      sample.stopReason === "evaluation-limit" &&
      effectiveEvaluationLimit < seriesEvaluationLimit
    ) {
      diagnostics.push(
        diagnostic(
          "sampling.total-evaluation-limit",
          "series",
          "The coordinate plot reached its total evaluation limit.",
        ),
      );
    }
    results.push({
      cacheHit: sampled.cacheHit,
      diagnostics,
      kind: series.kind,
      sample,
      seriesId: series.id,
      status,
    });
  }

  return {
    cacheHits,
    samplerVersion: coordinatePlotSamplerVersion,
    series: results,
    totalPointCount,
    truncated,
  };
}
