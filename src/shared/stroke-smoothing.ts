export interface StrokePoint {
  readonly x: number;
  readonly y: number;
}

export interface ResampleStrokeOptions {
  readonly maxInsertedPointsPerSegment?: number;
  readonly maxNormalizedPoints?: number;
  readonly minPointDistance: number;
  readonly targetSegmentLength: number;
}

export interface CatmullRomOptions {
  readonly maxOutputPoints?: number;
  readonly subdivisions: number;
}

export interface SmoothStrokeOptions {
  readonly baseSegmentLength?: number;
  readonly maxOutputPoints?: number;
  readonly maxSubdivisions?: number;
  readonly minPointDistance?: number;
  readonly minSubdivisions?: number;
  readonly zoom: number;
}

export interface StrokeSmoothingQuality {
  readonly maxOutputPoints: number;
  readonly minPointDistance: number;
  readonly subdivisions: number;
  readonly targetSegmentLength: number;
  readonly zoomBucket: number;
}

const defaultMaximumOutputPoints = 20_000;
const defaultMaximumNormalizedPoints = 6_000;
const cachedStrokes = new WeakMap<
  readonly StrokePoint[],
  Map<number, readonly StrokePoint[]>
>();

function finitePoint(point: StrokePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distance(left: StrokePoint, right: StrokePoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function lerp(
  start: StrokePoint,
  finish: StrokePoint,
  progress: number,
): StrokePoint {
  return {
    x: start.x + (finish.x - start.x) * progress,
    y: start.y + (finish.y - start.y) * progress,
  };
}

export function pathLength(points: readonly StrokePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous !== undefined && point !== undefined) {
      length += distance(previous, point);
    }
  }
  return length;
}

function evenlyLimitPoints(
  points: readonly StrokePoint[],
  maximum: number,
): readonly StrokePoint[] {
  if (points.length <= maximum) return points;
  const output: StrokePoint[] = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index / (maximum - 1)) * lastIndex);
    const point = points[sourceIndex];
    if (point !== undefined) output.push(point);
  }
  return output;
}

export function normalizeStrokePoints(
  points: readonly StrokePoint[],
  options: ResampleStrokeOptions,
): readonly StrokePoint[] {
  const minimumDistance = Math.max(0, options.minPointDistance);
  const targetLength = Math.max(0.1, options.targetSegmentLength);
  const maxInserted = Math.max(
    0,
    Math.floor(options.maxInsertedPointsPerSegment ?? 24),
  );
  const maxNormalized = Math.max(
    2,
    Math.floor(options.maxNormalizedPoints ?? defaultMaximumNormalizedPoints),
  );
  const filtered: StrokePoint[] = [];

  for (const point of points) {
    if (!finitePoint(point)) continue;
    const previous = filtered.at(-1);
    if (
      previous === undefined ||
      distance(previous, point) >= minimumDistance
    ) {
      filtered.push(point);
    }
  }

  if (filtered.length <= 1) return filtered;

  const normalized: StrokePoint[] = [filtered[0]!];
  for (let index = 1; index < filtered.length; index += 1) {
    const start = filtered[index - 1]!;
    const finish = filtered[index]!;
    const segmentLength = distance(start, finish);
    const inserted = Math.min(
      maxInserted,
      Math.max(0, Math.ceil(segmentLength / targetLength) - 1),
    );
    for (let step = 1; step <= inserted; step += 1) {
      normalized.push(lerp(start, finish, step / (inserted + 1)));
    }
    normalized.push(finish);
  }

  return evenlyLimitPoints(normalized, maxNormalized);
}

function catmullRomPoint(
  p0: StrokePoint,
  p1: StrokePoint,
  p2: StrokePoint,
  p3: StrokePoint,
  progress: number,
): StrokePoint {
  const squared = progress * progress;
  const cubed = squared * progress;
  const point = {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * progress +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * squared +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * cubed),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * progress +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * squared +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * cubed),
  };
  const padding = Math.max(0.75, distance(p1, p2) * 0.18);
  return {
    x: clamp(
      point.x,
      Math.min(p1.x, p2.x) - padding,
      Math.max(p1.x, p2.x) + padding,
    ),
    y: clamp(
      point.y,
      Math.min(p1.y, p2.y) - padding,
      Math.max(p1.y, p2.y) + padding,
    ),
  };
}

