import { describe, expect, it } from "vitest";

import { resolveDrawingConstraint } from "../../../../src/modules/drawing/constraints";
import { noInputModifiers } from "../../../../src/shared/input-modifiers";

const shift = { ...noInputModifiers, shift: true };

describe("drawing constraints", () => {
  it("keeps the raw pointer position without Shift", () => {
    expect(
      resolveDrawingConstraint(
        "drawing.line",
        { x: 10, y: 20 },
        { x: 37, y: 58 },
        noInputModifiers,
      ),
    ).toEqual({
      feedback: null,
      point: { x: 37, y: 58 },
    });
  });

  it("snaps lines to 15 degree increments while preserving length", () => {
    const start = { x: 5, y: -3 };
    const angle = (38 * Math.PI) / 180;
    const distance = 120;
    const current = {
      x: start.x + Math.cos(angle) * distance,
      y: start.y + Math.sin(angle) * distance,
    };
    const result = resolveDrawingConstraint(
      "drawing.line",
      start,
      current,
      shift,
    );

    expect(result.feedback).toEqual({
      angleDegrees: 45,
      kind: "angle",
    });
    expect(
      Math.hypot(result.point.x - start.x, result.point.y - start.y),
    ).toBeCloseTo(distance, 10);
    expect(
      (Math.atan2(result.point.y - start.y, result.point.x - start.x) * 180) /
        Math.PI,
    ).toBeCloseTo(45, 10);
  });

  it("uses angular hysteresis around the current snapped direction", () => {
    const start = { x: 0, y: 0 };
    const pointAt = (angleDegrees: number) => {
      const angle = (angleDegrees * Math.PI) / 180;
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
    };
    const previous = { angleDegrees: 30, kind: "angle" } as const;

    expect(
      resolveDrawingConstraint(
        "drawing.line",
        start,
        pointAt(21),
        shift,
        previous,
      ).feedback,
    ).toEqual(previous);
    expect(
      resolveDrawingConstraint(
        "drawing.line",
        start,
        pointAt(20),
        shift,
        previous,
      ).feedback,
    ).toEqual({ angleDegrees: 15, kind: "angle" });
  });

  it.each([
    [{ x: 4, y: 2 }, { x: 4, y: 4 }],
    [{ x: -4, y: 2 }, { x: -4, y: 4 }],
    [{ x: 4, y: -2 }, { x: 4, y: -4 }],
    [{ x: -4, y: -2 }, { x: -4, y: -4 }],
  ])(
    "constrains rectangles to squares in every quadrant",
    (current, point) => {
      expect(
        resolveDrawingConstraint(
          "drawing.rectangle",
          { x: 0, y: 0 },
          current,
          shift,
        ),
      ).toEqual({
        feedback: { kind: "square" },
        point,
      });
    },
  );

  it("uses a square bounding box for Shift ellipses and polygons", () => {
    expect(
      resolveDrawingConstraint(
        "drawing.ellipse",
        { x: 10, y: 10 },
        { x: 30, y: 50 },
        shift,
      ),
    ).toEqual({
      feedback: { kind: "circle" },
      point: { x: 50, y: 50 },
    });
    expect(
      resolveDrawingConstraint(
        "drawing.polygon",
        { x: 10, y: 10 },
        { x: 30, y: 50 },
        shift,
      ),
    ).toEqual({
      feedback: { kind: "regular-polygon" },
      point: { x: 50, y: 50 },
    });
  });

  it("returns to raw geometry immediately when Shift is released", () => {
    const start = { x: 0, y: 0 };
    const current = { x: 80, y: 31 };
    const constrained = resolveDrawingConstraint(
      "drawing.line",
      start,
      current,
      shift,
    );
    expect(constrained.feedback).not.toBeNull();

    expect(
      resolveDrawingConstraint(
        "drawing.line",
        start,
        current,
        noInputModifiers,
        constrained.feedback,
      ),
    ).toEqual({
      feedback: null,
      point: current,
    });
  });
});
