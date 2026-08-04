import Konva from "konva";

import {
  createVectorInkData,
  vectorInkOutlinePathData,
  type Vec2,
  type VectorInkSample,
  type ViewportState,
} from "../../core/public";

export const maximumWetInkActualPoints = 100_000;
export const maximumWetInkPredictedPoints = 64;
export const wetInkLatencyWindowSize = 240;

export interface WetInkStyle {
  readonly opacity: number;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface WetInkSample {
  readonly inputTimestampMs: number;
  readonly point: Vec2;
  readonly pressure: number;
}

export interface WetInkLatencySnapshot {
  readonly count: number;
  readonly lastMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly p95Ms: number;
}

export interface WetInkFrame {
  readonly actualPoints: readonly Vec2[];
  readonly actualSamples: readonly WetInkSample[];
  readonly predictedPoints: readonly Vec2[];
  readonly predictedSamples: readonly WetInkSample[];
  readonly style: WetInkStyle;
  readonly viewport: ViewportState;
}

export interface WetInkFrameReport {
  readonly actualPointCount: number;
  readonly frameCount: number;
  readonly latency: WetInkLatencySnapshot;
  readonly predictedPointCount: number;
  readonly renderedAtMs: number;
}

export interface WetInkSurface {
  clear(): void;
  destroy(): void;
  draw(frame: WetInkFrame): void;
}

export interface WetInkFrameClock {
  cancel(frameId: number): void;
  now(): number;
  request(callback: FrameRequestCallback): number;
}

export interface WetInkRendererOptions {
  readonly clock?: WetInkFrameClock;
  readonly onClear?: () => void;
  readonly onFrame?: (report: WetInkFrameReport) => void;
}

export const browserWetInkFrameClock: WetInkFrameClock = {
  cancel: (frameId) => cancelAnimationFrame(frameId),
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
};

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function normalizeLatencyTimestamp(
  inputTimestampMs: number,
  renderedAtMs: number,
): number {
  if (!Number.isFinite(inputTimestampMs)) return renderedAtMs;
  if (Math.abs(renderedAtMs - inputTimestampMs) > 60_000) return renderedAtMs;
  return Math.min(renderedAtMs, inputTimestampMs);
}

export class WetInkLatencyTracker {
  private count = 0;
  private lastMs = 0;
  private maxMs = 0;
  private sumMs = 0;
  private readonly window: number[] = [];

  record(
    inputTimestampsMs: readonly number[],
    renderedAtMs: number,
  ): WetInkLatencySnapshot {
    for (const inputTimestampMs of inputTimestampsMs) {
      const latencyMs = Math.max(
        0,
        renderedAtMs -
          normalizeLatencyTimestamp(inputTimestampMs, renderedAtMs),
      );
      this.count += 1;
      this.lastMs = latencyMs;
      this.maxMs = Math.max(this.maxMs, latencyMs);
      this.sumMs += latencyMs;
      this.window.push(latencyMs);
      if (this.window.length > wetInkLatencyWindowSize) {
        this.window.splice(0, this.window.length - wetInkLatencyWindowSize);
      }
    }
    return this.snapshot();
  }

  snapshot(): WetInkLatencySnapshot {
    return {
      count: this.count,
      lastMs: this.lastMs,
      maxMs: this.maxMs,
      meanMs: this.count === 0 ? 0 : this.sumMs / this.count,
      p95Ms: percentile95(this.window),
    };
  }
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return left.x === right.x && left.y === right.y;
}

function appendUniqueSample(
  output: WetInkSample[],
  sample: WetInkSample,
): boolean {
  const previous = output.at(-1);
  if (previous !== undefined && samePoint(previous.point, sample.point)) {
    output[output.length - 1] = sample;
    return false;
  }
  output.push(sample);
  return true;
}

function boundedPredictedSamples(
  samples: readonly WetInkSample[],
): readonly WetInkSample[] {
  const output: WetInkSample[] = [];
  for (const sample of samples.slice(-maximumWetInkPredictedPoints)) {
    appendUniqueSample(output, sample);
  }
  return output;
}

export class WetInkRenderer {
  private readonly actualSamples: WetInkSample[] = [];
  private active = false;
  private clearAfterPaint = false;
  private frameCount = 0;
  private frameId: number | null = null;
  private readonly latency = new WetInkLatencyTracker();
  private readonly pendingInputTimestampsMs: number[] = [];
  private predictedSamples: readonly WetInkSample[] = [];
  private style: WetInkStyle = {
    opacity: 1,
    stroke: "#245d6b",
    strokeWidth: 3,
  };
  private viewport: ViewportState = { offset: { x: 0, y: 0 }, zoom: 1 };

  constructor(
    private readonly surface: WetInkSurface,
    private readonly options: WetInkRendererOptions = {},
  ) {}

  begin(
    sample: WetInkSample,
    style: WetInkStyle,
    viewport: ViewportState,
  ): void {
    this.cancelScheduledFrame();
    this.surface.clear();
    this.actualSamples.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedSamples = [];
    this.active = true;
    this.clearAfterPaint = false;
    this.style = style;
    this.viewport = viewport;
    this.append([sample], []);
  }

  append(
    samples: readonly WetInkSample[],
    predictedSamples: readonly WetInkSample[],
  ): void {
    if (!this.active) return;
    for (const sample of samples) {
      if (this.actualSamples.length >= maximumWetInkActualPoints) break;
      if (appendUniqueSample(this.actualSamples, sample)) {
        this.pendingInputTimestampsMs.push(sample.inputTimestampMs);
      }
    }
    this.predictedSamples = boundedPredictedSamples(predictedSamples);
    this.scheduleFrame();
  }

