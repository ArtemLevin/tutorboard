import type { C39FrameGap, C39JsEvent } from "./c39-frame-attribution.js";

type CostKind = "konva-scene" | "konva-hit" | "wheel-viewport-persist";
const costKinds: readonly CostKind[] = [
  "konva-scene",
  "konva-hit",
  "wheel-viewport-persist",
];

/** Wall-clock union within one rAF gap; never sum nested intervals twice. */
export function c39CoveredMilliseconds(
  frame: C39FrameGap,
  events: readonly C39JsEvent[],
): number {
  const intervals = events
    .filter(
      (event) =>
        Number.isFinite(event.startMs) &&
        Number.isFinite(event.durationMs) &&
        event.durationMs > 0,
    )
    .map((event) => ({
      start: Math.max(frame.startMs, event.startMs),
      end: Math.min(frame.endMs, event.startMs + event.durationMs),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  let covered = 0;
  let start = 0;
  let end = 0;
  for (const interval of intervals) {
    if (interval.start > end) {
      covered += end - start;
      start = interval.start;
      end = interval.end;
    } else {
      end = Math.max(end, interval.end);
    }
  }
  return covered + end - start;
}

/**
 * Diagnostic-only correlation. JS Konva draw durations are synchronous
 * calls, not GPU/compositor time. Frame gaps may contain unrelated work.
 */
export function summarizeC39SceneHitCausal(
  frames: readonly C39FrameGap[],
  wheelTimes: readonly number[],
  events: readonly C39JsEvent[],
) {
  if (wheelTimes.length < 2) {
    throw new Error("Missing wheel input window for scene/hit attribution");
  }
  const firstInput = wheelTimes[0]!;
  const lastInput = wheelTimes[wheelTimes.length - 1]!;
  const active = frames.filter(
    (frame) => frame.endMs >= firstInput && frame.endMs <= lastInput,
  );
  if (active.length === 0) {
    throw new Error("No active frames for scene/hit attribution");
  }
  const relevant = events.filter((event) =>
    costKinds.some((kind) => kind === event.kind),
  );
  const rows = active.map((frame) => {
    const scene = relevant.filter((event) => event.kind === "konva-scene");
    const hit = relevant.filter((event) => event.kind === "konva-hit");
    const persist = relevant.filter(
      (event) => event.kind === "wheel-viewport-persist",
    );
    const overlaps = (event: C39JsEvent) =>
      event.durationMs > 0 &&
      event.startMs < frame.endMs &&
      event.startMs + event.durationMs > frame.startMs;
    const sceneEvents = scene.filter(overlaps);
    const hitEvents = hit.filter(overlaps);
    const persistEvents = persist.filter(overlaps);
    return {
      gapMs: frame.durationMs,
      sceneMs: c39CoveredMilliseconds(frame, sceneEvents),
      hitMs: c39CoveredMilliseconds(frame, hitEvents),
      sceneHitUnionMs: c39CoveredMilliseconds(frame, [
        ...sceneEvents,
        ...hitEvents,
      ]),
      persistMs: c39CoveredMilliseconds(frame, persistEvents),
      sceneCalls: sceneEvents.length,
      hitCalls: hitEvents.length,
      persistCalls: persistEvents.length,
    };
  });
  const sum = (selector: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + selector(row), 0);
  const slow = rows.filter((row) => row.gapMs > 100);
  const countKind = (kind: CostKind) =>
    relevant.filter((event) => event.kind === kind).length;
  return {
    schemaVersion: 1,
    activeFrameCount: rows.length,
    activeOver100: slow.length,
    framesWithScene: rows.filter((row) => row.sceneCalls > 0).length,
    framesWithHit: rows.filter((row) => row.hitCalls > 0).length,
    framesWithPersist: rows.filter((row) => row.persistCalls > 0).length,
    slowWithSceneHit: slow.filter(
      (row) => row.sceneCalls > 0 || row.hitCalls > 0,
    ).length,
    slowWithPersist: slow.filter((row) => row.persistCalls > 0).length,
    sceneCalls: countKind("konva-scene"),
    hitCalls: countKind("konva-hit"),
    viewportPersistCalls: countKind("wheel-viewport-persist"),
    activeSceneMs: sum((row) => row.sceneMs),
    activeHitMs: sum((row) => row.hitMs),
    activeSceneHitUnionMs: sum((row) => row.sceneHitUnionMs),
    activePersistMs: sum((row) => row.persistMs),
    activeGapMs: sum((row) => row.gapMs),
    worstFrames: [...rows]
      .sort((left, right) => right.gapMs - left.gapMs)
      .slice(0, 8),
    caution:
      "Correlated JS intervals, not exclusive attribution or GPU cost; " +
      "trace truncation and timer-driven wheel commits can affect the sample.",
  };
}

export interface C39TileMemoryInput {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly tileEdgeCssPx: number;
  readonly sharedScenePixelBudget: number;
}

/**
 * Lower bound for a fully resident viewport cache of scene + hit + one
 * scratch tile. It omits antialias padding, overscan and GPU copies.
 * This is a feasibility calculation, not a tile renderer.
 */
export function estimateC39TileMemoryFloor(input: C39TileMemoryInput) {
  const {
    width,
    height,
    devicePixelRatio,
    tileEdgeCssPx,
    sharedScenePixelBudget,
  } = input;
  if (
    ![
      width,
      height,
      devicePixelRatio,
      tileEdgeCssPx,
      sharedScenePixelBudget,
    ].every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new RangeError("Tile dimensions, DPR and budget must be positive");
  }
  let tileCount = 0;
  let scenePixels = 0;
  let hitPixels = 0;
  let maximumScratchPixels = 0;
  for (let y = 0; y < height; y += tileEdgeCssPx) {
    for (let x = 0; x < width; x += tileEdgeCssPx) {
      const w = Math.min(tileEdgeCssPx, width - x);
      const h = Math.min(tileEdgeCssPx, height - y);
      const scene =
        Math.ceil(w * devicePixelRatio) * Math.ceil(h * devicePixelRatio);
      const hit = Math.ceil(w) * Math.ceil(h);
      scenePixels += scene;
      hitPixels += hit;
      maximumScratchPixels = Math.max(maximumScratchPixels, scene + hit);
      tileCount += 1;
    }
  }
  const minimumBytesWithScratch =
    4 * (scenePixels + hitPixels + maximumScratchPixels);
  return {
    tileCount,
    scenePixels,
    hitPixels,
    minimumBytesWithScratch,
    sharedScenePixelBudget,
    canRetainFullViewport: scenePixels <= sharedScenePixelBudget,
    requiresPartialOrFallback: scenePixels > sharedScenePixelBudget,
    caution:
      "Lower bound excludes padding, GPU copies, existing wheel cache and " +
      "z-order barriers. No tiles are allocated by this estimator.",
  };
}
