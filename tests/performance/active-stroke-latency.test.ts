import Konva from "konva";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createKonvaWetInkSurface,
  wetInkMutableTailSize,
  wetInkSealedChunkSize,
  WetInkRenderer,
  type WetInkFrameClock,
  type WetInkFrameReport,
} from "../../src/adapters/canvas-konva/wet-ink-renderer";

class FrameClock implements WetInkFrameClock {
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

  flush(nowMs: number): void {
    this.nowMs = nowMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(nowMs);
  }
}

let canvasGetContextDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  canvasGetContextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "getContext",
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value() {
      return {
        clearRect() {},
        fillRect() {},
        getImageData() {
          return { data: new Uint8ClampedArray([0, 0, 0, 0]) };
        },
        scale() {},
      };
    },
  });
});

afterAll(() => {
  if (canvasGetContextDescriptor === undefined) {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "getContext");
    return;
  }
  Object.defineProperty(
    HTMLCanvasElement.prototype,
    "getContext",
    canvasGetContextDescriptor,
  );
});

function runStylusScenario(samplesPerFrame: number) {
  const layer = new Konva.Layer();
  Object.defineProperty(layer, "draw", {
    configurable: true,
    value: () => layer,
  });
  Object.defineProperty(layer, "batchDraw", {
    configurable: true,
    value: () => layer,
  });

  const reports: WetInkFrameReport[] = [];
  const clock = new FrameClock();
  const renderer = new WetInkRenderer(createKonvaWetInkSurface(layer), {
    clock,
    onFrame: (report) => reports.push(report),
  });
  const frameDurationMs = 1000 / 60;
  let sampleIndex = 0;

  renderer.begin(
    { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
    {
      opacity: 0.9,
      stroke: "#17202a",
      strokeStyle: "wavy",
      strokeWidth: 3,
    },
    { offset: { x: 0, y: 0 }, zoom: 1 },
  );

  const startedAt = performance.now();
  for (let frame = 0; frame < 600; frame += 1) {
    const frameStart = frame * frameDurationMs;
    const samples = Array.from({ length: samplesPerFrame }, (_value, index) => {
      sampleIndex += 1;
      const inputTimestampMs =
        frameStart + ((index + 1) * frameDurationMs) / (samplesPerFrame + 1);
      return {
        inputTimestampMs,
        point: {
          x: sampleIndex * 0.8,
          y: Math.sin(sampleIndex / 18) * 24,
        },
        pressure: 0.35 + (sampleIndex % 24) / 48,
      };
    });
    renderer.append(samples, samples.slice(-2));
    clock.flush(frameStart + frameDurationMs);
  }
  const elapsedMs = performance.now() - startedAt;

  return { elapsedMs, reports };
}

describe("active stroke production-like performance", () => {
  for (const [label, samplesPerFrame] of [
    ["120 Hz", 2],
    ["240 Hz", 4],
  ] as const) {
    it(`${label} keeps input latency and generated geometry bounded`, () => {
      const { elapsedMs, reports } = runStylusScenario(samplesPerFrame);
      const final = reports.at(-1);
      expect(final).toBeDefined();
      expect(final?.sealedChunkCount).toBeGreaterThan(0);
      expect(
        Math.max(
          ...reports.map(
            ({ mutableTailPointCount }) => mutableTailPointCount,
          ),
        ),
      ).toBeLessThanOrEqual(wetInkSealedChunkSize + wetInkMutableTailSize);
      expect(
        Math.max(
          ...reports.map(
            ({ generatedActualSampleCount }) => generatedActualSampleCount,
          ),
        ),
      ).toBeLessThanOrEqual(
        wetInkSealedChunkSize * 2 + wetInkMutableTailSize + samplesPerFrame,
      );
      expect(final?.latency.p95Ms ?? Number.POSITIVE_INFINITY).toBeLessThan(20);
      expect(elapsedMs).toBeLessThan(1_500);
    });
  }

  it(
    "drains a 64-sample coalesced burst in one frame without full-history regeneration",
    () => {
      const layer = new Konva.Layer();
      Object.defineProperty(layer, "draw", {
        configurable: true,
        value: () => layer,
      });
      Object.defineProperty(layer, "batchDraw", {
        configurable: true,
        value: () => layer,
      });
      const clock = new FrameClock();
      const reports: WetInkFrameReport[] = [];
      const renderer = new WetInkRenderer(createKonvaWetInkSurface(layer), {
        clock,
        onFrame: (report) => reports.push(report),
      });
      renderer.begin(
        { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
        { opacity: 1, stroke: "#000000", strokeWidth: 3 },
        { offset: { x: 0, y: 0 }, zoom: 1 },
      );

      for (let frame = 0; frame < 80; frame += 1) {
        const samples = Array.from({ length: 4 }, (_value, index) => {
          const sampleIndex = frame * 4 + index + 1;
          return {
            inputTimestampMs: frame * 16 + index * 4,
            point: { x: sampleIndex, y: Math.cos(sampleIndex / 10) * 10 },
            pressure: 0.5,
          };
        });
        renderer.append(samples, []);
        clock.flush(frame * 16 + 16);
      }

      const historyPointCount = reports.at(-1)?.actualPointCount ?? 0;
      const burst = Array.from({ length: 64 }, (_value, index) => ({
        inputTimestampMs: 1_300 + index * 0.2,
        point: {
          x: historyPointCount + index + 1,
          y: Math.cos((historyPointCount + index + 1) / 10) * 10,
        },
        pressure: 0.5,
      }));
      renderer.append(burst, []);
      clock.flush(1_316);

      const final = reports.at(-1);
      expect(final?.actualBatchPointCount).toBe(64);
      expect(final?.pendingInputCount).toBe(64);
      expect(final?.mutableTailPointCount).toBeLessThanOrEqual(
        wetInkSealedChunkSize + wetInkMutableTailSize,
      );
      expect(final?.generatedActualSampleCount).toBeLessThan(
        historyPointCount,
      );
    },
  );
});
