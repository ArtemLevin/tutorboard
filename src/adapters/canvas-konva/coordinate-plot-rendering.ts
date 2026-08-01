import {
  plotDataToLocalPoint,
  type CoordinatePlotGrid,
  type CoordinatePlotViewport,
  type PlotLegendPosition,
  type PlotLineStyle,
  type Size2,
} from "../../core/public";

const maximumTickCount = 512;
const minimumLegendWidth = 132;
const maximumLegendWidth = 280;
const legendRowHeight = 24;

export interface PlotRenderTick {
  readonly label: string;
  readonly position: number;
  readonly value: number;
}

export interface PlotGridRenderModel {
  readonly majorX: readonly PlotRenderTick[];
  readonly majorY: readonly PlotRenderTick[];
  readonly minorX: readonly number[];
  readonly minorY: readonly number[];
  readonly xStep: number;
  readonly yStep: number;
}

export interface PlotLegendLayout {
  readonly height: number;
  readonly rowHeight: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeZero(value: number): number {
  return Math.abs(value) <= Number.EPSILON * 32 ? 0 : value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveCoordinatePlotViewport(
  viewport: CoordinatePlotViewport,
  size: Size2,
): CoordinatePlotViewport {
  if (!viewport.equalScale) return viewport;

  const width = finitePositive(size.width, 1);
  const height = finitePositive(size.height, 1);
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  if (!(xSpan > 0) || !(ySpan > 0)) return viewport;

  const xPixelsPerUnit = width / xSpan;
  const yPixelsPerUnit = height / ySpan;
  if (Math.abs(xPixelsPerUnit - yPixelsPerUnit) <= 1e-12) return viewport;

  if (xPixelsPerUnit > yPixelsPerUnit) {
    const targetSpan = width / yPixelsPerUnit;
    const center = (viewport.xMin + viewport.xMax) / 2;
    return {
      ...viewport,
      xMax: center + targetSpan / 2,
      xMin: center - targetSpan / 2,
    };
  }

  const targetSpan = height / xPixelsPerUnit;
  const center = (viewport.yMin + viewport.yMax) / 2;
  return {
    ...viewport,
    yMax: center + targetSpan / 2,
    yMin: center - targetSpan / 2,
  };
}

export function choosePlotGridStep(
  minimum: number,
  maximum: number,
  pixels: number,
  targetPixels = 80,
): number {
  const span = maximum - minimum;
  const safePixels = finitePositive(pixels, 1);
  const safeTarget = clamp(finitePositive(targetPixels, 80), 40, 160);
  if (!(span > 0) || !Number.isFinite(span)) return 1;

  const rawStep = span / Math.max(1, safePixels / safeTarget);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier =
    normalized <= 1.5 ? 1 : normalized <= 3.5 ? 2 : normalized <= 7.5 ? 5 : 10;
  return multiplier * magnitude;
}

function decimalPlaces(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  return clamp(Math.max(0, -Math.floor(Math.log10(step)) + 1), 0, 8);
}

export function formatPlotTick(value: number, step: number): string {
  const normalized = normalizeZero(value);
  if (normalized === 0) return "0";
  const absolute = Math.abs(normalized);
  if (absolute >= 1_000_000 || absolute < 0.0001) {
    return normalized
      .toExponential(3)
      .replace(/\.0+(?=e)/u, "")
      .replace(/(\.\d*?[1-9])0+(?=e)/u, "$1")
      .replace("e+", "e");
  }
  return normalized
    .toFixed(decimalPlaces(step))
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?[1-9])0+$/u, "$1");
}

export function enumeratePlotTicks(
  minimum: number,
  maximum: number,
  step: number,
): readonly number[] {
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    !Number.isFinite(step) ||
    !(minimum < maximum) ||
    !(step > 0)
  ) {
    return [];
  }

  const epsilon = step * 1e-9;
  const start = Math.ceil((minimum - epsilon) / step) * step;
  const ticks: number[] = [];
  for (let index = 0; index < maximumTickCount; index += 1) {
    const value = start + index * step;
    if (value > maximum + epsilon) break;
    ticks.push(normalizeZero(value));
  }
  return ticks;
}

