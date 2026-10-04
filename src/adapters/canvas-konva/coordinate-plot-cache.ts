import {
  createPlotSamplingCache,
  type PlotSamplingCache,
} from "../../core/public";

export const coordinatePlotSamplingCache: PlotSamplingCache =
  createPlotSamplingCache();

export function clearCoordinatePlotSamplingCache(): void {
  coordinatePlotSamplingCache.clear();
}

export function coordinatePlotSamplingCacheSize(): number {
  return coordinatePlotSamplingCache.size;
}