export function buildCatmullRomSpline(
  points: readonly StrokePoint[],
  options: CatmullRomOptions,
): readonly StrokePoint[] {
  if (points.length <= 2) return [...points];
  const requestedSubdivisions = Math.max(1, Math.floor(options.subdivisions));
  const maximum = Math.max(
    points.length,
    Math.floor(options.maxOutputPoints ?? defaultMaximumOutputPoints),
  );
  const maximumSubdivisions = Math.max(
    1,
    Math.floor((maximum - 1) / (points.length - 1)),
  );
  const subdivisions = Math.min(requestedSubdivisions, maximumSubdivisions);
  const output: StrokePoint[] = [points[0]!];
  const lastIndex = points.length - 1;

  for (let index = 0; index < lastIndex; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(lastIndex, index + 2)]!;
    for (let step = 1; step <= subdivisions; step += 1) {
      output.push(catmullRomPoint(p0, p1, p2, p3, step / subdivisions));
    }
  }

  output[0] = points[0]!;
  output[output.length - 1] = points[lastIndex]!;
  return output;
}

export function resolveStrokeSmoothingQuality(
  points: readonly StrokePoint[],
  options: SmoothStrokeOptions,
): StrokeSmoothingQuality {
  const zoom = clamp(Number.isFinite(options.zoom) ? options.zoom : 1, 0.1, 8);
  const zoomBucket = Math.round(zoom * 4) / 4;
  const length = pathLength(points);
  const minimumSubdivisions = Math.max(
    2,
    Math.floor(options.minSubdivisions ?? 3),
  );
  const maximumSubdivisions = Math.max(
    minimumSubdivisions,
    Math.floor(options.maxSubdivisions ?? 12),
  );
  const zoomGain =
    zoomBucket < 1.5 ? 0 : zoomBucket < 3 ? 2 : zoomBucket < 6 ? 4 : 6;
  const lengthGain = length < 80 ? 0 : length < 240 ? 1 : 2;

  return {
    maxOutputPoints: Math.max(
      256,
      Math.floor(options.maxOutputPoints ?? defaultMaximumOutputPoints),
    ),
    minPointDistance:
      Math.max(0.05, options.minPointDistance ?? 0.7) /
      Math.sqrt(Math.max(1, zoomBucket)),
    subdivisions: Math.min(
      maximumSubdivisions,
      minimumSubdivisions + zoomGain + lengthGain,
    ),
    targetSegmentLength:
      Math.max(0.75, options.baseSegmentLength ?? 5) /
      Math.sqrt(Math.max(1, zoomBucket)),
    zoomBucket,
  };
}

export function buildSmoothStrokePoints(
  rawPoints: readonly StrokePoint[],
  options: SmoothStrokeOptions,
): readonly StrokePoint[] {
  if (rawPoints.length <= 2) {
    return rawPoints.filter(finitePoint);
  }
  const quality = resolveStrokeSmoothingQuality(rawPoints, options);
  const normalized = normalizeStrokePoints(rawPoints, {
    maxInsertedPointsPerSegment: 24,
    maxNormalizedPoints: Math.min(
      defaultMaximumNormalizedPoints,
      quality.maxOutputPoints,
    ),
    minPointDistance: quality.minPointDistance,
    targetSegmentLength: quality.targetSegmentLength,
  });
  return buildCatmullRomSpline(normalized, {
    maxOutputPoints: quality.maxOutputPoints,
    subdivisions: quality.subdivisions,
  });
}

export function buildCachedSmoothStrokePoints(
  rawPoints: readonly StrokePoint[],
  zoom: number,
): readonly StrokePoint[] {
  const quality = resolveStrokeSmoothingQuality(rawPoints, { zoom });
  let byZoom = cachedStrokes.get(rawPoints);
  if (byZoom === undefined) {
    byZoom = new Map();
    cachedStrokes.set(rawPoints, byZoom);
  }
  const cached = byZoom.get(quality.zoomBucket);
  if (cached !== undefined) return cached;
  const smoothed = buildSmoothStrokePoints(rawPoints, {
    maxOutputPoints: quality.maxOutputPoints,
    maxSubdivisions: quality.subdivisions,
    minPointDistance: quality.minPointDistance,
    minSubdivisions: quality.subdivisions,
    baseSegmentLength: quality.targetSegmentLength,
    zoom: quality.zoomBucket,
  });
  byZoom.set(quality.zoomBucket, smoothed);
  return smoothed;
}

export function flattenStrokePoints(
  points: readonly StrokePoint[],
): readonly number[] {
  return points.flatMap(({ x, y }) => [x, y]);
}