function alignedWithStep(value: number, step: number): boolean {
  if (!(step > 0)) return false;
  return Math.abs(value / step - Math.round(value / step)) <= 1e-7;
}

function renderTicks(
  values: readonly number[],
  axis: "x" | "y",
  viewport: CoordinatePlotViewport,
  size: Size2,
  step: number,
): readonly PlotRenderTick[] {
  return values.map((value) => {
    const point = plotDataToLocalPoint(
      axis === "x" ? { x: value, y: 0 } : { x: 0, y: value },
      viewport,
      size,
    );
    return {
      label: formatPlotTick(value, step),
      position: axis === "x" ? point.x : point.y,
      value,
    };
  });
}

export function createPlotGridRenderModel(
  grid: CoordinatePlotGrid,
  viewport: CoordinatePlotViewport,
  size: Size2,
): PlotGridRenderModel {
  const automaticXStep = choosePlotGridStep(
    viewport.xMin,
    viewport.xMax,
    size.width,
  );
  const automaticYStep = choosePlotGridStep(
    viewport.yMin,
    viewport.yMax,
    size.height,
  );
  const xStep =
    grid.automaticStep || grid.xStep === null
      ? automaticXStep
      : finitePositive(grid.xStep, automaticXStep);
  const yStep =
    grid.automaticStep || grid.yStep === null
      ? automaticYStep
      : finitePositive(grid.yStep, automaticYStep);
  const majorXValues = enumeratePlotTicks(viewport.xMin, viewport.xMax, xStep);
  const majorYValues = enumeratePlotTicks(viewport.yMin, viewport.yMax, yStep);
  const minorXStep = xStep / 5;
  const minorYStep = yStep / 5;
  const minorX = enumeratePlotTicks(viewport.xMin, viewport.xMax, minorXStep)
    .filter((value) => !alignedWithStep(value, xStep))
    .map((value) => plotDataToLocalPoint({ x: value, y: 0 }, viewport, size).x);
  const minorY = enumeratePlotTicks(viewport.yMin, viewport.yMax, minorYStep)
    .filter((value) => !alignedWithStep(value, yStep))
    .map((value) => plotDataToLocalPoint({ x: 0, y: value }, viewport, size).y);

  return {
    majorX: renderTicks(majorXValues, "x", viewport, size, xStep),
    majorY: renderTicks(majorYValues, "y", viewport, size, yStep),
    minorX,
    minorY,
    xStep,
    yStep,
  };
}

export function plotLineDash(
  style: PlotLineStyle,
  strokeWidth: number,
): readonly number[] {
  const width = finitePositive(strokeWidth, 1);
  if (style === "dashed") return [4 * width, 3 * width];
  if (style === "dash-dot") {
    return [6 * width, 2.5 * width, 1.5 * width, 2.5 * width];
  }
  return [];
}

export function flattenPlotSegment(
  points: readonly { readonly x: number; readonly y: number }[],
): readonly number[] {
  return points.flatMap(({ x, y }) => [x, y]);
}

export function createPlotLegendLayout(
  position: PlotLegendPosition,
  names: readonly string[],
  size: Size2,
): PlotLegendLayout {
  const margin = 10;
  const longest = names.reduce(
    (length, name) => Math.max(length, name.length),
    0,
  );
  const width = clamp(
    58 + longest * 7,
    minimumLegendWidth,
    Math.min(maximumLegendWidth, Math.max(minimumLegendWidth, size.width - 20)),
  );
  const height = Math.max(34, 12 + names.length * legendRowHeight);
  const right = position.endsWith("right");
  const bottom = position.startsWith("bottom");
  return {
    height,
    rowHeight: legendRowHeight,
    width,
    x: right ? Math.max(margin, size.width - width - margin) : margin,
    y: bottom ? Math.max(margin, size.height - height - margin) : margin,
  };
}
