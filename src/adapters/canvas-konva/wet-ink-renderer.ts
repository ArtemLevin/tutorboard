import Konva from "konva";

import {
  createPenStrokeRenderPaths,
  createVectorInkData,
  strokeStyleOpacityMultiplier,
  type PenStrokeRenderPath,
  type StrokeStyle,
  type Vec2,
  type VectorInkSample,
  type ViewportState,
} from "../../core/public";

export const maximumWetInkActualPoints = 100_000;
export const maximumWetInkPredictedPoints = 64;
export const wetInkLatencyWindowSize = 240;
export const wetInkLatencyPercentileRefreshMs = 500;
export const wetInkSealedChunkSize = 96;
export const wetInkMutableTailSize = 24;

export interface WetInkStyle {
  readonly opacity: number;
  readonly stroke: string;
  readonly strokeStyle?: StrokeStyle;
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
  readonly actualSampleCount: number;
  readonly actualSamples: readonly WetInkSample[];
  readonly predictedSamples: readonly WetInkSample[];
  readonly style: WetInkStyle;
  readonly viewport: ViewportState;
}

export interface WetInkSurfaceFrameReport {
  readonly generatedActualSampleCount: number;
  readonly mutableTailSampleCount: number;
  readonly sealedChunkCount: number;
}

export interface WetInkFrameReport {
  readonly actualBatchPointCount: number;
  readonly actualPointCount: number;
  readonly frameCount: number;
  readonly frameGapMs: number;
  readonly generatedActualSampleCount: number;
  readonly latency: WetInkLatencySnapshot;
  readonly maxFrameGapMs: number;
  readonly mutableTailPointCount: number;
  readonly pendingInputCount: number;
  readonly predictedPointCount: number;
  readonly renderedAtMs: number;
  readonly sealedChunkCount: number;
}

export interface WetInkSurface {
  clear(): void;
  destroy(): void;
  draw(frame: WetInkFrame): WetInkSurfaceFrameReport | void;
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

const emptySurfaceFrameReport: WetInkSurfaceFrameReport = {
  generatedActualSampleCount: 0,
  mutableTailSampleCount: 0,
  sealedChunkCount: 0,
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
  private p95Ms = 0;
  private lastPercentileRefreshAtMs = Number.NEGATIVE_INFINITY;

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
    if (
      renderedAtMs - this.lastPercentileRefreshAtMs >=
      wetInkLatencyPercentileRefreshMs
    ) {
      this.p95Ms = percentile95(this.window);
      this.lastPercentileRefreshAtMs = renderedAtMs;
    }
    return this.cachedSnapshot();
  }

  snapshot(): WetInkLatencySnapshot {
    this.p95Ms = percentile95(this.window);
    return this.cachedSnapshot();
  }

  private cachedSnapshot(): WetInkLatencySnapshot {
    return {
      count: this.count,
      lastMs: this.lastMs,
      maxMs: this.maxMs,
      meanMs: this.count === 0 ? 0 : this.sumMs / this.count,
      p95Ms: this.p95Ms,
    };
  }
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return left.x === right.x && left.y === right.y;
}

