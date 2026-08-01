import {
  coordinatePlotSamplerVersion,
  maximumSamplePointsPerCoordinatePlot,
} from "./limits";
import {
  diagnostic,
  invalidGeometryDiagnostics,
  invalidParameterDiagnostics,
  parameterBindings,
} from "./preparation";
import { resultStatus, sampleSeries, truncateSample } from "./series-sampler";
import type {
  CoordinatePlotSamplingInput,
  CoordinatePlotSamplingResult,
  CoordinatePlotSeriesSamplingResult,
} from "./types";

export function sampleCoordinatePlotDefinition(
  input: CoordinatePlotSamplingInput,
): CoordinatePlotSamplingResult {
  const geometryDiagnostics = invalidGeometryDiagnostics(input);
  const parameterDiagnostics = invalidParameterDiagnostics(input.definition);
  const commonDiagnostics = [...geometryDiagnostics, ...parameterDiagnostics];
  const parameterNames = input.definition.parameters.map(({ name }) => name);
  const bindings = parameterBindings(input.definition);
  const requestedTotalPoints = input.options?.maximumTotalPoints;
  const totalLimit = Math.max(
    2,
    Math.min(
      maximumSamplePointsPerCoordinatePlot,
      Math.floor(
        requestedTotalPoints !== undefined &&
          Number.isFinite(requestedTotalPoints)
          ? requestedTotalPoints
          : maximumSamplePointsPerCoordinatePlot,
      ),
    ),
  );
  const results: CoordinatePlotSeriesSamplingResult[] = [];
  let totalPointCount = 0;
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
    const sampled = sampleSeries({
      bindings,
      definition: input.definition,
      options: input.options?.sampling,
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
    const remaining = Math.max(0, totalLimit - totalPointCount);
    const sample = truncateSample(sampled.sample, remaining);
    if (sample.metrics.pointCount < sampled.sample.metrics.pointCount) {
      truncated = true;
    }
    totalPointCount += sample.metrics.pointCount;
    const status = resultStatus(sample);
    if (status === "truncated" || status === "aborted") truncated = true;
    const diagnostics =
      remaining < sampled.sample.metrics.pointCount
        ? [
            diagnostic(
              "sampling.total-point-limit",
              "series",
              "The coordinate plot reached its total sampled-point limit.",
            ),
          ]
        : [];
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
