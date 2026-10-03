import type { VectorInkSample, Vec2 } from "../../core/public";

function squaredSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  let x = start.x;
  let y = start.y;
  const deltaX = end.x - x;
  const deltaY = end.y - y;
  if (deltaX !== 0 || deltaY !== 0) {
    const ratio = Math.max(
      0,
      Math.min(
        1,
        ((point.x - x) * deltaX + (point.y - y) * deltaY) /
          (deltaX * deltaX + deltaY * deltaY),
      ),
    );
    x += deltaX * ratio;
    y += deltaY * ratio;
  }
  const distanceX = point.x - x;
  const distanceY = point.y - y;
  return distanceX * distanceX + distanceY * distanceY;
}

function assertTolerance(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative value.`);
  }
}

function interpolationRatio(
  samples: readonly VectorInkSample[],
  startIndex: number,
  endIndex: number,
  index: number,
): number {
  const start = samples[startIndex]!;
  const end = samples[endIndex]!;
  const current = samples[index]!;
  const timestampSpan = end.timestampMs - start.timestampMs;
  if (timestampSpan > 0) {
    return Math.max(
      0,
      Math.min(1, (current.timestampMs - start.timestampMs) / timestampSpan),
    );
  }
  return (index - startIndex) / (endIndex - startIndex);
}

function normalizedErrorScore(value: number, tolerance: number): number {
  if (tolerance === 0) return value > 0 ? Number.POSITIVE_INFINITY : 0;
  return value / tolerance;
}

export function simplifyStroke(
  points: readonly Vec2[],
  tolerance = 0.75,
): readonly Vec2[] {
  assertTolerance(tolerance, "Stroke tolerance");
  if (points.length <= 2 || tolerance === 0) {
    return points;
  }

  const retained = new Uint8Array(points.length);
  retained[0] = 1;
  retained[points.length - 1] = 1;
  const threshold = tolerance * tolerance;
  const ranges: Array<readonly [number, number]> = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    let furthestIndex = -1;
    let furthestDistance = threshold;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = squaredSegmentDistance(
        points[index]!,
        points[startIndex]!,
        points[endIndex]!,
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex !== -1) {
      retained[furthestIndex] = 1;
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }
  return points.filter((_point, index) => retained[index] === 1);
}

/**
 * Simplifies pen samples while retaining both geometric detail and meaningful
 * pressure changes. Pressure is compared against the value linearly
 * interpolated between each candidate range's endpoints, so a pressure peak on
 * an otherwise straight segment remains part of the persisted Vector Ink.
 */
export function simplifyVectorInkSamples(
  samples: readonly VectorInkSample[],
  spatialTolerance = 0.75,
  pressureTolerance = 0.05,
): readonly VectorInkSample[] {
  assertTolerance(spatialTolerance, "Stroke spatial tolerance");
  assertTolerance(pressureTolerance, "Stroke pressure tolerance");
  if (
    samples.length <= 2 ||
    (spatialTolerance === 0 && pressureTolerance === 0)
  ) {
    return samples;
  }

  const retained = new Uint8Array(samples.length);
  retained[0] = 1;
  retained[samples.length - 1] = 1;
  const spatialThreshold = spatialTolerance * spatialTolerance;
  const ranges: Array<readonly [number, number]> = [[0, samples.length - 1]];

  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    const start = samples[startIndex]!;
    const end = samples[endIndex]!;
    let furthestIndex = -1;
    let furthestScore = 1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const sample = samples[index]!;
      const spatialDistance = squaredSegmentDistance(
        sample.point,
        start.point,
        end.point,
      );
      const spatialScore =
        spatialTolerance === 0
          ? spatialDistance > 0
            ? Number.POSITIVE_INFINITY
            : 0
          : spatialDistance / spatialThreshold;
      const ratio = interpolationRatio(samples, startIndex, endIndex, index);
      const interpolatedPressure =
        start.pressure + (end.pressure - start.pressure) * ratio;
      const pressureScore = normalizedErrorScore(
        Math.abs(sample.pressure - interpolatedPressure),
        pressureTolerance,
      );
      const score = Math.max(spatialScore, pressureScore);
      if (score > furthestScore) {
        furthestScore = score;
        furthestIndex = index;
      }
    }

    if (furthestIndex !== -1) {
      retained[furthestIndex] = 1;
      ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }

  return samples.filter((_sample, index) => retained[index] === 1);
}
