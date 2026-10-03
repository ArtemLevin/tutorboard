import { describe, expect, it } from "vitest";

import { boardObjectId } from "../../src/core/public";
import {
  drawingStyleDefaults,
  reduceDrawingInteraction,
  type DrawingInteractionState,
} from "../../src/modules/drawing/public";

describe("drawing input performance budgets", () => {
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
