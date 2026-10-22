import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createVectorInkDataFromPoints,
  type PenStrokeObject,
  type Vec2,
} from "../../../../src/core/public";
import {
  recognizeSmartInkV2,
  resolveSmartInkUnifiedDecision,
} from "../../../../src/modules/smart-ink/public";

function stroke(points: readonly Vec2[]): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:unified"),
    ink: createVectorInkDataFromPoints(points),
    kind: "drawing.pen-stroke",
    locked: false,
    points,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#202020",
      strokeWidth: 3,
    },
    visible: true,
  };
}

const circle = Array.from({ length: 96 }, (_, index) => ({
  x: 100 + 60 * Math.cos((index / 95) * 2 * Math.PI),
  y: 100 + 60 * Math.sin((index / 95) * 2 * Math.PI),
}));
const geometry = recognizeSmartInkV2(stroke(circle), circle);

describe("Smart Ink unified arbitration", () => {
  it("preserves the existing geometry decision when glyph recognition is disabled", () => {
    const unified = resolveSmartInkUnifiedDecision(geometry, {
      status: "disabled",
    });
    expect(geometry.status).toBe("accepted");
    expect(unified).toMatchObject({
      candidate: { kind: "shape", shape: "circle" },
      status: "accepted",
    });
  });

  it("defers geometry while glyph recognition is pending", () => {
    const unified = resolveSmartInkUnifiedDecision(geometry, {
      status: "pending",
    });
    expect(unified.status).toBe("pending");
    expect(unified.candidate).toBeNull();
  });

  it("abstains on a circle versus letter O conflict", () => {
    const unified = resolveSmartInkUnifiedDecision(geometry, {
      candidates: [
        {
          kind: "glyph",
          probability: 0.98,
          script: "Latn",
          text: "O",
        },
      ],
      status: "ready",
    });
    expect(unified.status).toBe("ambiguous");
    expect(unified.candidate).toBeNull();
  });

  it("accepts a calibrated Greek glyph when geometry abstains", () => {
    const unified = resolveSmartInkUnifiedDecision(
      {
        ...geometry,
        candidate: null,
        selectedKind: "ordinary-ink",
        status: "ordinary-ink",
      },
      {
        candidates: [
          { kind: "glyph", probability: 0.97, script: "Grek", text: "α" },
        ],
        status: "ready",
      },
    );
    expect(unified).toMatchObject({
      candidate: { kind: "glyph", text: "α" },
      status: "accepted",
    });
  });

  it("preserves ambiguities across the Cyrillic and Latin alphabets", () => {
    const unified = resolveSmartInkUnifiedDecision(
      {
        ...geometry,
        candidate: null,
        selectedKind: "ordinary-ink",
        status: "ordinary-ink",
      },
      {
        candidates: [
          { kind: "glyph", probability: 0.97, script: "Latn", text: "a" },
          { kind: "glyph", probability: 0.96, script: "Cyrl", text: "а" },
        ],
        status: "ready",
      },
    );
    expect(unified.status).toBe("ambiguous");
    expect(unified.alternatives).toHaveLength(2);
  });

  it("rejects unsupported, malformed and uncalibrated symbol candidates", () => {
    const unified = resolveSmartInkUnifiedDecision(
      {
        ...geometry,
        candidate: null,
        selectedKind: "ordinary-ink",
        status: "ordinary-ink",
      },
      {
        candidates: [
          { kind: "glyph", probability: Number.NaN, script: "Latn", text: "a" },
          { kind: "glyph", probability: 0.99, script: "Latn", text: "а" },
          { kind: "glyph", probability: 0.99, script: "Cyrl", text: "<" },
          { kind: "glyph", probability: 0.99, script: "Grek", text: "αβ" },
        ],
        status: "ready",
      },
    );
    expect(unified.status).toBe("ordinary-ink");
    expect(unified.alternatives).toHaveLength(0);
  });

  it("retains source ink for low confidence digits", () => {
    const unified = resolveSmartInkUnifiedDecision(
      {
        ...geometry,
        candidate: null,
        selectedKind: "ordinary-ink",
        status: "ordinary-ink",
      },
      {
        candidates: [
          { kind: "glyph", probability: 0.42, script: "Zyyy", text: "7" },
        ],
        status: "ready",
      },
    );
    expect(unified.status).toBe("ordinary-ink");
    expect(unified.candidate).toBeNull();
  });
});
