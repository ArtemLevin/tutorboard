import type { Size2, Vec2 } from "../board/primitives";

export interface PlotCoordinateViewport {
  readonly xMax: number;
  readonly xMin: number;
  readonly yMax: number;
  readonly yMin: number;
}

export function plotViewportIsValid(viewport: PlotCoordinateViewport): boolean {
  return (
    Number.isFinite(viewport.xMin) &&
    Number.isFinite(viewport.xMax) &&
    Number.isFinite(viewport.yMin) &&
    Number.isFinite(viewport.yMax) &&
    viewport.xMin < viewport.xMax &&
    viewport.yMin < viewport.yMax
  );
}

export function plotPixelSizeIsValid(pixelSize: Size2): boolean {
  return (
    Number.isFinite(pixelSize.width) &&
    Number.isFinite(pixelSize.height) &&
    pixelSize.width > 0 &&
    pixelSize.height > 0
  );
}

export function plotDataToLocalPoint(
  point: Vec2,
  viewport: PlotCoordinateViewport,
  pixelSize: Size2,
): Vec2 {
  return {
    x:
      ((point.x - viewport.xMin) / (viewport.xMax - viewport.xMin)) *
      pixelSize.width,
    y:
      ((viewport.yMax - point.y) / (viewport.yMax - viewport.yMin)) *
      pixelSize.height,
  };
}

export function plotLocalToDataPoint(
  point: Vec2,
  viewport: PlotCoordinateViewport,
  pixelSize: Size2,
): Vec2 {
  return {
    x:
      viewport.xMin +
      (point.x / pixelSize.width) * (viewport.xMax - viewport.xMin),
    y:
      viewport.yMax -
      (point.y / pixelSize.height) * (viewport.yMax - viewport.yMin),
  };
}

export function plotLocalPointIsFinite(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
