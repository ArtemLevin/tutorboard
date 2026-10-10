import { describe, expect, it } from "vitest";

import {
  correlateC39SlowFrames,
  type C39ChromiumTrace,
} from "../../e2e/c39-frame-attribution";

const gap = { startMs: 110, endMs: 210, durationMs: 100 };

describe("C3.9-B frame-to-trace correlation", () => {
  it("aligns Chrome microseconds to page milliseconds using real trace anchors", () => {
    const chromium: C39ChromiumTrace = {
      anchors: [
        { name: "C39_TRACE_SYNC_START", browserMs: 100, traceUs: 2_100_000 },
        { name: "C39_TRACE_SYNC_END", browserMs: 300, traceUs: 2_300_000 },
      ],
      events: [
        {
          name: "DirectRenderer::DrawFrame",
          category: "viz",
          startTraceUs: 2_130_000,
          durationMs: 26,
          processId: 40,
          threadId: 9,
        },
        {
          name: "LayerTreeHost::DoUpdateLayers",
          category: "cc",
          startTraceUs: 2_250_000,
          durationMs: 36,
          processId: 40,
          threadId: 7,
        },
      ],
      droppedEvents: 0,
    };
    const result = correlateC39SlowFrames(
      [gap],
      [120, 155],
      [{ kind: "wheel-commit", startMs: 140, durationMs: 4, detail: "session=1" }],
      chromium,
    );
    expect(result.traceAlignment).toBe("aligned");
    expect(result.clockDriftMs).toBe(0);
    expect(result.frames[0]?.lastWheelInputMs).toBe(155);
    expect(result.frames[0]?.chromiumEvents.map((event) => event.name)).toEqual([
      "DirectRenderer::DrawFrame",
    ]);
    expect(result.frames[0]?.chromiumEvents[0]?.browserStartMs).toBe(130);
    expect(result.frames[0]?.classification).toBe("coincident-browser");
  });

  it("preserves unavailable instead of reporting absent compositor cost", () => {
    const result = correlateC39SlowFrames(
      [gap],
      [150],
      [{ kind: "wheel-input", startMs: 151, durationMs: 0 }],
      { events: [], anchors: [], droppedEvents: 8 },
    );
    expect(result.traceAlignment).toBe("unavailable");
    expect(result.frames[0]?.compositorEvidence).toBe("unavailable");
    expect(result.frames[0]?.classification).toBe("unattributed");
    expect(result.chromiumEventsDropped).toBe(8);
  });

  it("rejects drifted clock anchors and maps isolated wheel callbacks", () => {
    const result = correlateC39SlowFrames(
      [gap],
      [150],
      [{ kind: "konva-scene", startMs: 180, durationMs: 35 }],
      {
        events: [],
        anchors: [
          { name: "C39_TRACE_SYNC_START", browserMs: 100, traceUs: 100_000 },
          { name: "C39_TRACE_SYNC_END", browserMs: 300, traceUs: 250_000 },
        ],
        droppedEvents: 0,
      },
    );
    expect(result.traceAlignment).toBe("unavailable");
    expect(result.clockDriftMs).toBe(50);
    expect(result.frames[0]?.classification).toBe("coincident-js");
  });

  it("lists the slowest five gaps without double counting overlapping thread durations", () => {
    const gaps = Array.from({ length: 7 }, (_, i) => ({
      startMs: i * 200,
      endMs: i * 200 + 60 + i * 10,
      durationMs: 60 + i * 10,
    }));
    const result = correlateC39SlowFrames(gaps, [], [], null);
    expect(result.frames).toHaveLength(5);
    expect(result.frames[0]?.gapMs).toBe(120);
    expect(result.frames[4]?.gapMs).toBe(80);
    expect(result.frames[0]?.lastWheelInputMs).toBeNull();
  });
});
