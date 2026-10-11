import { describe, expect, it, vi } from "vitest";

import {
  AnimatedImageRedrawCoordinator,
  type AnimationFrameScheduler,
} from "../../../../src/adapters/canvas-konva/animated-image-redraw";

class Visibility extends EventTarget {
  hidden = false;

  change(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

function fixture() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scheduler: AnimationFrameScheduler = {
    cancel: (id) => {
      callbacks.delete(id);
    },
    request: (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
  };
  const visibility = new Visibility();
  const coordinator = new AnimatedImageRedrawCoordinator(scheduler, visibility);
  function tick(timestampMs = 16) {
    const entry = callbacks.entries().next().value;
    if (entry === undefined) throw new Error("Expected one animation frame");
    callbacks.delete(entry[0]);
    entry[1](timestampMs);
  }
  return { callbacks, coordinator, tick, visibility };
}

describe("board-scoped animated image redraw", () => {
  it("services eight GIFs with one callback and one redraw per unique Layer", () => {
    const { callbacks, coordinator, tick } = fixture();
    const layer = { batchDraw: vi.fn() };
    const stops = Array.from({ length: 8 }, () =>
      coordinator.register(() => layer),
    );
    expect(callbacks.size).toBe(1);
    for (let frame = 0; frame < 60; frame += 1) tick();
    expect(layer.batchDraw).toHaveBeenCalledTimes(60);
    expect(callbacks.size).toBe(1);
    stops.forEach((stop) => stop());
    expect(callbacks.size).toBe(0);
  });

  it("reduces GIF repaint cadence during active drawing and resumes immediately", () => {
    const { coordinator, tick } = fixture();
    const layer = { batchDraw: vi.fn() };
    const stop = coordinator.register(() => layer);

    coordinator.setInteractionActive(true);
    for (let frame = 0; frame < 60; frame += 1) {
      tick((frame + 1) * 16);
    }

    expect(layer.batchDraw.mock.calls.length).toBeGreaterThanOrEqual(15);
    expect(layer.batchDraw.mock.calls.length).toBeLessThanOrEqual(24);

    const throttledCount = layer.batchDraw.mock.calls.length;
    coordinator.setInteractionActive(false);
    tick(976);
    expect(layer.batchDraw).toHaveBeenCalledTimes(throttledCount + 1);

    stop();
  });

  it("stops all independent GIF redraw scheduling during wheel zoom and resumes immediately", () => {
    const { callbacks, coordinator, tick } = fixture();
    const first = { batchDraw: vi.fn() };
    const second = { batchDraw: vi.fn() };
    const stops = [
      coordinator.register(() => first),
      coordinator.register(() => first),
      coordinator.register(() => second),
    ];
    tick(16);
    expect(first.batchDraw).toHaveBeenCalledOnce();
    expect(second.batchDraw).toHaveBeenCalledOnce();

    const stale = callbacks.values().next().value;
    if (stale === undefined) throw new Error("Missing scheduled GIF frame");
    coordinator.setInteractionActive(true);
    coordinator.setWheelZoomActive(true);
    coordinator.setWheelZoomActive(true);
    expect(coordinator.wheelZoomActive).toBe(true);
    expect(callbacks.size).toBe(0);

    // Even an already dispatched, now-cancelled callback cannot redraw.
    stale(32);
    expect(first.batchDraw).toHaveBeenCalledOnce();
    expect(second.batchDraw).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);

    coordinator.setWheelZoomActive(false);
    expect(coordinator.wheelZoomActive).toBe(false);
    expect(callbacks.size).toBe(1);
    tick(48);
    expect(first.batchDraw).toHaveBeenCalledTimes(2);
    expect(second.batchDraw).toHaveBeenCalledTimes(2);
    coordinator.setInteractionActive(false);
    stops.forEach((stop) => stop());
    expect(callbacks.size).toBe(0);
  });

  it("cannot resume a disposed or hidden GIF loop after wheel zoom", () => {
    const { callbacks, coordinator, tick, visibility } = fixture();
    const layer = { batchDraw: vi.fn() };
    const stop = coordinator.register(() => layer);
    coordinator.setWheelZoomActive(true);
    visibility.change(true);
    coordinator.setWheelZoomActive(false);
    expect(callbacks.size).toBe(0);
    visibility.change(false);
    tick(16);
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    coordinator.setWheelZoomActive(true);
    coordinator.dispose();
    coordinator.setWheelZoomActive(false);
    expect(callbacks.size).toBe(0);
    stop();
  });

  it("keeps independent readers alive and follows their current Layer", () => {
    const { coordinator, tick, callbacks } = fixture();
    const first = { batchDraw: vi.fn() };
    const second = { batchDraw: vi.fn() };
    let layer: typeof first | null = first;
    const reader = () => layer;
    const stopFirst = coordinator.register(reader);
    const stopSecond = coordinator.register(reader);
    const stopThird = coordinator.register(() => second);
    tick();
    expect(first.batchDraw).toHaveBeenCalledOnce();
    expect(second.batchDraw).toHaveBeenCalledOnce();
    stopFirst();
    stopFirst();
    layer = second;
    tick();
    expect(first.batchDraw).toHaveBeenCalledOnce();
    expect(second.batchDraw).toHaveBeenCalledTimes(2);
    layer = null;
    stopThird();
    tick();
    expect(second.batchDraw).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(callbacks.size).toBe(0);
  });

  it("pauses hidden pages and rejects a cancelled callback after resume", () => {
    const { callbacks, coordinator, tick, visibility } = fixture();
    const layer = { batchDraw: vi.fn() };
    const stop = coordinator.register(() => layer);
    const stale = callbacks.values().next().value;
    if (stale === undefined) throw new Error("Expected a scheduled frame");
    visibility.change(true);
    expect(callbacks.size).toBe(0);
    stale(16);
    expect(layer.batchDraw).not.toHaveBeenCalled();
    visibility.change(false);
    expect(callbacks.size).toBe(1);
    stale(32);
    expect(callbacks.size).toBe(1);
    expect(layer.batchDraw).not.toHaveBeenCalled();
    tick();
    expect(layer.batchDraw).toHaveBeenCalledOnce();
    stop();
    visibility.change(false);
    expect(callbacks.size).toBe(0);
  });

  it("waits to schedule while initially hidden and cleans up every registration", () => {
    const { callbacks, coordinator, visibility } = fixture();
    visibility.change(true);
    const layer = { batchDraw: vi.fn() };
    coordinator.register(() => layer);
    expect(callbacks.size).toBe(0);
    coordinator.dispose();
    coordinator.dispose();
    visibility.change(false);
    expect(callbacks.size).toBe(0);
  });

  it("supports StrictMode remount without resurrecting disposed registrations", () => {
    const { callbacks, coordinator, tick } = fixture();
    const oldLayer = { batchDraw: vi.fn() };
    const newLayer = { batchDraw: vi.fn() };
    const oldStop = coordinator.register(() => oldLayer);
    const stale = callbacks.values().next().value;
    if (stale === undefined) throw new Error("Expected a scheduled frame");
    coordinator.dispose();
    const stop = coordinator.register(() => newLayer);
    oldStop();
    stale(16);
    expect(callbacks.size).toBe(1);
    tick();
    expect(oldLayer.batchDraw).not.toHaveBeenCalled();
    expect(newLayer.batchDraw).toHaveBeenCalledOnce();
    stop();
    expect(callbacks.size).toBe(0);
  });
});
