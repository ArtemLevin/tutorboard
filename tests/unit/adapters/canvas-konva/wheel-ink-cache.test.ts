import { describe, expect, it, vi } from "vitest";

import {
  maximumWheelCachePixels,
  WheelInkCacheCoordinator,
  type WheelInkNode,
} from "../../../../src/adapters/canvas-konva/wheel-ink-cache";

function fixture(width = 600, height = 400) {
  const layer = { batchDraw: vi.fn() };
  const node: WheelInkNode = {
    cache: vi.fn(),
    clearCache: vi.fn(),
    getClientRect: vi.fn(() => ({ x: 10, y: 20, width, height })),
    getLayer: () => layer,
  };
  return { layer, node };
}

describe("transient wheel ink cache", () => {
  it("rasterizes once per gesture, releases on commit and supports a new gesture", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, layer } = fixture();
    const unregister = coordinator.register(node);
    coordinator.begin(1.5);
    coordinator.begin(1.5);
    expect(node.cache).toHaveBeenCalledTimes(1);
    expect(node.cache).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 7,
        y: 17,
        pixelRatio: 1.5,
        hitCanvasPixelRatio: 1,
      }),
    );
    coordinator.end();
    expect(node.clearCache).toHaveBeenCalledOnce();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.begin();
    expect(node.cache).toHaveBeenCalledTimes(2);
    unregister();
    expect(node.clearCache).toHaveBeenCalledTimes(2);
    coordinator.dispose();
    expect(node.clearCache).toHaveBeenCalledTimes(2);
  });

  it("skips oversized caches without allocating large canvases", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node } = fixture(maximumWheelCachePixels, 2);
    coordinator.register(node);
    coordinator.begin();
    expect(node.cache).not.toHaveBeenCalled();
    coordinator.end();
    expect(node.clearCache).not.toHaveBeenCalled();
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
    expect(first.node.cache).toHaveBeenCalledOnce();
    expect(second.node.cache).toHaveBeenCalledOnce();
    expect(third.node.cache).not.toHaveBeenCalled();
    coordinator.end();
    expect(first.node.clearCache).toHaveBeenCalledOnce();
    expect(second.node.clearCache).toHaveBeenCalledOnce();
  });

  it("invalidates and restores hit/scene drawing when document state changes", () => {
    const coordinator = new WheelInkCacheCoordinator();
    const { node, layer } = fixture();
    coordinator.register(node);
    coordinator.begin();
    coordinator.invalidate();
    expect(node.clearCache).toHaveBeenCalledOnce();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.end();
    expect(node.clearCache).toHaveBeenCalledOnce();
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
    expect(previous.node.clearCache).toHaveBeenCalledOnce();
    expect(next.node.clearCache).not.toHaveBeenCalled();
    coordinator.begin();
    expect(next.node.cache).toHaveBeenCalledOnce();
    coordinator.dispose();
    expect(next.node.clearCache).toHaveBeenCalledOnce();
  });
});
