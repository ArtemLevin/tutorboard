import { describe, expect, it, vi } from "vitest";

import {
  startAnimatedImageRedraw,
  type AnimationFrameScheduler,
} from "../../../../src/adapters/canvas-konva/animated-image-redraw";

describe("embedded GIF redraw lifecycle", () => {
  it("cancels the pending frame and cannot reschedule after cleanup", () => {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const cancel = vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    });
    const scheduler: AnimationFrameScheduler = {
      cancel,
      request: (callback) => {
        const frameId = nextFrameId++;
        callbacks.set(frameId, callback);
        return frameId;
      },
    };
    const draw = vi.fn();

    const stop = startAnimatedImageRedraw(draw, scheduler);
    expect(callbacks.size).toBe(1);

    const first = callbacks.entries().next().value;
    if (first === undefined) throw new Error("Expected a scheduled frame.");
    const [firstId, firstCallback] = first;
    callbacks.delete(firstId);
    firstCallback(0);

    expect(draw).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(1);

    const pending = callbacks.entries().next().value;
    if (pending === undefined) throw new Error("Expected a rescheduled frame.");
    const [pendingId, pendingCallback] = pending;
    stop();

    expect(cancel).toHaveBeenCalledWith(pendingId);
    expect(callbacks.size).toBe(0);

    pendingCallback(16);
    expect(draw).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
  });
});