function appendUniqueSample(
  output: WetInkSample[],
  sample: WetInkSample,
): "appended" | "replaced" {
  const previous = output.at(-1);
  if (previous !== undefined && samePoint(previous.point, sample.point)) {
    output[output.length - 1] = sample;
    return "replaced";
  }
  output.push(sample);
  return "appended";
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
  private lastRenderedAtMs: number | null = null;
  private maxFrameGapMs = 0;
  private paintedActualSampleCount = 0;
  private readonly pendingInputTimestampsMs: number[] = [];
  private predictedSamples: readonly WetInkSample[] = [];
  private style: WetInkStyle = {
    opacity: 1,
    stroke: "#245d6b",
    strokeStyle: "thin",
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
    this.lastRenderedAtMs = null;
    this.maxFrameGapMs = 0;
    this.paintedActualSampleCount = 0;
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
      const result = appendUniqueSample(this.actualSamples, sample);
      if (result === "appended") {
        this.pendingInputTimestampsMs.push(sample.inputTimestampMs);
      } else if (
        this.paintedActualSampleCount === this.actualSamples.length &&
        this.paintedActualSampleCount > 0
      ) {
        this.paintedActualSampleCount -= 1;
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
    this.paintedActualSampleCount = 0;
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
    this.paintedActualSampleCount = 0;
    this.pendingInputTimestampsMs.length = 0;
    this.predictedSamples = [];
  }

  getLatencySnapshot(): WetInkLatencySnapshot {
    return this.latency.snapshot();
  }

  private readonly paintFrame = (): void => {
    this.frameId = null;
    if (!this.active) return;
    const actualSamples = this.actualSamples.slice(
      this.paintedActualSampleCount,
    );
    this.paintedActualSampleCount = this.actualSamples.length;
    const pendingInputCount = this.pendingInputTimestampsMs.length;
    const surfaceReport =
      this.surface.draw({
        actualSampleCount: this.actualSamples.length,
        actualSamples,
        predictedSamples: this.predictedSamples,
        style: this.style,
        viewport: this.viewport,
      }) ?? emptySurfaceFrameReport;
    const renderedAtMs = this.clock.now();
    const frameGapMs =
      this.lastRenderedAtMs === null
        ? 0
        : Math.max(0, renderedAtMs - this.lastRenderedAtMs);
    this.lastRenderedAtMs = renderedAtMs;
    this.maxFrameGapMs = Math.max(this.maxFrameGapMs, frameGapMs);
    this.frameCount += 1;
    const latency = this.latency.record(
      this.pendingInputTimestampsMs,
      renderedAtMs,
    );
    this.pendingInputTimestampsMs.length = 0;
    this.options.onFrame?.({
      actualBatchPointCount: actualSamples.length,
      actualPointCount: this.actualSamples.length,
      frameCount: this.frameCount,
      frameGapMs,
      generatedActualSampleCount: surfaceReport.generatedActualSampleCount,
      latency,
      maxFrameGapMs: this.maxFrameGapMs,
      mutableTailPointCount: surfaceReport.mutableTailSampleCount,
      pendingInputCount,
      predictedPointCount: this.predictedSamples.length,
      renderedAtMs,
      sealedChunkCount: surfaceReport.sealedChunkCount,
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
    this.paintedActualSampleCount = 0;
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

function createPathNode(): Konva.Path {
  return new Konva.Path({
    listening: false,
    perfectDrawEnabled: false,
    visible: false,
  });
}

function applyPathStyle(
  node: Konva.Path,
  path: PenStrokeRenderPath,
  style: WetInkStyle,
  opacityScale: number,
): void {
  node.data(path.data);
  node.fill(style.stroke);
  node.opacity(
    Math.min(1, style.opacity * path.opacityMultiplier * opacityScale),
  );
  node.visible(path.data.length > 0);
}

function syncPathPool(
  group: Konva.Group,
  pool: Konva.Path[],
  paths: readonly PenStrokeRenderPath[],
  style: WetInkStyle,
  opacityScale: number,
): void {
  while (pool.length < paths.length) {
    const path = createPathNode();
    pool.push(path);
    group.add(path);
  }
  for (let index = 0; index < pool.length; index += 1) {
    const node = pool[index]!;
    const path = paths[index];
    if (path === undefined) {
      node.data("");
      node.visible(false);
      continue;
    }
    applyPathStyle(node, path, style, opacityScale);
  }
}

function appendSealedPaths(
  group: Konva.Group,
  paths: readonly PenStrokeRenderPath[],
  style: WetInkStyle,
): void {
  for (const path of paths) {
    const node = createPathNode();
    applyPathStyle(node, path, style, 1);
    group.add(node);
  }
}

function polylineDistance(samples: readonly WetInkSample[]): number {
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!.point;
    const current = samples[index]!.point;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}

function renderWetInkPaths(
  samples: readonly WetInkSample[],
  style: WetInkStyle,
  distanceOffset: number,
): readonly PenStrokeRenderPath[] {
  if (samples.length < 2) return [];
  return createPenStrokeRenderPaths(
    createVectorInkData(vectorSamples(samples), false),
    style.strokeStyle,
    style.strokeWidth,
    {
      continuousStylePhase: true,
      distanceOffset,
    },
  );
}

export function createKonvaWetInkSurface(layer: Konva.Layer): WetInkSurface {
  const group = new Konva.Group({ listening: false });
  const sealedGroup = new Konva.Group({ listening: false });
  const tailGroup = new Konva.Group({ listening: false });
  const predictedGroup = new Konva.Group({ listening: false });
  const tailPaths: Konva.Path[] = [];
  const predictedPaths: Konva.Path[] = [];
  const actualDot = new Konva.Circle({
    listening: false,
    perfectDrawEnabled: false,
    visible: false,
  });
  let mutableTailSamples: WetInkSample[] = [];
  let mutableTailDistanceOffset = 0;
  let sealedChunkCount = 0;

  group.add(sealedGroup);
  group.add(tailGroup);
  group.add(predictedGroup);
  group.add(actualDot);
  layer.add(group);

  const resetGeometry = () => {
    sealedGroup.destroyChildren();
    mutableTailSamples = [];
    mutableTailDistanceOffset = 0;
    sealedChunkCount = 0;
    syncPathPool(
      tailGroup,
      tailPaths,
      [],
      {
        opacity: 1,
        stroke: "#000000",
        strokeWidth: 1,
      },
      1,
    );
    syncPathPool(
      predictedGroup,
      predictedPaths,
      [],
      {
        opacity: 1,
        stroke: "#000000",
        strokeWidth: 1,
      },
      1,
    );
    actualDot.visible(false);
  };

  return {
    clear() {
      resetGeometry();
      layer.batchDraw();
    },
    destroy() {
      group.destroy();
      layer.batchDraw();
    },
    draw(frame) {
      group.position(frame.viewport.offset);
      group.scale({ x: frame.viewport.zoom, y: frame.viewport.zoom });

      for (const sample of frame.actualSamples) {
        appendUniqueSample(mutableTailSamples, sample);
      }

      let generatedActualSampleCount = 0;
      let geometryChanged = frame.actualSamples.length > 0;
      while (
        mutableTailSamples.length >
        wetInkSealedChunkSize + wetInkMutableTailSize
      ) {
        const chunk = mutableTailSamples.slice(0, wetInkSealedChunkSize);
        appendSealedPaths(
          sealedGroup,
          renderWetInkPaths(chunk, frame.style, mutableTailDistanceOffset),
          frame.style,
        );
        generatedActualSampleCount += chunk.length;
        mutableTailDistanceOffset += polylineDistance(chunk);
        mutableTailSamples = mutableTailSamples.slice(
          wetInkSealedChunkSize - 1,
        );
        sealedChunkCount += 1;
        geometryChanged = true;
      }

      if (geometryChanged) {
        generatedActualSampleCount += mutableTailSamples.length;
        syncPathPool(
          tailGroup,
          tailPaths,
          renderWetInkPaths(
            mutableTailSamples,
            frame.style,
            mutableTailDistanceOffset,
          ),
          frame.style,
          1,
        );
      }

      const first = mutableTailSamples[0];
      actualDot.position(first?.point ?? { x: 0, y: 0 });
      actualDot.radius(
        first === undefined
          ? 0
          : pressureWidth(frame.style.strokeWidth, first.pressure) / 2,
      );
      actualDot.fill(frame.style.stroke);
      actualDot.opacity(
        frame.style.opacity *
          strokeStyleOpacityMultiplier(frame.style.strokeStyle),
      );
      actualDot.visible(frame.actualSampleCount === 1);

      const previous = mutableTailSamples.at(-1);
      const predictedSamples =
        frame.predictedSamples.length === 0
          ? []
          : previous === undefined
            ? frame.predictedSamples
            : [previous, ...frame.predictedSamples];
      syncPathPool(
        predictedGroup,
        predictedPaths,
        renderWetInkPaths(
          predictedSamples,
          frame.style,
          mutableTailDistanceOffset + polylineDistance(mutableTailSamples),
        ),
        frame.style,
        0.42,
      );

      layer.draw();
      return {
        generatedActualSampleCount,
        mutableTailSampleCount: mutableTailSamples.length,
        sealedChunkCount,
      };
    },
  };
}
