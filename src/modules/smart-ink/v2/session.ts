import type { Vec2 } from "../../../core/public";

export interface SmartInkStrokeSessionItem {
  readonly endedAtMs: number;
  readonly id: string;
  readonly points: readonly Vec2[];
}

export interface SmartInkStrokeSession {
  readonly items: readonly SmartInkStrokeSessionItem[];
}

export const smartInkSessionPolicy = {
  maximumGapMs: 420,
  maximumItems: 6,
  spatialGapFactor: 0.65,
} as const;

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function diagonal(points: readonly Vec2[]): number {
  if (points.length === 0) return 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function near(left: readonly Vec2[], right: readonly Vec2[]): boolean {
  const scale = Math.max(8, diagonal(left), diagonal(right));
  let best = Number.POSITIVE_INFINITY;
  for (const a of left) {
    for (const b of right) best = Math.min(best, distance(a, b));
  }
  return best <= scale * smartInkSessionPolicy.spatialGapFactor;
}

export function appendSmartInkStrokeSession(
  session: SmartInkStrokeSession,
  item: SmartInkStrokeSessionItem,
): SmartInkStrokeSession {
  const previous = session.items.at(-1);
  const continues =
    previous !== undefined &&
    item.endedAtMs - previous.endedAtMs <= smartInkSessionPolicy.maximumGapMs &&
    near(previous.points, item.points);
  return {
    items: [...(continues ? session.items : []), item].slice(
      -smartInkSessionPolicy.maximumItems,
    ),
  };
}
