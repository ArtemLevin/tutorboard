import {
  sampleExplicitSeries as sampleExplicitSeriesRaw,
  sampleParametricSeries as sampleParametricSeriesRaw,
} from "./sampler";
import { sampleRelationSeries as sampleRelationSeriesRaw } from "./relation-sampler";
import type {
  ExplicitPlotSamplingInput,
  ParametricPlotSamplingInput,
  RelationPlotSamplingInput,
  PlotSamplingOptions,
  SampledPlotSeries,
} from "./types";

function finiteOption(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function sanitizeOptions(
  options: PlotSamplingOptions | undefined,
): PlotSamplingOptions | undefined {
  if (options === undefined) return undefined;
  return {
    initialIntervals: finiteOption(options.initialIntervals),
    maximumDepth: finiteOption(options.maximumDepth),
    maximumEvaluations: finiteOption(options.maximumEvaluations),
    maximumSegmentPixels: finiteOption(options.maximumSegmentPixels),
    pointLimit: finiteOption(options.pointLimit),
    tolerancePixels: finiteOption(options.tolerancePixels),
  };
}

export function sampleExplicitSeries(
  input: ExplicitPlotSamplingInput,
): SampledPlotSeries {
  return sampleExplicitSeriesRaw({
    ...input,
    options: sanitizeOptions(input.options),
  });
}

export function sampleParametricSeries(
  input: ParametricPlotSamplingInput,
): SampledPlotSeries {
  return sampleParametricSeriesRaw({
    ...input,
    options: sanitizeOptions(input.options),
  });
}

export function sampleRelationSeries(
  input: RelationPlotSamplingInput,
): SampledPlotSeries {
  return sampleRelationSeriesRaw({
    ...input,
    options: sanitizeOptions(input.options),
  });
}
