import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createVectorInkDataFromPoints,
  vectorInkDataMatchesPoints,
  type PenStrokeObject,
} from "../../core/public";
import type { SmartInkCandidate } from "../smart-ink-spike/public";

import { createSmartInkReplacementObject } from "./proposal";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#202020",
  strokeWidth: 4,
} as const;

function sourceStroke(): PenStrokeObject {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ];
  return {
    groupId: null,
    id: boardObjectId("smart-ink-triangle"),
    ink: createVectorInkDataFromPoints(points),
    kind: "drawing.pen-stroke",
    locked: false,
    points,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style,
    visible: true,
  };
}

describe("Smart Ink replacement geometry", () => {
  it("renders a recognized triangle with three straight sides", () => {
    const vertices = [
      { x: 20, y: 15 },
      { x: 140, y: 15 },
      { x: 75, y: 110 },
    ];
    const candidate: SmartInkCandidate = {
      confidence: 0.96,
      diagnostics: {},
      fitError: 0.01,
      geometry: { kind: "triangle", vertices },
      kind: "triangle",
    };

    const replacement = createSmartInkReplacementObject(
      sourceStroke(),
      candidate,
    );
    expect(replacement?.kind).toBe("drawing.pen-stroke");
    if (replacement?.kind !== "drawing.pen-stroke") return;
    expect(replacement.points).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 55, y: 95 },
      { x: 0, y: 0 },
    ]);
    expect(replacement.ink?.closed).toBe(true);
    expect(replacement.ink?.centerline).toHaveLength(3);
    expect(
      replacement.ink === undefined
        ? false
        : vectorInkDataMatchesPoints(replacement.ink, replacement.points),
    ).toBe(true);

    for (const segment of replacement.ink?.centerline ?? []) {
      const side = {
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y,
      };
      for (const control of [segment.control1, segment.control2]) {
        const offset = {
          x: control.x - segment.start.x,
          y: control.y - segment.start.y,
        };
        expect(side.x * offset.y - side.y * offset.x).toBeCloseTo(0);
      }
    }
  });
});
