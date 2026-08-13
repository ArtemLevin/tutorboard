import { describe, expect, it } from "vitest";

import type { Vec2 } from "../../../../src/core/public";
import {
  proposeSmartInkReplacement,
  recognizeSmartInkArrow,
} from "../../../../src/modules/smart-ink/public";
import { boardObjectId } from "../../../../src/core/public";

function trace(vertices: readonly Vec2[]): readonly Vec2[] {
  return vertices.slice(0, -1).flatMap((start, edge) => {
    const end = vertices[edge + 1]!;
    return Array.from({ length: 18 }, (_, index) => {
      const progress = index / 18;
      return {
        x: start.x + (end.x - start.x) * progress,
        y:
          start.y +
          (end.y - start.y) * progress +
          Math.sin((edge * 18 + index) * 1.7) * 0.45,
      };
    });
  });
}

const arrow = trace([
  { x: 20, y: 80 },
  { x: 260, y: 80 },
  { x: 205, y: 35 },
  { x: 260, y: 80 },
  { x: 205, y: 125 },
]);

const continuousArrow = trace([
  { x: 20, y: 80 },
  { x: 260, y: 80 },
  { x: 202, y: 32 },
  { x: 210, y: 126 },
]);

const mildlyCurvedArrow = trace([
  { x: 20, y: 80 },
  { x: 130, y: 70 },
  { x: 260, y: 80 },
  { x: 205, y: 35 },
  { x: 260, y: 80 },
  { x: 215, y: 125 },
]);

const nonArrows: readonly { readonly points: readonly Vec2[] }[] = [
  {
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
  },
  {
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
      { x: 200, y: 0 },
    ],
  },
  {
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 90 },
      { x: 0, y: 90 },
      { x: 0, y: 0 },
    ],
  },
];

describe("extended Smart Ink arrow recognizer", () => {
  it("recognizes both drawing directions deterministically", () => {
    const forward = recognizeSmartInkArrow(arrow);
    const reverse = recognizeSmartInkArrow([...arrow].reverse());

    expect(forward.status).toBe("recognized");
    expect(forward.candidate?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(reverse.status).toBe("recognized");
    expect(recognizeSmartInkArrow(arrow)).toEqual(forward);
  });

  it("recognizes a continuous arrowhead without returning to the tip", () => {
    const result = recognizeSmartInkArrow(continuousArrow);

    expect(result.status).toBe("recognized");
    expect(result.candidate?.diagnostics.continuousTopology).toBe(1);
  });

  it("tolerates a mildly curved shaft and asymmetric wings", () => {
    expect(recognizeSmartInkArrow(mildlyCurvedArrow).status).toBe("recognized");
  });

  it.each(nonArrows)("rejects a non-arrow trace", ({ points }) => {
    expect(recognizeSmartInkArrow(points).status).toBe("unrecognized");
  });

  it("autocompletes the arrow through the board proposal pipeline", () => {
    const result = proposeSmartInkReplacement({
      groupId: null,
      id: boardObjectId("object:arrow"),
      kind: "drawing.pen-stroke",
      locked: false,
      points: arrow,
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: null,
        opacity: 1,
        stroke: "#245d6b",
        strokeWidth: 3,
      },
      visible: true,
    });

    expect(result.status).toBe("proposed");
    if (result.status === "proposed") {
      expect(result.proposal.label).toBe("Стрелка");
      expect(result.proposal.candidate.kind).toBe("arrow");
      expect(result.proposal.arrowRecognizer?.recognizerVersion).toBe(
        "tutorboard.smart-ink-arrow/1.1",
      );
      expect(result.proposal.replacement.kind).toBe("drawing.pen-stroke");
    }
  });
});
