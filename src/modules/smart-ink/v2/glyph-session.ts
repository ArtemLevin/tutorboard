import type { Vec2 } from "../../../core/public";

export interface SmartInkGlyphSessionStroke {
  readonly endedAtMs: number;
  readonly id: string;
  readonly points: readonly Vec2[];
}

export interface SmartInkGlyphSession {
  readonly pending: readonly SmartInkGlyphSessionStroke[];
}

export interface SmartInkGlyphSessionPolicy {
  readonly maximumGapMs: number;
  readonly maximumPointsPerGroup: number;
  readonly maximumPointsPerStroke: number;
  readonly maximumStrokesPerGroup: number;
  readonly minimumSpatialGap: number;
  readonly spatialGapFactor: number;
}

export const smartInkGlyphSessionPolicy: SmartInkGlyphSessionPolicy = {
  maximumGapMs: 900,
  maximumPointsPerGroup: 16_384,
  maximumPointsPerStroke: 4_096,
  maximumStrokesPerGroup: 12,
  minimumSpatialGap: 8,
  spatialGapFactor: 0.65,
};

export interface SmartInkGlyphSessionTransition {
  /** Groups ready for recognition; the caller owns their persistence. */
  readonly finalized: readonly (readonly SmartInkGlyphSessionStroke[])[];
  readonly session: SmartInkGlyphSession;
}

export const initialSmartInkGlyphSession: SmartInkGlyphSession = {
  pending: [],
};

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function bounds(strokes: readonly SmartInkGlyphSessionStroke[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function related(
  previous: readonly SmartInkGlyphSessionStroke[],
  incoming: SmartInkGlyphSessionStroke,
  policy: SmartInkGlyphSessionPolicy,
): boolean {
  const a = bounds(previous);
  const b = bounds([incoming]);
  const separationX = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const separationY = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const diagonal = Math.max(
    Math.hypot(a.maxX - a.minX, a.maxY - a.minY),
    Math.hypot(b.maxX - b.minX, b.maxY - b.minY),
  );
  return (
    Math.hypot(separationX, separationY) <=
    Math.max(policy.minimumSpatialGap, diagonal * policy.spatialGapFactor)
  );
}

function validateStroke(
  stroke: SmartInkGlyphSessionStroke,
  policy: SmartInkGlyphSessionPolicy,
): void {
  if (
    stroke.id.length === 0 ||
    stroke.id.length > 160 ||
    !Number.isFinite(stroke.endedAtMs) ||
    stroke.endedAtMs < 0 ||
    stroke.points.length === 0 ||
    stroke.points.length > policy.maximumPointsPerStroke ||
    stroke.points.length > policy.maximumPointsPerGroup ||
    stroke.points.some(
      ({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y),
    )
  ) {
    throw new TypeError("Invalid Smart Ink glyph stroke.");
  }
}

/**
 * Pure, bounded session reducer. It never discards accepted source strokes.
 * A caller must consume finalized groups and flush before tool changes.
 */
export function appendSmartInkGlyphSession(
  session: SmartInkGlyphSession,
  stroke: SmartInkGlyphSessionStroke,
  policy: SmartInkGlyphSessionPolicy = smartInkGlyphSessionPolicy,
): SmartInkGlyphSessionTransition {
  validateStroke(stroke, policy);
  const previous = session.pending;
  if (previous.some(({ id }) => id === stroke.id)) {
    throw new TypeError("Duplicate Smart Ink glyph stroke id.");
  }
  const last = previous.at(-1);
  if (last !== undefined && stroke.endedAtMs < last.endedAtMs) {
    throw new TypeError("Smart Ink glyph timestamps must be monotonic.");
  }
  const pointsInGroup = previous.reduce(
    (sum, item) => sum + item.points.length,
    0,
  );
  const continues =
    last !== undefined &&
    stroke.endedAtMs - last.endedAtMs <= policy.maximumGapMs &&
    previous.length < policy.maximumStrokesPerGroup &&
    pointsInGroup + stroke.points.length <= policy.maximumPointsPerGroup &&
    related(previous, stroke, policy);
  const stored: SmartInkGlyphSessionStroke = {
    endedAtMs: stroke.endedAtMs,
    id: stroke.id,
    points: stroke.points.map(({ x, y }) => ({ x, y })),
  };
  return {
    finalized: previous.length > 0 && !continues ? [previous] : [],
    session: {
      pending: continues ? [...previous, stored] : [stored],
    },
  };
}

export function flushSmartInkGlyphSession(
  session: SmartInkGlyphSession,
): SmartInkGlyphSessionTransition {
  return {
    finalized: session.pending.length > 0 ? [session.pending] : [],
    session: initialSmartInkGlyphSession,
  };
}

export function expireSmartInkGlyphSession(
  session: SmartInkGlyphSession,
  nowMs: number,
  policy: SmartInkGlyphSessionPolicy = smartInkGlyphSessionPolicy,
): SmartInkGlyphSessionTransition {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("Invalid Smart Ink glyph session clock.");
  }
  const last = session.pending.at(-1);
  return last !== undefined &&
    nowMs - last.endedAtMs >= policy.maximumGapMs
    ? flushSmartInkGlyphSession(session)
    : { finalized: [], session };
}
