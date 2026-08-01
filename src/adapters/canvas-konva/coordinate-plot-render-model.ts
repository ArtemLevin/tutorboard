import {
  plotDataToLocalPoint,
  sampleCoordinatePlotDefinition,
  type CoordinatePlotDefinition,
  type CoordinatePlotObject,
  type CoordinatePlotSamplingResult,
  type PlotSamplingCache,
} from "../../core/public";
import {
  createPlotGridRenderModel,
  resolveCoordinatePlotViewport,
  type PlotGridRenderModel,
} from "./coordinate-plot-rendering";

export interface CoordinatePlotRenderModel {
  readonly definition: CoordinatePlotDefinition;
  readonly grid: PlotGridRenderModel;
  readonly sampling: CoordinatePlotSamplingResult;
  readonly xAxisY: number | null;
  readonly yAxisX: number | null;
}

export interface CreateCoordinatePlotRenderModelInput {
  readonly cache?: PlotSamplingCache | undefined;
  readonly object: CoordinatePlotObject;
  readonly zoom: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function includesZero(minimum: number, maximum: number): boolean {
  return minimum <= 0 && maximum >= 0;
}

export function createCoordinatePlotRenderModel({
  cache,
  object,
  zoom,
}: CreateCoordinatePlotRenderModelInput): CoordinatePlotRenderModel {
  const viewport = resolveCoordinatePlotViewport(
    object.definition.coordinateViewport,
    object.definition.size,
  );
  const definition =
    viewport === object.definition.coordinateViewport
      ? object.definition
      : { ...object.definition, coordinateViewport: viewport };
  const objectScale = Math.max(
    Math.abs(object.scale.x),
    Math.abs(object.scale.y),
    0.01,
  );
  const boardZoom = finitePositive(zoom, 1) * objectScale;
  const sampling = sampleCoordinatePlotDefinition({
    boardZoom,
    ...(cache === undefined ? {} : { cache }),
    definition,
    pixelSize: definition.size,
  });
  const origin = plotDataToLocalPoint(
    { x: 0, y: 0 },
    viewport,
    definition.size,
  );

  return {
    definition,
    grid: createPlotGridRenderModel(
      definition.grid,
      viewport,
      definition.size,
    ),
    sampling,
    xAxisY: includesZero(viewport.yMin, viewport.yMax) ? origin.y : null,
    yAxisX: includesZero(viewport.xMin, viewport.xMax) ? origin.x : null,
  };
}