  finish(
    samples: readonly WetInkSample[] = [],
    predictedSamples: readonly WetInkSample[] = [],
  ): void {
    if (!this.active) return;
    this.append(samples, predictedSamples);
    this.clearAfterPaint = true;
    this.scheduleFrame();
  }

  setViewport(viewport: ViewportState): void {
    this.viewport = viewport;
    if (this.active) this.scheduleFrame();
  }

  cancel(): void {
    this.cancelScheduledFrame();
    this.active = false;
    this.clearAfterPaint = false;
    this.actualSamples.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedSamples = [];
    this.surface.clear();
    this.options.onClear?.();
  }

  destroy(): void {
    this.cancelScheduledFrame();
    this.surface.destroy();
    this.active = false;
    this.actualSamples.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedSamples = [];
  }

  getLatencySnapshot(): WetInkLatencySnapshot {
    return this.latency.snapshot();
  }

  private readonly paintFrame = (frameTimeMs: number): void => {
    this.frameId = null;
    if (!this.active) return;
    const renderedAtMs = Number.isFinite(frameTimeMs)
      ? frameTimeMs
      : this.clock.now();
    this.surface.draw({
      actualPoints: this.actualSamples.map(({ point }) => point),
      actualSamples: this.actualSamples,
      predictedPoints: this.predictedSamples.map(({ point }) => point),
      predictedSamples: this.predictedSamples,
      style: this.style,
      viewport: this.viewport,
    });
    this.frameCount += 1;
    const latency = this.latency.record(
      this.pendingInputTimestampsMs,
      renderedAtMs,
    );
    this.pendingInputTimestampsMs.length = 0;
    this.options.onFrame?.({
      actualPointCount: this.actualSamples.length,
      frameCount: this.frameCount,
      latency,
      predictedPointCount: this.predictedSamples.length,
      renderedAtMs,
    });
    if (this.clearAfterPaint) {
      this.clearAfterPaint = false;
      this.frameId = this.clock.request(this.clearFrame);
    }
  };

  private readonly clearFrame = (): void => {
    this.frameId = null;
    this.active = false;
    this.actualSamples.length = 0;
    this.predictedSamples = [];
    this.surface.clear();
    this.options.onClear?.();
  };

  private get clock(): WetInkFrameClock {
    return this.options.clock ?? browserWetInkFrameClock;
  }

  private scheduleFrame(): void {
    if (this.frameId !== null) return;
    this.frameId = this.clock.request(this.paintFrame);
  }

  private cancelScheduledFrame(): void {
    if (this.frameId === null) return;
    this.clock.cancel(this.frameId);
    this.frameId = null;
  }
}

function vectorSamples(
  samples: readonly WetInkSample[],
): readonly VectorInkSample[] {
  const origin = samples[0]?.inputTimestampMs ?? 0;
  return samples.map((sample) => ({
    point: sample.point,
    pressure: sample.pressure,
    timestampMs: Math.max(0, sample.inputTimestampMs - origin),
  }));
}

function pressureWidth(strokeWidth: number, pressure: number): number {
  return strokeWidth * (0.35 + 0.9 * Math.min(1, Math.max(0, pressure)));
}

export function createKonvaWetInkSurface(layer: Konva.Layer): WetInkSurface {
  const group = new Konva.Group({ listening: false });
  const actualPath = new Konva.Path({
    listening: false,
    perfectDrawEnabled: false,
    visible: false,
  });
  const predictedPath = new Konva.Path({
    listening: false,
    perfectDrawEnabled: false,
    visible: false,
  });
  const actualDot = new Konva.Circle({
    listening: false,
    perfectDrawEnabled: false,
    visible: false,
  });
  group.add(actualPath);
  group.add(predictedPath);
  group.add(actualDot);
  layer.add(group);

  return {
    clear() {
      actualPath.data("");
      actualPath.visible(false);
      predictedPath.data("");
      predictedPath.visible(false);
      actualDot.visible(false);
      layer.draw();
    },
    destroy() {
      group.destroy();
      layer.draw();
    },
    draw(frame) {
      group.position(frame.viewport.offset);
      group.scale({ x: frame.viewport.zoom, y: frame.viewport.zoom });
      const actualInk = createVectorInkData(
        vectorSamples(frame.actualSamples),
        false,
      );
      const actualData = vectorInkOutlinePathData(
        actualInk,
        frame.style.strokeWidth,
      );
      actualPath.data(actualData);
      actualPath.fill(frame.style.stroke);
      actualPath.opacity(frame.style.opacity);
      actualPath.visible(actualData.length > 0);
      const first = frame.actualSamples[0];
      actualDot.position(first?.point ?? { x: 0, y: 0 });
      actualDot.radius(
        first === undefined
          ? 0
          : pressureWidth(frame.style.strokeWidth, first.pressure) / 2,
      );
      actualDot.fill(frame.style.stroke);
      actualDot.opacity(frame.style.opacity);
      actualDot.visible(frame.actualSamples.length === 1);

      const previous = frame.actualSamples.at(-1);
      const predictedSamples =
        previous === undefined
          ? frame.predictedSamples
          : [previous, ...frame.predictedSamples];
      const predictedInk = createVectorInkData(
        vectorSamples(predictedSamples),
        false,
      );
      const predictedData = vectorInkOutlinePathData(
        predictedInk,
        frame.style.strokeWidth,
      );
      predictedPath.data(predictedData);
      predictedPath.fill(frame.style.stroke);
      predictedPath.opacity(Math.min(1, frame.style.opacity * 0.42));
      predictedPath.visible(predictedData.length > 0);
      layer.draw();
    },
  };
}
