import Konva from "konva";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createPenStrokeRenderPaths,
  createVectorInkData,
} from "../../../../src/core/public";

import {
  createKonvaWetInkSurface,
  wetInkMutableTailSize,
  wetInkSealedChunkSize,
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
      actualSamples: [...frame.actualSamples],
      predictedSamples: [...frame.predictedSamples],
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
      { inputTimestampMs: 1, point: { x: 0, y: 0 }, pressure: 0.5 },
      style,
      viewport,
    );
    renderer.append(
      [
        { inputTimestampMs: 2, point: { x: 1, y: 1 }, pressure: 0.5 },
        { inputTimestampMs: 3, point: { x: 2, y: 2 }, pressure: 0.5 },
      ],
      [{ inputTimestampMs: 4, point: { x: 3, y: 3 }, pressure: 0.5 }],
    );

    expect(clock.pending()).toBe(1);
    expect(surface.frames).toHaveLength(0);
    clock.step(9);

    expect(surface.frames).toHaveLength(1);
    expect(surface.frames[0]?.actualSamples.map(({ point }) => point)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(
      surface.frames[0]?.predictedSamples.map(({ point }) => point),
    ).toEqual([{ x: 3, y: 3 }]);
    expect(reports[0]?.latency.count).toBe(3);
    expect(reports[0]?.frameCount).toBe(1);
  });

  it("preserves strokeStyle on transient wet-ink frames", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const renderer = new WetInkRenderer(surface, { clock });

    renderer.begin(
      { inputTimestampMs: 1, point: { x: 0, y: 0 }, pressure: 0.5 },
      { ...style, strokeStyle: "wavy" },
      viewport,
    );
    renderer.append(
      [{ inputTimestampMs: 2, point: { x: 40, y: 0 }, pressure: 0.6 }],
      [],
    );
    clock.step(9);

    expect(surface.frames).toHaveLength(1);
    expect(surface.frames[0]?.style).toMatchObject({
      strokeStyle: "wavy",
      strokeWidth: 4,
    });
  });

  it("replaces predictions without committing them to actual ink", () => {
    const clock = new FakeClock();
    const surface = new FakeSurface();
    const renderer = new WetInkRenderer(surface, { clock });

    renderer.begin(
      { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
      style,
      viewport,
    );
    renderer.append(
      [],
      [
        { inputTimestampMs: 1, point: { x: 4, y: 4 }, pressure: 0.5 },
        { inputTimestampMs: 2, point: { x: 5, y: 5 }, pressure: 0.5 },
      ],
    );
    renderer.append(
      [],
      [{ inputTimestampMs: 3, point: { x: 6, y: 6 }, pressure: 0.5 }],
    );
    clock.step(8);

    expect(surface.frames[0]?.actualSamples.map(({ point }) => point)).toEqual([
      { x: 0, y: 0 },
    ]);
    expect(
      surface.frames[0]?.predictedSamples.map(({ point }) => point),
    ).toEqual([{ x: 6, y: 6 }]);
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
      { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
      style,
      viewport,
    );
    renderer.finish([
      { inputTimestampMs: 4, point: { x: 10, y: 10 }, pressure: 0.5 },
    ]);
    clock.step(7);

    expect(surface.frames.at(-1)?.actualSamples.at(-1)?.point).toEqual({
      x: 10,
      y: 10,
    });
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
      { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
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
      { inputTimestampMs: 90, point: { x: 0, y: 0 }, pressure: 0.5 },
      style,
      viewport,
    );
    renderer.append(
      [
        { inputTimestampMs: 92, point: { x: 1, y: 1 }, pressure: 0.5 },
        { inputTimestampMs: 96, point: { x: 2, y: 2 }, pressure: 0.5 },
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

function frame(
  actualSamples: WetInkFrame["actualSamples"],
  predictedSamples: WetInkFrame["predictedSamples"] = [],
  frameStyle: WetInkFrame["style"] = style,
  actualSampleCount = actualSamples.length,
): WetInkFrame {
  return {
    actualSampleCount,
    actualSamples,
    predictedSamples,
    style: frameStyle,
    viewport,
  };
}

function createInspectableWetInkSurface() {
  const layer = new Konva.Layer();
  Object.defineProperty(layer, "draw", {
    configurable: true,
    value: () => layer,
  });
  const surface = createKonvaWetInkSurface(layer);
  const group = layer.getChildren()[0];
  if (!(group instanceof Konva.Group)) {
    throw new Error("Wet Ink surface must attach one Konva.Group.");
  }
  return { group, layer, surface };
}

function visibleChildren(group: Konva.Group): Konva.Node[] {
  const output: Konva.Node[] = [];
  for (const node of group.getChildren()) {
    if (node instanceof Konva.Group) {
      output.push(...visibleChildren(node));
    } else if (node.visible()) {
      output.push(node);
    }
  }
  return output;
}

let canvasGetContextDescriptor: PropertyDescriptor | undefined;

function installKonvaCanvasContextStub(): void {
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
          return {
            data: new Uint8ClampedArray([0, 0, 0, 0]),
          };
        },
        scale() {},
      };
    },
  });
}

