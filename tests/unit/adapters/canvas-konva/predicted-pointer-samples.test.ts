import { describe, expect, it } from "vitest";

import {
  collectPredictedPointerEvents,
  maximumPredictedPointerEvents,
  pointerEventInputTimestampMs,
} from "../../../../src/adapters/canvas-konva/public";

interface PointerFixture {
  readonly clientX: number;
  readonly clientY: number;
  readonly getPredictedEvents?: () => readonly PointerEvent[];
  readonly pointerId: number;
  readonly pressure: number;
  readonly timeStamp: number;
}

function pointerEvent(overrides: Partial<PointerFixture> = {}): PointerEvent {
  return {
    clientX: overrides.clientX ?? 10,
    clientY: overrides.clientY ?? 20,
    ...(overrides.getPredictedEvents === undefined
      ? {}
      : { getPredictedEvents: overrides.getPredictedEvents }),
    pointerId: overrides.pointerId ?? 7,
    pressure: overrides.pressure ?? 0.5,
    timeStamp: overrides.timeStamp ?? 100,
  } as unknown as PointerEvent;
}

describe("predicted pointer samples", () => {
  it("uses an empty fallback when prediction is unavailable or throws", () => {
    const unavailable = pointerEvent();
    const throwing = pointerEvent({
      getPredictedEvents: () => {
        throw new Error("unsupported");
      },
    });
    expect(collectPredictedPointerEvents(unavailable)).toEqual([]);
    expect(collectPredictedPointerEvents(throwing)).toEqual([]);
  });

  it("preserves order, filters pointer IDs and removes adjacent duplicates", () => {
    const first = pointerEvent({ clientX: 11, timeStamp: 101 });
    const duplicate = pointerEvent({ clientX: 11, timeStamp: 101 });
    const foreign = pointerEvent({ pointerId: 99, timeStamp: 102 });
    const second = pointerEvent({ clientX: 14, timeStamp: 103 });
    const dispatched = pointerEvent({
      getPredictedEvents: () => [first, duplicate, foreign, second],
    });
    expect(collectPredictedPointerEvents(dispatched)).toEqual([first, second]);
  });

  it("bounds unexpectedly large prediction batches", () => {
    const samples = Array.from(
      { length: maximumPredictedPointerEvents + 20 },
      (_value, index) => pointerEvent({ clientX: index, timeStamp: index }),
    );
    const dispatched = pointerEvent({ getPredictedEvents: () => samples });
    const predicted = collectPredictedPointerEvents(dispatched);
    expect(predicted).toHaveLength(maximumPredictedPointerEvents);
    expect(predicted[0]).toBe(samples.at(-maximumPredictedPointerEvents));
  });

  it("normalizes incompatible and future timestamps to performance time", () => {
    expect(
      pointerEventInputTimestampMs(pointerEvent({ timeStamp: 95 }), 100),
    ).toBe(95);
    expect(
      pointerEventInputTimestampMs(pointerEvent({ timeStamp: 100_000 }), 100),
    ).toBe(100);
    expect(
      pointerEventInputTimestampMs(pointerEvent({ timeStamp: 105 }), 100),
    ).toBe(100);
  });
});
