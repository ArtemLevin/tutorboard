import type { Size2, Vec2 } from "../board/primitives";

const maximumClippingCoordinate = 1_000_000_000;

function boundedCoordinate(value: number): number {
  return Math.max(
    -maximumClippingCoordinate,
    Math.min(maximumClippingCoordinate, value),
  );
}

function boundedPoint(point: Vec2): Vec2 {
  return {
    x: boundedCoordinate(point.x),
    y: boundedCoordinate(point.y),
  };
}

export interface ClippedPlotEdge {
  readonly end: Vec2;
  readonly start: Vec2;
}

export function clipPlotEdgeToPixelRect(
  startInput: Vec2,
  endInput: Vec2,
  pixelSize: Size2,
): ClippedPlotEdge | null {
  const start = boundedPoint(startInput);
  const end = boundedPoint(endInput);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimum = 0;
  let maximum = 1;

  for (const [p, q] of [
    [-dx, start.x],
    [dx, pixelSize.width - start.x],
    [-dy, start.y],
    [dy, pixelSize.height - start.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > maximum) return null;
      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) return null;
      maximum = Math.min(maximum, ratio);
    }
  }

  return {
    start: {
      x: start.x + minimum * dx,
      y: start.y + minimum * dy,
    },
    end: {
      x: start.x + maximum * dx,
      y: start.y + maximum * dy,
    },
  };
}
