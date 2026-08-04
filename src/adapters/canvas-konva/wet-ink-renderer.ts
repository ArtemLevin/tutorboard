import Konva from "konva";

import type { Vec2, ViewportState } from "../../core/public";

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
  readonly predictedPoints: readonly Vec2[];
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

function appendUniquePoint(output: Vec2[], point: Vec2): boolean {
  const previous = output.at(-1);
  if (previous !== undefined && samePoint(previous, point)) return false;
  output.push(point);
  return true;
}

function boundedPredictedPoints(
  samples: readonly WetInkSample[],
): readonly Vec2[] {
  const output: Vec2[] = [];
  for (const sample of samples.slice(-maximumWetInkPredictedPoints)) {
    appendUniquePoint(output, sample.point);
  }
  return output;
}

export class WetInkRenderer {
  private readonly actualPoints: Vec2[] = [];
  private active = false;
  private clearAfterPaint = false;
  private frameCount = 0;
  private frameId: number | null = null;
  private readonly latency = new WetInkLatencyTracker();
  private readonly pendingInputTimestampsMs: number[] = [];
  private predictedPoints: readonly Vec2[] = [];
  private style: WetInkStyle = {
    opacity: 1,
    stroke: "#245d6b",
    strokeWidth: 3,
  };
  private viewport: ViewportState = {
    offset: { x: 0, y: 0 },
    zoom: 1,
  };

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
    this.actualPoints.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedPoints = [];
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
      if (this.actualPoints.length >= maximumWetInkActualPoints) break;
      if (appendUniquePoint(this.actualPoints, sample.point)) {
        this.pendingInputTimestampsMs.push(sample.inputTimestampMs);
      }
    }
    this.predictedPoints = boundedPredictedPoints(predictedSamples);
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
    this.actualPoints.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedPoints = [];
    this.surface.clear();
    this.options.onClear?.();
  }

  destroy(): void {
    this.cancelScheduledFrame();
    this.surface.destroy();
    this.active = false;
    this.actualPoints.length = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedPoints = [];
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
      actualPoints: this.actualPoints,
      predictedPoints: this.predictedPoints,
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
      actualPointCount: this.actualPoints.length,
      frameCount: this.frameCount,
      latency,
      predictedPointCount: this.predictedPoints.length,
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
    this.actualPoints.length = 0;
    this.predictedPoints = [];
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

function flattenPoints(points: readonly Vec2[]): number[] {
  const flattened = new Array<number>(points.length * 2);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    flattened[index * 2] = point.x;
    flattened[index * 2 + 1] = point.y;
  }
  return flattened;
}

export function createKonvaWetInkSurface(layer: Konva.Layer): WetInkSurface {
  const group = new Konva.Group({ listening: false });
  const actualLine = new Konva.Line({
    lineCap: "round",
    lineJoin: "round",
    listening: false,
    perfectDrawEnabled: false,
    tension: 0.32,
    visible: false,
  });
  const predictedLine = new Konva.Line({
    lineCap: "round",
    lineJoin: "round",
    listening: false,
    perfectDrawEnabled: false,
    tension: 0.32,
    visible: false,
  });
  group.add(actualLine);
  group.add(predictedLine);
  layer.add(group);

  return {
    clear() {
      actualLine.points([]);
      actualLine.visible(false);
      predictedLine.points([]);
      predictedLine.visible(false);
      layer.draw();
    },
    destroy() {
      group.destroy();
      layer.draw();
    },
    draw(frame) {
      group.position(frame.viewport.offset);
      group.scale({ x: frame.viewport.zoom, y: frame.viewport.zoom });
      actualLine.points(flattenPoints(frame.actualPoints));
      actualLine.opacity(frame.style.opacity);
      actualLine.stroke(frame.style.stroke);
      actualLine.strokeWidth(frame.style.strokeWidth);
      actualLine.visible(frame.actualPoints.length > 0);

      const previous = frame.actualPoints.at(-1);
      const predictedPoints =
        previous === undefined
          ? frame.predictedPoints
          : [previous, ...frame.predictedPoints];
      predictedLine.points(flattenPoints(predictedPoints));
      predictedLine.opacity(Math.min(1, frame.style.opacity * 0.42));
      predictedLine.stroke(frame.style.stroke);
      predictedLine.strokeWidth(frame.style.strokeWidth);
      predictedLine.visible(predictedPoints.length > 1);
      layer.draw();
    },
  };
}
