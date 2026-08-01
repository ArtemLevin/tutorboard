import type { CoordinatePlotViewport, Size2, Vec2 } from "../../core/public";

export type CoordinatePlotZoomAxis = "both" | "x" | "y";

const minimumViewportSpan = 1e-9;
const maximumViewportSpan = 1e12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function validSize(size: Size2): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function boundedSpan(span: number): number {
  return clamp(span, minimumViewportSpan, maximumViewportSpan);
}

export function panCoordinatePlotViewport(
  viewport: CoordinatePlotViewport,
  size: Size2,
  delta: Vec2,
): CoordinatePlotViewport {
  if (
    !validSize(size) ||
    !Number.isFinite(delta.x) ||
    !Number.isFinite(delta.y)
  ) {
    return viewport;
  }
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  const xShift = (-delta.x / size.width) * xSpan;
  const yShift = (delta.y / size.height) * ySpan;
  return {
    ...viewport,
    xMax: viewport.xMax + xShift,
    xMin: viewport.xMin + xShift,
    yMax: viewport.yMax + yShift,
    yMin: viewport.yMin + yShift,
  };
}

export function zoomCoordinatePlotViewportAt(
  viewport: CoordinatePlotViewport,
  size: Size2,
  anchor: Vec2,
  factor: number,
  axis: CoordinatePlotZoomAxis = "both",
): CoordinatePlotViewport {
  if (
    !validSize(size) ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y) ||
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    return viewport;
  }
  const xRatio = clamp(anchor.x / size.width, 0, 1);
  const yRatio = clamp(anchor.y / size.height, 0, 1);
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  const anchorX = viewport.xMin + xRatio * xSpan;
  const anchorY = viewport.yMax - yRatio * ySpan;
  const nextXSpan = axis === "y" ? xSpan : boundedSpan(xSpan * factor);
  const nextYSpan = axis === "x" ? ySpan : boundedSpan(ySpan * factor);
  return {
    equalScale: axis === "both" ? viewport.equalScale : false,
    xMax: anchorX + (1 - xRatio) * nextXSpan,
    xMin: anchorX - xRatio * nextXSpan,
    yMax: anchorY + yRatio * nextYSpan,
    yMin: anchorY - (1 - yRatio) * nextYSpan,
  };
}

function pointDistance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pointMidpoint(left: Vec2, right: Vec2): Vec2 {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function pinchCoordinatePlotViewport(
  viewport: CoordinatePlotViewport,
  size: Size2,
  startTouches: readonly [Vec2, Vec2],
  currentTouches: readonly [Vec2, Vec2],
  axis: CoordinatePlotZoomAxis = "both",
): CoordinatePlotViewport {
  const startDistance = pointDistance(startTouches[0], startTouches[1]);
  const currentDistance = pointDistance(currentTouches[0], currentTouches[1]);
  if (!(startDistance > 1e-6) || !(currentDistance > 1e-6)) return viewport;

  const startMidpoint = pointMidpoint(startTouches[0], startTouches[1]);
  const currentMidpoint = pointMidpoint(currentTouches[0], currentTouches[1]);
  const zoomed = zoomCoordinatePlotViewportAt(
    viewport,
    size,
    startMidpoint,
    clamp(startDistance / currentDistance, 0.05, 20),
    axis,
  );
  return panCoordinatePlotViewport(zoomed, size, {
    x: currentMidpoint.x - startMidpoint.x,
    y: currentMidpoint.y - startMidpoint.y,
  });
}
