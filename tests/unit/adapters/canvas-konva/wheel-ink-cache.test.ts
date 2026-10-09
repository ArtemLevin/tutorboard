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
    coordinator.end();
    expect(first.clearSpy).toHaveBeenCalledOnce();
    expect(second.clearSpy).toHaveBeenCalledOnce();
  });

  it("invalidates and restores hit/scene drawing when document state changes", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, layer } = fixture();
    coordinator.register(node);
    coordinator.begin();
    coordinator.invalidate();
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.end();
    expect(clearSpy).toHaveBeenCalledOnce();
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
