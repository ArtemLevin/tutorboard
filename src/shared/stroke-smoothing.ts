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
  readonly simplificationTolerance?: number;
  readonly zoom: number;
}

export interface StrokeSmoothingQuality {
  readonly maxOutputPoints: number;
  readonly minPointDistance: number;
  readonly simplificationTolerance: number;
  readonly subdivisions: number;
  readonly targetSegmentLength: number;
  readonly zoomBucket: number;
}

const defaultMaximumOutputPoints = 20_000;
const defaultMaximumNormalizedPoints = 6_000;
const cachedOpenStrokes = new WeakMap<
  readonly StrokePoint[],
  Map<number, readonly StrokePoint[]>
>();
const cachedClosedStrokes = new WeakMap<
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

function squaredSegmentDistance(
  point: StrokePoint,
  start: StrokePoint,
  end: StrokePoint,
): number {
  let x = start.x;
  let y = start.y;
  const deltaX = end.x - x;
  const deltaY = end.y - y;
  if (deltaX !== 0 || deltaY !== 0) {
    const ratio = clamp(
      ((point.x - x) * deltaX + (point.y - y) * deltaY) /
        (deltaX * deltaX + deltaY * deltaY),
      0,
      1,
    );
    x += deltaX * ratio;
    y += deltaY * ratio;
  }
  const distanceX = point.x - x;
  const distanceY = point.y - y;
  return distanceX * distanceX + distanceY * distanceY;
}

