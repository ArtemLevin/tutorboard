import { describe, expect, it } from "vitest";

import {
  WetInkRenderer,
  type WetInkFrame,
  type WetInkFrameClock,
  type WetInkFrameReport,
  type WetInkSurface,
} from "../../../../src/adapters/canvas-konva/wet-ink-renderer";

class FakeClock implements WetInkFrameClock {
  private nextId = 1;
  private nowMs = 0;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  cancel(frameId: number): void {
    this.callbacks.delete(frameId);
  }

  now(): number {
    return this.nowMs;
  }

  request(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  pending(): number {
    return this.callbacks.size;
  }

  step(nowMs: number): void {
    this.nowMs = nowMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(nowMs);
  }
}

class FakeSurface implements WetInkSurface {
  clears = 0;
  destroyed = false;
  readonly frames: WetInkFrame[] = [];

  clear(): void {
    this.clears += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }

  draw(frame: WetInkFrame): void {
    this.frames.push({
      ...frame,
      actualPoints: [...frame.actualPoints],
      predictedPoints: [...frame.predictedPoints],
    });
  }
}

const style = { opacity: 0.8, stroke: "#123456", strokeWidth: 4 } as const;
const viewport = { offset: { x: 10, y: 20 }, zoom: 2 } as const;

describe("WetInkRenderer", () => {
  it("coalesces many appends into one animation frame", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const reports: WetInkFrameReport[] = [];
    const renderer = new WetInkRenderer(surface, {
      clock,
      onFrame: (report) => reports.push(report),
    });

    renderer.begin(
      { inputTimestampMs: 1, point: { x: 0, y: 0 } },
      style,
      viewport,
    );
    renderer.append(
      [
        { inputTimestampMs: 2, point: { x: 1, y: 1 } },
        { inputTimestampMs: 3, point: { x: 2, y: 2 } },
      ],
      [{ inputTimestampMs: 4, point: { x: 3, y: 3 } }],
    );

    expect(clock.pending()).toBe(1);
    expect(surface.frames).toHaveLength(0);
    clock.step(9);

    expect(surface.frames).toHaveLength(1);
    expect(surface.frames[0]?.actualPoints).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(surface.frames[0]?.predictedPoints).toEqual([{ x: 3, y: 3 }]);
    expect(reports[0]?.latency.count).toBe(3);
    expect(reports[0]?.frameCount).toBe(1);
  });

  it("replaces predictions without committing them to actual ink", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const renderer = new WetInkRenderer(surface, { clock });

    renderer.begin(
      { inputTimestampMs: 0, point: { x: 0, y: 0 } },
      style,
      viewport,
    );
    renderer.append([], [
      { inputTimestampMs: 1, point: { x: 4, y: 4 } },
      { inputTimestampMs: 2, point: { x: 5, y: 5 } },
    ]);
    renderer.append([], [
      { inputTimestampMs: 3, point: { x: 6, y: 6 } },
    ]);
    clock.step(8);

    expect(surface.frames[0]?.actualPoints).toEqual([{ x: 0, y: 0 }]);
    expect(surface.frames[0]?.predictedPoints).toEqual([{ x: 6, y: 6 }]);
  });

  it("paints the final frame and clears on the following frame", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    let clearNotifications = 0;
    const renderer = new WetInkRenderer(surface, {
      clock,
      onClear: () => {
        clearNotifications += 1;
      },
    });

    renderer.begin(
      { inputTimestampMs: 0, point: { x: 0, y: 0 } },
      style,
      viewport,
    );
    renderer.finish([
      { inputTimestampMs: 4, point: { x: 10, y: 10 } },
    ]);
    clock.step(7);

    expect(surface.frames.at(-1)?.actualPoints.at(-1)).toEqual({ x: 10, y: 10 });
    expect(clock.pending()).toBe(1);
    clock.step(23);

    expect(clearNotifications).toBe(1);
    expect(surface.clears).toBeGreaterThanOrEqual(2);
  });

  it("cancels pending work and destroys the surface", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const renderer = new WetInkRenderer(surface, { clock });

    renderer.begin(
      { inputTimestampMs: 0, point: { x: 0, y: 0 } },
      style,
      viewport,
    );
    renderer.cancel();
    expect(clock.pending()).toBe(0);
    renderer.destroy();
    expect(surface.destroyed).toBe(true);
  });

  it("reports deterministic input-to-render latency statistics", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const renderer = new WetInkRenderer(surface, { clock });

    renderer.begin(
      { inputTimestampMs: 90, point: { x: 0, y: 0 } },
      style,
      viewport,
    );
    renderer.append(
      [
        { inputTimestampMs: 92, point: { x: 1, y: 1 } },
        { inputTimestampMs: 96, point: { x: 2, y: 2 } },
      ],
      [],
    );
    clock.step(100);

    expect(renderer.getLatencySnapshot()).toEqual({
      count: 3,
      lastMs: 4,
      maxMs: 10,
      meanMs: 22 / 3,
      p95Ms: 10,
    });
  });
});
