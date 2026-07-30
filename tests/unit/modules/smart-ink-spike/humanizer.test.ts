import { describe, expect, it } from "vitest";

import {
  humanizeSmartInkPrimitive,
  recognizeSmartInkStroke,
  smartInkPrimitiveKinds,
} from "../../../../src/modules/smart-ink-spike/public";

describe("Phase 9 Smart Ink deterministic humanizer", () => {
  it("generates finite, repeatable approximations of every primitive", () => {
    for (const [index, kind] of smartInkPrimitiveKinds.entries()) {
      const first = humanizeSmartInkPrimitive(kind, {
        pointCount: 112,
        seed: 7_000 + index,
      });
      const repeated = humanizeSmartInkPrimitive(kind, {
        pointCount: 112,
        seed: 7_000 + index,
      });

      expect(first).toEqual(repeated);
      expect(first).toHaveLength(112);
      expect(
        first.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
      ).toBe(true);
    }
  });

  it("keeps intended classes in the recognizer top two across varied seeds", () => {
    for (const kind of smartInkPrimitiveKinds) {
      let topTwoMatches = 0;
      for (let variant = 0; variant < 8; variant += 1) {
        const points = humanizeSmartInkPrimitive(kind, {
          seed: 30_000 + variant * 97 + kind.length,
        });
        const proposal = recognizeSmartInkStroke(
          `humanized-${kind}-${variant}`,
          points,
        );
        const proposedKinds = proposal.candidates
          .slice(0, 2)
          .map((candidate) => candidate.kind);

        if (
          proposal.status !== "unrecognized" &&
          proposedKinds.includes(kind)
        ) {
          topTwoMatches += 1;
        }
      }
      expect(
        topTwoMatches,
        `${kind} humanized top-two matches`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("rejects unbounded or non-deterministic options", () => {
    expect(() =>
      humanizeSmartInkPrimitive("circle", {
        pointCount: Number.POSITIVE_INFINITY,
        seed: 1,
      }),
    ).toThrow("pointCount");
    expect(() =>
      humanizeSmartInkPrimitive("circle", {
        seed: Number.NaN,
      }),
    ).toThrow("seed");
    expect(() =>
      humanizeSmartInkPrimitive("rectangle", {
        seed: 1,
        width: 0,
      }),
    ).toThrow("width");
  });
});
