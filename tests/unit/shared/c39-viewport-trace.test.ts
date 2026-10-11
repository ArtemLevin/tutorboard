import { afterEach, describe, expect, it, vi } from "vitest";

import {
  finishC39ViewportTrace,
  startC39ViewportTrace,
  type C39ViewportTraceEvent,
} from "../../../src/shared/c39-viewport-trace";

afterEach(() => vi.unstubAllGlobals());

describe("C3.9-S6 bounded viewport trace", () => {
  it("does no timing or allocation without an explicit sink", () => {
    vi.stubGlobal("window", {});
    expect(startC39ViewportTrace()).toBeNull();
    finishC39ViewportTrace("viewport-scene-select", null);
  });

  it("records bounded, nonnegative main-thread durations", () => {
    const events: C39ViewportTraceEvent[] = [];
    vi.stubGlobal("window", { __tutorBoardC39ViewportTrace: { events } });
    const started = startC39ViewportTrace();
    expect(started).not.toBeNull();
    finishC39ViewportTrace("viewport-scene-select", started, "reuse-items");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "viewport-scene-select",
      detail: "reuse-items",
    });
    expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("never appends beyond the finite recorder budget", () => {
    const events: C39ViewportTraceEvent[] = Array.from(
      { length: 12_000 },
      () => ({
        kind: "viewport-history",
        startMs: 0,
        durationMs: 0,
      }),
    );
    vi.stubGlobal("window", { __tutorBoardC39ViewportTrace: { events } });
    finishC39ViewportTrace("viewport-history", startC39ViewportTrace());
    expect(events).toHaveLength(12_000);
  });
});
