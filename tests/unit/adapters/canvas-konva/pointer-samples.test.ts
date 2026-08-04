import { describe, expect, it } from "vitest";

import {
  collectCoalescedPointerEvents,
  maximumCoalescedPointerEvents,
} from "../../../../src/adapters/canvas-konva/public";

interface PointerEventFixture {
  readonly clientX: number;
  readonly clientY: number;
  readonly getCoalescedEvents?: () => readonly PointerEvent[];
  readonly pointerId: number;
  readonly pressure: number;
  readonly timeStamp: number;
}

function pointerEvent(
  overrides: Partial<PointerEventFixture> = {},
): PointerEvent {
  return {
    clientX: overrides.clientX ?? 10,
    clientY: overrides.clientY ?? 20,
    ...(overrides.getCoalescedEvents === undefined
      ? {}
      : { getCoalescedEvents: overrides.getCoalescedEvents }),
    pointerId: overrides.pointerId ?? 7,
    pressure: overrides.pressure ?? 0.5,
    timeStamp: overrides.timeStamp ?? 100,
  } as unknown as PointerEvent;
}

describe("coalesced pointer samples", () => {
  it("falls back to the dispatched event when the API is unavailable", () => {
    const dispatched = pointerEvent();
    expect(collectCoalescedPointerEvents(dispatched)).toEqual([dispatched]);
  });

  it("falls back when the browser returns an empty batch or throws", () => {
    const empty = pointerEvent({ getCoalescedEvents: () => [] });
    const throwing = pointerEvent({
      getCoalescedEvents: () => {
        throw new Error("unsupported");
      },
    });
    expect(collectCoalescedPointerEvents(empty)).toEqual([empty]);
    expect(collectCoalescedPointerEvents(throwing)).toEqual([throwing]);
  });

  it("retains ordered hardware samples and appends the dispatched endpoint", () => {
    const first = pointerEvent({ clientX: 11, timeStamp: 101 });
    const second = pointerEvent({ clientX: 14, timeStamp: 102 });
    const dispatched = pointerEvent({
      clientX: 18,
      getCoalescedEvents: () => [first, second],
      timeStamp: 103,
    });
    expect(collectCoalescedPointerEvents(dispatched)).toEqual([
      first,
      second,
      dispatched,
    ]);
  });

  it("deduplicates the endpoint and ignores samples from another pointer", () => {
    const foreign = pointerEvent({ pointerId: 99, timeStamp: 101 });
    const endpoint = pointerEvent({ clientX: 18, timeStamp: 103 });
    const dispatched = {
      ...endpoint,
      getCoalescedEvents: () => [foreign, endpoint],
    };
    expect(collectCoalescedPointerEvents(dispatched)).toEqual([endpoint]);
  });

  it("bounds unexpectedly large browser batches", () => {
    const samples = Array.from(
      { length: maximumCoalescedPointerEvents + 50 },
      (_value, index) => pointerEvent({ clientX: index, timeStamp: index + 1 }),
    );
    const dispatched = pointerEvent({
      clientX: 10_000,
      getCoalescedEvents: () => samples,
      timeStamp: 20_000,
    });
    const collected = collectCoalescedPointerEvents(dispatched);
    expect(collected).toHaveLength(maximumCoalescedPointerEvents);
    expect(collected.at(-1)).toBe(dispatched);
    expect(collected[0]).toBe(samples.at(-maximumCoalescedPointerEvents + 1));
  });
});
