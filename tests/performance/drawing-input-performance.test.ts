import { describe, expect, it } from "vitest";

import { boardObjectId } from "../../src/core/public";
import {
  drawingStyleDefaults,
  reduceDrawingInteraction,
  reduceDrawingInteractionBatch,
  type DrawingInteractionState,
} from "../../src/modules/drawing/public";

describe("drawing input performance budgets", () => {
  it("appends 20,000 moving samples in frame batches without per-sample history copies", () => {
    let state: DrawingInteractionState = reduceDrawingInteraction(
      { kind: "idle" },
      {
        inputTimestampMs: 0,
        kind: "start",
        objectId: boardObjectId("object:moving-pen-batch-performance"),
        point: { x: 0, y: 0 },
        pointerId: 2,
        pressure: 0.45,
        style: drawingStyleDefaults.pen,
        text: "",
        tool: "drawing.pen",
      },
    ).state;

    const frames = 400;
    const samplesPerFrame = 50;
    const startedAt = performance.now();
    for (let frame = 0; frame < frames; frame += 1) {
      const actions = Array.from(
        { length: samplesPerFrame },
        (_value, index) => {
          const sampleIndex = frame * samplesPerFrame + index + 1;
          return {
            inputTimestampMs: sampleIndex / 15,
            kind: "move" as const,
            point: {
              x: sampleIndex * 0.35,
              y: Math.sin(sampleIndex / 24) * 18,
            },
            pointerId: 2,
            pressure: 0.35 + (sampleIndex % 20) / 40,
          };
        },
      );
      state = reduceDrawingInteractionBatch(state, actions).state;
    }
    const elapsed = performance.now() - startedAt;

    expect(state.kind).toBe("drawing-pen");
    if (state.kind !== "drawing-pen") return;
    expect(state.samples).toHaveLength(frames * samplesPerFrame + 1);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("coalesces stationary pressure jitter without unbounded sample growth", () => {
    let state: DrawingInteractionState = reduceDrawingInteraction(
      { kind: "idle" },
      {
        inputTimestampMs: 0,
        kind: "start",
        objectId: boardObjectId("object:pressure-jitter-performance"),
        point: { x: 100, y: 100 },
        pointerId: 1,
        pressure: 0.5,
        style: drawingStyleDefaults.pen,
        text: "",
        tool: "drawing.pen",
      },
    ).state;

    const sampleCount = 20_000;
    const startedAt = performance.now();
    for (let index = 0; index < sampleCount; index += 1) {
      state = reduceDrawingInteraction(state, {
        inputTimestampMs: index + 1,
        kind: "move",
        point: { x: 100, y: 100 },
        pointerId: 1,
        pressure: 0.5 + ((index % 5) - 2) * 0.002,
      }).state;
    }
    const elapsed = performance.now() - startedAt;

    expect(state.kind).toBe("drawing-pen");
    if (state.kind !== "drawing-pen") return;
    expect(state.samples).toHaveLength(1);
    expect(elapsed).toBeLessThan(1_000);
  });
});
