import { describe, expect, it } from "vitest";
import {
  c39CoveredMilliseconds,
  estimateC39TileMemoryFloor,
  summarizeC39SceneHitCausal,
} from "../../../e2e/c39-scene-hit-causal";

describe("C3.9-S4 scene/hit causal accounting", () => {
  it("clips overlapping draw intervals once per frame, keeping hit separate", () => {
    const frame = { startMs: 0, endMs: 120, durationMs: 120 };
    const events = [
      { kind: "konva-scene", startMs: 20, durationMs: 50 },
      { kind: "konva-scene", startMs: 40, durationMs: 20 },
      { kind: "konva-hit", startMs: 55, durationMs: 20 },
      { kind: "wheel-viewport-persist", startMs: 70, durationMs: 20 },
    ];
    expect(c39CoveredMilliseconds(frame, events.slice(0, 2))).toBe(50);
    const result = summarizeC39SceneHitCausal(
      [frame, { startMs: 120, endMs: 140, durationMs: 20 }],
      [10, 119],
      events,
    );
    expect(result.activeFrameCount).toBe(1);
    expect(result.activeOver100).toBe(1);
    expect(result.slowWithSceneHit).toBe(1);
    expect(result.slowWithPersist).toBe(1);
    expect(result.activeSceneMs).toBe(50);
    expect(result.activeHitMs).toBe(20);
    expect(result.activeSceneHitUnionMs).toBe(55);
    expect(result.activePersistMs).toBe(20);
    expect(result.worstFrames[0]?.sceneCalls).toBe(2);
  });

  it("does not attribute gaps outside the input window or zero-duration markers", () => {
    const result = summarizeC39SceneHitCausal(
      [
        { startMs: 0, endMs: 50, durationMs: 50 },
        { startMs: 50, endMs: 90, durationMs: 40 },
        { startMs: 90, endMs: 140, durationMs: 50 },
      ],
      [51, 89],
      [
        { kind: "konva-hit", startMs: 0, durationMs: 50 },
        { kind: "konva-scene", startMs: 65, durationMs: 0 },
      ],
    );
    expect(result.activeFrameCount).toBe(1);
    expect(result.activeSceneHitUnionMs).toBe(0);
    expect(result.framesWithHit).toBe(0);
    expect(() => summarizeC39SceneHitCausal([], [1], [])).toThrow(/wheel/);
  });

  it("estimates full-viewport tile memory without allocating image resources", () => {
    const base = {
      width: 1240,
      height: 820,
      tileEdgeCssPx: 256,
      sharedScenePixelBudget: 4_000_000,
    };
    const dpr2 = estimateC39TileMemoryFloor({
      ...base,
      devicePixelRatio: 2,
    });
    expect(dpr2.tileCount).toBe(20);
    expect(dpr2.scenePixels).toBe(4_067_200);
    expect(dpr2.hitPixels).toBe(1_016_800);
    expect(dpr2.requiresPartialOrFallback).toBe(true);
    expect(dpr2.minimumBytesWithScratch).toBeGreaterThan(20_000_000);
    const dpr1 = estimateC39TileMemoryFloor({
      ...base,
      devicePixelRatio: 1,
    });
    expect(dpr1.canRetainFullViewport).toBe(true);
    expect(dpr1.scenePixels).toBe(1_016_800);
    expect(() =>
      estimateC39TileMemoryFloor({ ...base, devicePixelRatio: 0 }),
    ).toThrow(/positive/);
  });
});
