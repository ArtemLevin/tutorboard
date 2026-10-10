import { describe, expect, it } from "vitest";

import { partitionC39PersistFrames } from "../../../e2e/c39-frame-attribution";

describe("C3.9 persistence attribution", () => {
  it("isolates intermediate persist without dropping mixed frames", () => {
    const gaps = [
      { startMs: 100, endMs: 116, durationMs: 16 },
      { startMs: 116, endMs: 260, durationMs: 144 },
      { startMs: 260, endMs: 276, durationMs: 16 },
      { startMs: 276, endMs: 450, durationMs: 174 },
    ];
    const events = [
      { kind: "wheel-viewport-persist", startMs: 180, durationMs: 70 },
      { kind: "wheel-viewport-persist", startMs: 410, durationMs: 20 },
    ];
    const result = partitionC39PersistFrames(gaps, [110, 276], events);
    expect(result.intermediatePersistCount).toBe(1);
    expect(result.finalPersistCount).toBe(1);
    expect(result.activeWithoutPersist).toEqual([gaps[0], gaps[2]]);
    expect(result.activeWithPersist).toEqual([gaps[1]]);
  });

  it("handles empty inputs and absent persistence", () => {
    const gaps = [{ startMs: 0, endMs: 16, durationMs: 16 }];
    expect(partitionC39PersistFrames(gaps, [], [])).toEqual({
      activeWithoutPersist: [],
      activeWithPersist: [],
      intermediatePersistCount: 0,
      finalPersistCount: 0,
    });
    expect(
      partitionC39PersistFrames(gaps, [4, 20], []).activeWithoutPersist,
    ).toEqual(gaps);
  });
});
