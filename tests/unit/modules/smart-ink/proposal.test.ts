import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  type PenStrokeObject,
} from "../../../../src/core/public";
import {
  createSmartInkReplacementObject,
  proposeSmartInkReplacement,
} from "../../../../src/modules/smart-ink/public";
import { type SmartInkCandidate } from "../../../../src/modules/smart-ink-spike/public";
import { positiveStrokes } from "../smart-ink-spike/corpus-fixtures";

function stroke(points = positiveStrokes.circle): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:smart-ink"),
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
      stroke: "#245d6b",
      strokeWidth: 3,
    },
    visible: true,
  };
}

function candidate(geometry: SmartInkCandidate["geometry"]): SmartInkCandidate {
  return {
    confidence: 0.9,
    diagnostics: {},
    fitError: 0.1,
    geometry,
    kind: geometry.kind,
  };
}

describe("Smart Ink board proposal", () => {
  it("turns a recognized rough circle into a styled board preview", () => {
    const result = proposeSmartInkReplacement(stroke());

    expect(result.status).toBe("proposed");
    if (result.status === "proposed") {
      expect(result.proposal.label).toBe("Окружность");
      expect(result.proposal.replacement).toMatchObject({
        id: "object:smart-ink",
        kind: "drawing.ellipse",
      });
      expect(result.proposal.preview.style).toMatchObject({
        fill: null,
        stroke: "#0f8a75",
        strokeWidth: 4,
      });
      expect(result.proposal.original.kind).toBe("drawing.pen-stroke");
    }
  });

  it("accepts a wider near-circle range as a circle", () => {
    const points = Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return {
        x: Math.cos(angle) * 62,
        y: Math.sin(angle) * 46,
      };
    });
    const result = proposeSmartInkReplacement(stroke(points));

    expect(result.status).toBe("proposed");
    if (result.status === "proposed") {
      expect(result.proposal.candidate.kind).toBe("circle");
      expect(result.proposal.replacement).toMatchObject({
        kind: "drawing.ellipse",
      });
      if (result.proposal.replacement.kind === "drawing.ellipse") {
        expect(result.proposal.replacement.radius.x).toBe(
          result.proposal.replacement.radius.y,
        );
      }
    }
  });

  it("maps every recognizer geometry to a BoardDocument 1.0 object", () => {
    const source = stroke();
    const cases: readonly SmartInkCandidate[] = [
      candidate({
        end: { x: 90, y: 40 },
        kind: "line",
        start: { x: 10, y: 20 },
      }),
      candidate({
        center: { x: 50, y: 50 },
        kind: "circle",
        radius: 30,
      }),
      candidate({
        center: { x: 50, y: 50 },
        kind: "ellipse",
        radius: { x: 45, y: 25 },
        rotation: Math.PI / 6,
      }),
      candidate({
        kind: "rectangle",
        vertices: [
          { x: 10, y: 20 },
          { x: 90, y: 20 },
          { x: 90, y: 60 },
          { x: 10, y: 60 },
        ],
      }),
      candidate({
        kind: "square",
        vertices: [
          { x: 10, y: 10 },
          { x: 60, y: 10 },
          { x: 60, y: 60 },
          { x: 10, y: 60 },
        ],
      }),
      candidate({
        kind: "triangle",
        vertices: [
          { x: 50, y: 10 },
          { x: 90, y: 80 },
          { x: 10, y: 80 },
        ],
      }),
    ];

    expect(
      cases.map((item) => createSmartInkReplacementObject(source, item)?.kind),
    ).toEqual([
      "drawing.line",
      "drawing.ellipse",
      "drawing.ellipse",
      "drawing.rectangle",
      "drawing.rectangle",
      "drawing.pen-stroke",
    ]);
    const triangle = createSmartInkReplacementObject(source, cases[5]!);
    expect(
      triangle?.kind === "drawing.pen-stroke"
        ? triangle.points.at(-1)
        : undefined,
    ).toEqual({ x: 0, y: 0 });
  });
});
