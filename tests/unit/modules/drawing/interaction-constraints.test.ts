import { describe, expect, it } from "vitest";

import { boardObjectId } from "../../../../src/core/public";
import {
  getDrawingConstraintFeedback,
  getDrawingPreview,
  reduceDrawingInteraction,
  type DrawingInteractionState,
} from "../../../../src/modules/drawing/public";
import { noInputModifiers } from "../../../../src/shared/input-modifiers";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#111827",
  strokeWidth: 2,
} as const;
const shift = { ...noInputModifiers, shift: true };

function start(
  tool:
    | "drawing.line"
    | "drawing.rectangle"
    | "drawing.ellipse"
    | "drawing.polygon",
) {
  return reduceDrawingInteraction(
    { kind: "idle" },
    {
      kind: "start",
      objectId: boardObjectId(`object:${tool}`),
      point: { x: 0, y: 0 },
      pointerId: 1,
      style,
      text: "",
      tool,
    },
  ).state;
}

function move(state: DrawingInteractionState, point: { x: number; y: number }) {
  return reduceDrawingInteraction(state, {
    kind: "move",
    point,
    pointerId: 1,
  }).state;
}

describe("drawing interaction constraints", () => {
  it("recomputes a line when Shift changes without pointer movement", () => {
    const rawPoint = { x: 80, y: 62 };
    const moved = move(start("drawing.line"), rawPoint);
    expect(getDrawingPreview(moved)).toMatchObject({
      end: rawPoint,
      kind: "drawing.line",
    });

    const constrained = reduceDrawingInteraction(moved, {
      kind: "modifiers",
      modifiers: shift,
      pointerId: 1,
    }).state;
    const constrainedPreview = getDrawingPreview(constrained);
    expect(getDrawingConstraintFeedback(constrained)).toEqual({
      angleDegrees: 45,
      kind: "angle",
    });
    expect(constrainedPreview).toMatchObject({
      kind: "drawing.line",
    });
    if (constrainedPreview?.kind !== "drawing.line") {
      throw new Error("Expected constrained line preview.");
    }
    expect(constrainedPreview.end.x).toBeCloseTo(constrainedPreview.end.y, 10);

    const released = reduceDrawingInteraction(constrained, {
      kind: "modifiers",
      modifiers: noInputModifiers,
      pointerId: 1,
    }).state;
    expect(getDrawingConstraintFeedback(released)).toBeNull();
    expect(getDrawingPreview(released)).toMatchObject({
      end: rawPoint,
      kind: "drawing.line",
    });
  });

  it("commits exactly the geometry shown by the Shift preview", () => {
    const rawPoint = { x: 80, y: 62 };
    const constrained = reduceDrawingInteraction(
      move(start("drawing.line"), rawPoint),
      {
        kind: "modifiers",
        modifiers: shift,
        pointerId: 1,
      },
    ).state;
    const preview = getDrawingPreview(constrained);
    const completed = reduceDrawingInteraction(constrained, {
      kind: "finish",
      modifiers: shift,
      point: rawPoint,
      pointerId: 1,
    });

    expect(completed.completedObject).toEqual(preview);
    expect(completed.state).toEqual({ kind: "idle" });
  });

  it("turns a dragged rectangle into a square when Shift is pressed late", () => {
    const constrained = reduceDrawingInteraction(
      move(start("drawing.rectangle"), { x: 80, y: 30 }),
      {
        kind: "modifiers",
        modifiers: shift,
        pointerId: 1,
      },
    ).state;

    expect(getDrawingConstraintFeedback(constrained)).toEqual({
      kind: "square",
    });
    expect(getDrawingPreview(constrained)).toMatchObject({
      kind: "drawing.rectangle",
      size: { height: 80, width: 80 },
    });
  });

  it("turns an ellipse into a circle and a polygon into equal-radius geometry", () => {
    const ellipse = reduceDrawingInteraction(
      move(start("drawing.ellipse"), { x: 40, y: 100 }),
      {
        kind: "modifiers",
        modifiers: shift,
        pointerId: 1,
      },
    ).state;
    expect(getDrawingPreview(ellipse)).toMatchObject({
      kind: "drawing.ellipse",
      radius: { x: 50, y: 50 },
    });

    const polygon = reduceDrawingInteraction(
      move(start("drawing.polygon"), { x: 40, y: 100 }),
      {
        kind: "modifiers",
        modifiers: shift,
        pointerId: 1,
      },
    ).state;
    const polygonPreview = getDrawingPreview(polygon);
    expect(getDrawingConstraintFeedback(polygon)).toEqual({
      kind: "regular-polygon",
    });
    expect(polygonPreview?.kind).toBe("drawing.pen-stroke");
    if (polygonPreview?.kind !== "drawing.pen-stroke") {
      throw new Error("Expected polygon stroke preview.");
    }
    const xs = polygonPreview.points.map(({ x }) => x);
    const ys = polygonPreview.points.map(({ y }) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(80);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(80);
  });
});
