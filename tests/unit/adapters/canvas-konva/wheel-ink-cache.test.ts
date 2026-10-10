import { describe, expect, it, vi } from "vitest";

import {
  maximumWheelCachePixels,
  WheelInkCacheCoordinator,
  type WheelInkNode,
} from "../../../../src/adapters/canvas-konva/wheel-ink-cache";

function fixture(width = 600, height = 400) {
  const layer = { batchDraw: vi.fn() };
  const cacheSpy = vi.fn();
  const clearSpy = vi.fn();
  const node: WheelInkNode = {
    cache: cacheSpy,
    clearCache: clearSpy,
    getClientRect: () => ({ x: 10, y: 20, width, height }),
    getLayer: () => layer,
  };
  return { cacheSpy, clearSpy, layer, node };
}

describe("transient wheel ink cache", () => {
  it("rasterizes once per gesture, releases on commit and supports a new gesture", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, layer, cacheSpy, clearSpy } = fixture();
    const unregister = coordinator.register(node);
    coordinator.begin(1.5);
    coordinator.begin(1.5);
    expect(cacheSpy).toHaveBeenCalledTimes(1);
    expect(coordinator.lastBuildDurationMs).toBeGreaterThanOrEqual(0);
    expect(coordinator.lastBuildPixels).toBeGreaterThan(0);
    expect(coordinator.lastBuildSkippedRuns).toBe(0);
    expect(cacheSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 7,
        y: 17,
        pixelRatio: 1.5,
        hitCanvasPixelRatio: 1,
      }),
    );
    coordinator.end();
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.begin();
    expect(cacheSpy).toHaveBeenCalledTimes(2);
    unregister();
    expect(clearSpy).toHaveBeenCalledTimes(2);
    coordinator.dispose();
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it("skips oversized caches without allocating large canvases", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, cacheSpy, clearSpy } = fixture(maximumWheelCachePixels, 2);
    coordinator.register(node);
    coordinator.begin();
    expect(cacheSpy).not.toHaveBeenCalled();
    expect(coordinator.lastBuildPixels).toBe(0);
    expect(coordinator.lastBuildSkippedRuns).toBe(1);
    coordinator.end();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("shares a fixed pixel budget across registered stroke runs", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture(1500, 1000);
    const second = fixture(1500, 1000);
    const third = fixture(1500, 1000);
    coordinator.register(first.node);
    coordinator.register(second.node);
    coordinator.register(third.node);
    coordinator.begin(1);
    expect(first.cacheSpy).toHaveBeenCalledOnce();
    expect(second.cacheSpy).toHaveBeenCalledOnce();
    expect(third.cacheSpy).not.toHaveBeenCalled();
    expect(coordinator.lastBuildSkippedRuns).toBe(1);
    expect(coordinator.lastBuildPixels).toBeLessThanOrEqual(
      maximumWheelCachePixels,
    );
    coordinator.end();
    expect(first.clearSpy).toHaveBeenCalledOnce();
    expect(second.clearSpy).toHaveBeenCalledOnce();
  });

  it("invalidates and restores hit/scene drawing when document state changes", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, layer, clearSpy } = fixture();
    coordinator.register(node);
    coordinator.begin();
    coordinator.invalidate();
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.end();
    expect(clearSpy).toHaveBeenCalledOnce();
  });

  it("never rasterizes pen runs synchronously on an unprepared wheel gesture", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture(900, 600);
    const second = fixture(400, 300);
    coordinator.register(first.node);
    coordinator.register(second.node);

    coordinator.begin(2, { buildIfUnprepared: false });
    expect(coordinator.lastWheelUsedPrepared).toBe(false);
    expect(coordinator.lastWheelSkippedColdBuild).toBe(true);
    expect(coordinator.cachedCount).toBe(0);
    expect(first.cacheSpy).not.toHaveBeenCalled();
    expect(second.cacheSpy).not.toHaveBeenCalled();
    coordinator.begin(2, { buildIfUnprepared: false });
    expect(first.cacheSpy).not.toHaveBeenCalled();
    coordinator.end();
    expect(first.clearSpy).not.toHaveBeenCalled();
    expect(second.clearSpy).not.toHaveBeenCalled();

    expect(coordinator.prepare(2)).toBe(true);
    const buildCount = coordinator.buildCount;
    coordinator.begin(2, { buildIfUnprepared: false });
    expect(coordinator.lastWheelUsedPrepared).toBe(true);
    expect(coordinator.lastWheelSkippedColdBuild).toBe(false);
    expect(coordinator.buildCount).toBe(buildCount);
    coordinator.end();
    expect(first.clearSpy).toHaveBeenCalledOnce();
    expect(second.clearSpy).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it("discards stale-DPR prepared caches without rebuilding in the wheel handler", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, cacheSpy, clearSpy } = fixture();
    coordinator.register(node);
    expect(coordinator.prepare(1)).toBe(true);
    coordinator.begin(2, { buildIfUnprepared: false });
    expect(coordinator.lastWheelUsedPrepared).toBe(false);
    expect(coordinator.lastWheelSkippedColdBuild).toBe(true);
    expect(cacheSpy).toHaveBeenCalledOnce();
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(coordinator.cachedCount).toBe(0);
    coordinator.end();
  });

  it("reuses idle-prepared scene and hit canvases", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture(800, 400);
    coordinator.register(first.node);
    expect(coordinator.canPrepare).toBe(true);
    expect(coordinator.prepare(1.5)).toBe(true);
    expect(coordinator.isPrepared).toBe(true);
    expect(coordinator.cachedCount).toBe(1);
    expect(coordinator.activeCachedCount).toBe(0);
    expect(coordinator.canPrepare).toBe(false);
    const count = coordinator.buildCount;
    coordinator.begin(1.5);
    expect(coordinator.activeCachedCount).toBe(1);
    expect(coordinator.lastWheelUsedPrepared).toBe(true);
    expect(coordinator.lastWheelBeginDurationMs).toBeGreaterThanOrEqual(0);
    expect(coordinator.buildCount).toBe(count);
    expect(first.cacheSpy).toHaveBeenCalledOnce();
    expect(coordinator.isPrepared).toBe(false);
    coordinator.end();
    expect(first.clearSpy).toHaveBeenCalledOnce();
    expect(coordinator.activeCachedCount).toBe(0);
    expect(coordinator.canPrepare).toBe(true);
  });

  it("rejects prewarm from stale device pixel ratio and rebuilds safely", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture();
    coordinator.register(first.node);
    expect(coordinator.prepare(1)).toBe(true);
    coordinator.begin(2);
    expect(coordinator.lastWheelUsedPrepared).toBe(false);
    expect(first.clearSpy).toHaveBeenCalledOnce();
    expect(first.cacheSpy).toHaveBeenCalledTimes(2);
    expect(coordinator.lastBuildPixels).toBeLessThanOrEqual(
      maximumWheelCachePixels,
    );
    coordinator.dispose();
    expect(first.clearSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidates prewarmed runs when registrations change", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture();
    coordinator.register(first.node);
    coordinator.prepare(1);
    coordinator.invalidate();
    expect(coordinator.isPrepared).toBe(false);
    expect(first.clearSpy).toHaveBeenCalledOnce();
    coordinator.prepare(1);
    const second = fixture();
    coordinator.register(second.node);
    expect(coordinator.isPrepared).toBe(false);
    expect(first.clearSpy).toHaveBeenCalledTimes(2);
    coordinator.begin(1);
    expect(coordinator.lastWheelUsedPrepared).toBe(false);
    expect(first.cacheSpy).toHaveBeenCalledTimes(3);
    expect(second.cacheSpy).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it("keeps high-DPI prewarming under the existing fixed pixel budget", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const first = fixture(1500, 1000);
    const second = fixture(1500, 1000);
    coordinator.register(first.node);
    coordinator.register(second.node);
    expect(coordinator.prepare(3)).toBe(false);
    expect(first.cacheSpy).not.toHaveBeenCalled();
    expect(coordinator.lastBuildPixels).toBe(0);
    expect(coordinator.lastBuildSkippedRuns).toBe(2);
    coordinator.begin(3);
    expect(coordinator.lastWheelUsedPrepared).toBe(false);
    expect(first.cacheSpy).not.toHaveBeenCalled();
    coordinator.end();
    expect(coordinator.cachedCount).toBe(0);
  });

  it("cleans up registrations and caches on StrictMode unmount", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const previous = fixture();
    const unregister = coordinator.register(previous.node);
    coordinator.begin();
    unregister();
    const next = fixture();
    coordinator.register(next.node);
    coordinator.end();
    expect(previous.clearSpy).toHaveBeenCalledOnce();
    expect(next.clearSpy).not.toHaveBeenCalled();
    coordinator.begin();
    expect(next.cacheSpy).toHaveBeenCalledOnce();
    coordinator.dispose();
    expect(next.clearSpy).toHaveBeenCalledOnce();
  });
});