function restoreKonvaCanvasContext(): void {
  if (canvasGetContextDescriptor === undefined) {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "getContext");
    return;
  }
  Object.defineProperty(
    HTMLCanvasElement.prototype,
    "getContext",
    canvasGetContextDescriptor,
  );
}

describe("createKonvaWetInkSurface", () => {
  beforeEach(() => {
    installKonvaCanvasContextStub();
  });

  afterEach(() => {
    restoreKonvaCanvasContext();
  });

  it("renders one fast-path circle for a single actual sample with no predictions", () => {
    const { group, surface } = createInspectableWetInkSurface();
    surface.draw(
      frame([{ inputTimestampMs: 0, point: { x: 12, y: 18 }, pressure: 0.8 }]),
    );

    const visible = visibleChildren(group);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toBeInstanceOf(Konva.Circle);
    expect(visible.filter((node) => node instanceof Konva.Path)).toHaveLength(
      0,
    );
  });

  it("matches final marker opacity for a single transient tap", () => {
    const markerStyle = {
      ...style,
      opacity: 0.8,
      strokeStyle: "marker",
    } as const;
    const sample = {
      inputTimestampMs: 0,
      point: { x: 12, y: 18 },
      pressure: 0.8,
    } as const;
    const { group, surface } = createInspectableWetInkSurface();
    surface.draw(frame([sample], [], markerStyle));

    const [visible] = visibleChildren(group);
    const final = createPenStrokeRenderPaths(
      createVectorInkData([
        {
          point: sample.point,
          pressure: sample.pressure,
          timestampMs: 0,
        },
      ]),
      "marker",
      markerStyle.strokeWidth,
    );

    expect(visible).toBeInstanceOf(Konva.Circle);
    expect(final).toHaveLength(1);
    expect(visible?.opacity()).toBeCloseTo(
      markerStyle.opacity * (final[0]?.opacityMultiplier ?? 0),
      10,
    );
  });

  it("does not create predicted geometry when no predicted samples exist", () => {
    const { group, surface } = createInspectableWetInkSurface();
    surface.draw(
      frame([
        { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
        { inputTimestampMs: 4, point: { x: 30, y: 20 }, pressure: 0.6 },
      ]),
    );

    const visible = visibleChildren(group);
    expect(visible.filter((node) => node instanceof Konva.Path)).toHaveLength(
      1,
    );
    expect(visible.filter((node) => node instanceof Konva.Circle)).toHaveLength(
      0,
    );
  });

  it("seals old geometry and keeps the mutable tail bounded", () => {
    const { surface } = createInspectableWetInkSurface();
    const initial = Array.from(
      { length: wetInkSealedChunkSize + wetInkMutableTailSize + 40 },
      (_value, index) => ({
        inputTimestampMs: index * 4,
        point: { x: index * 2, y: Math.sin(index / 6) * 12 },
        pressure: 0.45 + (index % 5) * 0.05,
      }),
    );

    const first = surface.draw(frame(initial, [], style, initial.length));
    expect(first).toMatchObject({ sealedChunkCount: 1 });
    expect(first?.mutableTailSampleCount).toBeLessThanOrEqual(
      wetInkSealedChunkSize + wetInkMutableTailSize,
    );

    const delta = Array.from({ length: 80 }, (_value, index) => ({
      inputTimestampMs: (initial.length + index) * 4,
      point: {
        x: (initial.length + index) * 2,
        y: Math.sin((initial.length + index) / 6) * 12,
      },
      pressure: 0.55,
    }));
    const second = surface.draw(
      frame(delta, [], style, initial.length + delta.length),
    );
    expect(second?.sealedChunkCount).toBeGreaterThanOrEqual(2);
    expect(second?.mutableTailSampleCount).toBeLessThanOrEqual(
      wetInkSealedChunkSize + wetInkMutableTailSize,
    );
    expect(second?.generatedActualSampleCount).toBeLessThan(
      initial.length + delta.length,
    );
  });

  it("renders prediction geometry only when real predicted samples exist", () => {
    const { group, surface } = createInspectableWetInkSurface();
    surface.draw(
      frame(
        [
          { inputTimestampMs: 0, point: { x: 0, y: 0 }, pressure: 0.5 },
          { inputTimestampMs: 4, point: { x: 30, y: 20 }, pressure: 0.6 },
        ],
        [{ inputTimestampMs: 8, point: { x: 45, y: 26 }, pressure: 0.55 }],
      ),
    );

    const paths = visibleChildren(group).filter(
      (node): node is Konva.Path => node instanceof Konva.Path,
    );
    expect(paths).toHaveLength(2);
    expect(paths.map((path) => path.opacity()).sort()).toEqual([
      style.opacity * 0.42,
      style.opacity,
    ]);
  });
});
