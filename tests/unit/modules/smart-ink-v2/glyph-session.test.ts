import { describe, expect, it } from "vitest";

import {
  appendSmartInkGlyphSession,
  expireSmartInkGlyphSession,
  flushSmartInkGlyphSession,
  initialSmartInkGlyphSession,
} from "../../../../src/modules/smart-ink/public";

const vertical = {
  endedAtMs: 100,
  id: "stem",
  points: [
    { x: 10, y: 20 },
    { x: 10, y: 80 },
  ],
};

describe("Smart Ink glyph stroke grouping", () => {
  it("buffers related strokes without losing the earlier source", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    const second = appendSmartInkGlyphSession(first.session, {
      endedAtMs: 320,
      id: "crossbar",
      points: [
        { x: 0, y: 35 },
        { x: 30, y: 35 },
      ],
    });
    expect(first.finalized).toHaveLength(0);
    expect(second.finalized).toHaveLength(0);
    expect(second.session.pending.map(({ id }) => id)).toEqual([
      "stem",
      "crossbar",
    ]);
  });

  it("joins delayed detached dots with the original stem", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    const second = appendSmartInkGlyphSession(first.session, {
      endedAtMs: 810,
      id: "dot",
      points: [{ x: 10, y: 0 }],
    });
    expect(second.session.pending).toHaveLength(2);
  });

  it("finalizes before starting a distant independent character", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    const next = appendSmartInkGlyphSession(first.session, {
      endedAtMs: 200,
      id: "other",
      points: [
        { x: 300, y: 20 },
        { x: 300, y: 80 },
      ],
    });
    expect(next.finalized[0]?.map(({ id }) => id)).toEqual(["stem"]);
    expect(next.session.pending.map(({ id }) => id)).toEqual(["other"]);
  });

  it("finalizes a pending stroke after the inactivity boundary", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    expect(expireSmartInkGlyphSession(first.session, 999).finalized).toEqual(
      [],
    );
    const expired = expireSmartInkGlyphSession(first.session, 1000);
    expect(expired.finalized[0]?.map(({ id }) => id)).toEqual(["stem"]);
    expect(expired.session.pending).toHaveLength(0);
  });

  it("keeps both groups when a new stroke arrives too late", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    const next = appendSmartInkGlyphSession(first.session, {
      endedAtMs: 1300,
      id: "late",
      points: [{ x: 10, y: 8 }],
    });
    expect(next.finalized[0]?.map(({ id }) => id)).toEqual(["stem"]);
    expect(flushSmartInkGlyphSession(next.session).finalized[0]?.map(({ id }) => id)).toEqual(["late"]);
  });

  it("finalizes a bounded group before accepting additional strokes", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
      {
        maximumGapMs: 900,
        maximumPointsPerGroup: 3,
        maximumPointsPerStroke: 3,
        maximumStrokesPerGroup: 1,
        minimumSpatialGap: 8,
        spatialGapFactor: 0.65,
      },
    );
    const next = appendSmartInkGlyphSession(
      first.session,
      {
        endedAtMs: 200,
        id: "next",
        points: [{ x: 11, y: 40 }],
      },
      {
        maximumGapMs: 900,
        maximumPointsPerGroup: 3,
        maximumPointsPerStroke: 3,
        maximumStrokesPerGroup: 1,
        minimumSpatialGap: 8,
        spatialGapFactor: 0.65,
      },
    );
    expect(next.finalized[0]?.map(({ id }) => id)).toEqual(["stem"]);
    expect(next.session.pending.map(({ id }) => id)).toEqual(["next"]);
  });

  it("protects stored strokes against mutation of input points", () => {
    const points = [{ x: 5, y: 5 }];
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      { endedAtMs: 100, id: "mutable", points },
    );
    points[0]!.x = 900;
    expect(first.session.pending[0]?.points[0]?.x).toBe(5);
  });

  it("rejects malformed input, duplicated IDs and backwards timestamps", () => {
    const first = appendSmartInkGlyphSession(
      initialSmartInkGlyphSession,
      vertical,
    );
    expect(() =>
      appendSmartInkGlyphSession(first.session, vertical),
    ).toThrow("Duplicate");
    expect(() =>
      appendSmartInkGlyphSession(first.session, {
        ...vertical,
        endedAtMs: 99,
        id: "old",
      }),
    ).toThrow("monotonic");
    expect(() =>
      appendSmartInkGlyphSession(first.session, {
        ...vertical,
        id: "invalid",
        points: [{ x: Number.NaN, y: 2 }],
      }),
    ).toThrow("Invalid");
  });
});
