import { describe, expect, it, vi } from "vitest";

import { SharedInkRasterBudget } from "../../../../src/adapters/canvas-konva/shared-ink-raster-budget";
import { WheelInkCacheCoordinator } from "../../../../src/adapters/canvas-konva/wheel-ink-cache";

function mountedGroup() {
  const cache = vi.fn();
  const clearCache = vi.fn();
  const batchDraw = vi.fn();
  const node = {
    cache,
    clearCache,
    getClientRect: () => ({ x: 12, y: 24, width: 90, height: 50 }),
    getLayer: () => ({ batchDraw }),
  };
  return { node, cache, clearCache, batchDraw };
}

describe("S5.3 mounted Konva crop guard", () => {
  it("refuses an under-estimated crop without touching scene or hit caches", () => {
    const budget = new SharedInkRasterBudget();
    const wheel = new WheelInkCacheCoordinator(budget);
    const { node, cache, clearCache } = mountedGroup();
    wheel.register(node, { x: 10, y: 22, width: 80, height: 56 });
    expect(wheel.prepare(2)).toBe(false);
    expect(wheel.lastBuildSkippedRuns).toBe(1);
    expect(cache).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(budget.activeLeases).toBe(0);
    wheel.begin(2, { buildIfUnprepared: false });
    expect(cache).not.toHaveBeenCalled();
    wheel.end();
  });

  it("keeps the original node, crops only within live bounds and releases on expiry", () => {
    const budget = new SharedInkRasterBudget();
    const wheel = new WheelInkCacheCoordinator(budget);
    const { node, cache, clearCache, batchDraw } = mountedGroup();
    const unregister = wheel.register(node, {
      x: 9,
      y: 21,
      width: 96,
      height: 56,
    });
    expect(wheel.prepare(2)).toBe(true);
    expect(cache).toHaveBeenCalledWith({
      x: 9, y: 21, width: 96, height: 56, pixelRatio: 2,
      hitCanvasPixelRatio: 1,
    });
    expect(budget.activeLeases).toBe(1);
    expect(wheel.cachedCount).toBe(1);
    wheel.begin(2, { buildIfUnprepared: false });
    expect(wheel.lastWheelUsedPrepared).toBe(true);
    wheel.end();
    expect(clearCache).toHaveBeenCalledOnce();
    expect(batchDraw).toHaveBeenCalledOnce();
    expect(budget.activeLeases).toBe(0);
    unregister();
    wheel.dispose();
  });

  it("releases the lease on registration/unmount and stops drawing stale generations", () => {
    const budget = new SharedInkRasterBudget();
    const wheel = new WheelInkCacheCoordinator(budget);
    const { node, cache, clearCache } = mountedGroup();
    const unregister = wheel.register(node, {
      x: 0, y: 0, width: 120, height: 100,
    });
    expect(wheel.prepare(1)).toBe(true);
    unregister();
    expect(clearCache).toHaveBeenCalledOnce();
    expect(budget.accountedBytes).toBe(0);
    wheel.begin(1, { buildIfUnprepared: false });
    expect(cache).toHaveBeenCalledOnce();
    wheel.end();
    expect(wheel.cachedCount).toBe(0);
  });

  it("abandons the prepared cache on DPR changes without rebuilding on the wheel thread", () => {
    const budget = new SharedInkRasterBudget();
    const wheel = new WheelInkCacheCoordinator(budget);
    const { node, cache, clearCache } = mountedGroup();
    wheel.register(node, { x: 9, y: 21, width: 96, height: 56 });
    expect(wheel.prepare(1)).toBe(true);
    wheel.begin(2, { buildIfUnprepared: false });
    expect(cache).toHaveBeenCalledTimes(1);
    expect(clearCache).toHaveBeenCalledOnce();
    expect(budget.activeLeases).toBe(0);
    expect(wheel.lastWheelSkippedColdBuild).toBe(true);
    wheel.end();
  });
});
