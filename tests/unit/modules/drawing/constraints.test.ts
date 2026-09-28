import { describe, expect, it } from "vitest";

import { resolveDrawingConstraint } from "../../../../src/modules/drawing/constraints";
import { noInputModifiers } from "../../../../src/shared/input-modifiers";

const shift = { ...noInputModifiers, shift: true };

describe("drawing constraints", () => {
  it("snaps line angles to 15 degree increments while preserving length", () => {
    const start = { x: 10, y: 20 };
    const raw = {
      x: start.x + Math.cos((38 * Math.PI) / 180) * 100,
      y: start.y + Math.sin((38 * Math.PI) / 180) * 100,
    };
    const resolved = resolveDrawingConstraint({
      current: raw,
      modifiers: shift,
      start,
      tool: "drawing.line",
    });

    expect(resolved.feedback).toMatchObject({
      angleDegrees: 45,
      kind: "angle",
    });
    expect(
      Math.hypot(resolved.point.x - start.x, resolved.point.y - start.y),
    ).toBeCloseTo(100, 8);
    expect(
      Math.atan2(resolved.point.y - start.y, resolved.point.x - start.x),
    ).toBeCloseTo(Math.PI / 4, 8);
  });

  it.each([
    ["drawing.rectangle", "square"],
    ["drawing.ellipse", "circle"],
    ["drawing.polygon", "regular-polygon"],
  ] as const)(
    "constrains %s to equal axes in every drag quadrant",
    (tool, kind) => {
      for (const current of [
        { x: 30, y: 80 },
        { x: -30, y: 80 },
        { x: 30, y: -80 },
        { x: -30, y: -80 },
      ]) {
        const resolved = resolveDrawingConstraint({
          current,
          modifiers: shift,
          start: { x: 0, y: 0 },
          tool,
        });
        expect(Math.abs(resolved.point.x)).toBe(Math.abs(resolved.point.y));
        expect(resolved.feedback?.kind).toBe(kind);
      }
    },
  );

  it("returns raw geometry immediately when Shift is released", () => {
    const raw = { x: 41, y: 17 };
    expect(
      resolveDrawingConstraint({
        current: raw,
        modifiers: noInputModifiers,
        start: { x: 0, y: 0 },
        tool: "drawing.rectangle",
      }),
    ).toEqual({ feedback: null, point: raw });
  });
});
