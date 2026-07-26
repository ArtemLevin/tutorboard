import type { Vec2 } from "../../core/public";

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

export function simplifyStroke(
  points: readonly Vec2[],
  tolerance = 0.75,
): readonly Vec2[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(
      "Stroke tolerance must be a finite non-negative value.",
    );
  }
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
