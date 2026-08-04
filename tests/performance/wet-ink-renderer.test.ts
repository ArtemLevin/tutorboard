import { describe, expect, it } from "vitest";

import {
  WetInkRenderer,
  type WetInkFrame,
  type WetInkFrameClock,
  type WetInkSurface,
} from "../../src/adapters/canvas-konva/wet-ink-renderer";

class ImmediateClock implements WetInkFrameClock {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  cancel(frameId: number): void {
    this.callbacks.delete(frameId);
  }

  now(): number {
    return performance.now();
  }

  request(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  flush(nowMs: number): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(nowMs);
  }
}

class CountingSurface implements WetInkSurface {
  frames = 0;
  points = 0;

  clear(): void {}
  destroy(): void {}

  draw(frame: WetInkFrame): void {
    this.frames += 1;
    this.points += frame.actualPoints.length + frame.predictedPoints.length;
  }
}

describe("wet ink performance budget", () => {
  it("processes 20,000 samples in frame-sized batches within 150 ms", () => {
    const clock = new ImmediateClock();
    const surface = new CountingSurface();
    const renderer = new WetInkRenderer(surface, { clock });
    const startedAt = performance.now();
    renderer.begin(
      { inputTimestampMs: 0, point: { x: 0, y: 0 } },
      { opacity: 1, stroke: "#000000", strokeWidth: 3 },
      { offset: { x: 0, y: 0 }, zoom: 1 },
    );

    for (let frame = 0; frame < 200; frame += 1) {
      const samples = Array.from({ length: 100 }, (_value, index) => ({
        inputTimestampMs: frame * 16 + index / 100,
        point: { x: frame * 100 + index, y: Math.sin(index / 8) * 20 },
      }));
      renderer.append(samples, samples.slice(-8));
      clock.flush(frame * 16 + 16);
    }

    const elapsedMs = performance.now() - startedAt;
    expect(surface.frames).toBe(200);
    expect(surface.points).toBeGreaterThan(20_000);
    expect(elapsedMs).toBeLessThan(150);
  });
});