export function simplifyStrokePoints(
  points: readonly StrokePoint[],
  tolerance: number,
): readonly StrokePoint[] {
  const finite = points.filter(finitePoint);
  if (finite.length <= 2 || tolerance <= 0) return finite;

  const retained = new Uint8Array(finite.length);
  retained[0] = 1;
  retained[finite.length - 1] = 1;
  const threshold = tolerance * tolerance;
  const ranges: Array<readonly [number, number]> = [[0, finite.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    let furthestIndex = -1;
    let furthestDistance = threshold;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const candidateDistance = squaredSegmentDistance(
        finite[index]!,
        finite[startIndex]!,
        finite[endIndex]!,
      );
      if (candidateDistance > furthestDistance) {
        furthestDistance = candidateDistance;
        furthestIndex = index;
      }
    }
    if (furthestIndex !== -1) {
      retained[furthestIndex] = 1;
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }
  return finite.filter((_point, index) => retained[index] === 1);
}

function simplifyClosedStrokePoints(
  points: readonly StrokePoint[],
  tolerance: number,
): readonly StrokePoint[] {
  if (points.length <= 4 || tolerance <= 0) return points;
  const first = points[0]!;
  let oppositeIndex = 1;
  let oppositeDistance = -1;
  for (let index = 1; index < points.length; index += 1) {
    const candidateDistance = distance(first, points[index]!);
    if (candidateDistance > oppositeDistance) {
      oppositeDistance = candidateDistance;
      oppositeIndex = index;
    }
  }
  if (oppositeIndex <= 0 || oppositeIndex >= points.length) return points;

  const firstArc = simplifyStrokePoints(
    points.slice(0, oppositeIndex + 1),
    tolerance,
  );
  const secondArc = simplifyStrokePoints(
    [...points.slice(oppositeIndex), first],
    tolerance,
  );
  return [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)];
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

export function buildClosedCatmullRomSpline(
  points: readonly StrokePoint[],
  options: CatmullRomOptions,
): readonly StrokePoint[] {
  const finite = points.filter(finitePoint);
  if (finite.length <= 2) return [...finite];
  const first = finite[0]!;
  const last = finite.at(-1)!;
  const source =
    finite.length > 3 && distance(first, last) <= 0.001
      ? finite.slice(0, -1)
      : finite;
  if (source.length <= 2) return [...source];

  const requestedSubdivisions = Math.max(1, Math.floor(options.subdivisions));
  const maximum = Math.max(
    source.length + 1,
    Math.floor(options.maxOutputPoints ?? defaultMaximumOutputPoints),
  );
  const maximumSubdivisions = Math.max(
    1,
    Math.floor((maximum - 1) / source.length),
  );
  const subdivisions = Math.min(requestedSubdivisions, maximumSubdivisions);
  const output: StrokePoint[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const p0 = source[(index - 1 + source.length) % source.length]!;
    const p1 = source[index]!;
    const p2 = source[(index + 1) % source.length]!;
    const p3 = source[(index + 2) % source.length]!;
    for (let step = 0; step < subdivisions; step += 1) {
      output.push(catmullRomPoint(p0, p1, p2, p3, step / subdivisions));
    }
  }

  if (output.length > 0) output.push(output[0]!);
  return output;
}

export function resolveStrokeSmoothingQuality(
  points: readonly StrokePoint[],
  options: SmoothStrokeOptions,
): StrokeSmoothingQuality {
  const zoom = clamp(Number.isFinite(options.zoom) ? options.zoom : 1, 0.1, 8);
  const zoomBucket = Math.round(zoom * 4) / 4;
  const screenScale = Math.max(0.1, zoomBucket);
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
      Math.max(0.05, options.minPointDistance ?? 0.4) / screenScale,
    simplificationTolerance:
      Math.max(0.01, options.simplificationTolerance ?? 0.18) / screenScale,
    subdivisions: Math.min(
      maximumSubdivisions,
      minimumSubdivisions + zoomGain + lengthGain,
    ),
    targetSegmentLength:
      Math.max(0.5, options.baseSegmentLength ?? 4) / screenScale,
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
  const simplified = simplifyStrokePoints(
    rawPoints,
    quality.simplificationTolerance,
  );
  const normalized = normalizeStrokePoints(simplified, {
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

export function buildSmoothClosedStrokePoints(
  rawPoints: readonly StrokePoint[],
  options: SmoothStrokeOptions,
): readonly StrokePoint[] {
  const finite = rawPoints.filter(finitePoint);
  if (finite.length <= 2) return finite;
  const first = finite[0]!;
  const last = finite.at(-1)!;
  const source =
    finite.length > 3 && distance(first, last) <= 0.001
      ? finite.slice(0, -1)
      : finite;
  if (source.length <= 2) return source;

  const quality = resolveStrokeSmoothingQuality(
    [...source, source[0]!],
    options,
  );
  const simplified = simplifyClosedStrokePoints(
    source,
    quality.simplificationTolerance,
  );
  const normalizedLoop = normalizeStrokePoints(
    [...simplified, simplified[0]!],
    {
      maxInsertedPointsPerSegment: 24,
      maxNormalizedPoints: Math.min(
        defaultMaximumNormalizedPoints,
        quality.maxOutputPoints,
      ),
      minPointDistance: quality.minPointDistance,
      targetSegmentLength: quality.targetSegmentLength,
    },
  );
  const normalized =
    normalizedLoop.length > 1 &&
    distance(normalizedLoop[0]!, normalizedLoop.at(-1)!) <= 0.001
      ? normalizedLoop.slice(0, -1)
      : normalizedLoop;
  return buildClosedCatmullRomSpline(normalized, {
    maxOutputPoints: quality.maxOutputPoints,
    subdivisions: quality.subdivisions,
  });
}

function cacheFor(
  cache: WeakMap<readonly StrokePoint[], Map<number, readonly StrokePoint[]>>,
  rawPoints: readonly StrokePoint[],
): Map<number, readonly StrokePoint[]> {
  let byZoom = cache.get(rawPoints);
  if (byZoom === undefined) {
    byZoom = new Map();
    cache.set(rawPoints, byZoom);
  }
  return byZoom;
}

export function buildCachedSmoothStrokePoints(
  rawPoints: readonly StrokePoint[],
  zoom: number,
): readonly StrokePoint[] {
  const quality = resolveStrokeSmoothingQuality(rawPoints, { zoom });
  const byZoom = cacheFor(cachedOpenStrokes, rawPoints);
  const cached = byZoom.get(quality.zoomBucket);
  if (cached !== undefined) return cached;
  const smoothed = buildSmoothStrokePoints(rawPoints, {
    maxOutputPoints: quality.maxOutputPoints,
    maxSubdivisions: quality.subdivisions,
    minSubdivisions: quality.subdivisions,
    zoom: quality.zoomBucket,
  });
  byZoom.set(quality.zoomBucket, smoothed);
  return smoothed;
}

export function buildCachedSmoothClosedStrokePoints(
  rawPoints: readonly StrokePoint[],
  zoom: number,
): readonly StrokePoint[] {
  const quality = resolveStrokeSmoothingQuality(rawPoints, { zoom });
  const byZoom = cacheFor(cachedClosedStrokes, rawPoints);
  const cached = byZoom.get(quality.zoomBucket);
  if (cached !== undefined) return cached;
  const smoothed = buildSmoothClosedStrokePoints(rawPoints, {
    maxOutputPoints: quality.maxOutputPoints,
    maxSubdivisions: quality.subdivisions,
    minSubdivisions: quality.subdivisions,
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
