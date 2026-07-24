import { describe, expect, it } from "vitest";

import { screenToWorld } from "../../../../src/core/public";
import { elementPoint } from "../../../../src/adapters/canvas-konva/pointer";

describe("canvas pointer normalization", () => {
  it("converts client coordinates to canvas CSS pixels before world space", () => {
    const screenPoint = elementPoint(
      { clientX: 350, clientY: 260 },
      {
        getBoundingClientRect: () =>
          ({
            left: 50,
            top: 60,
          }) as DOMRect,
      },
    );

    expect(screenPoint).toEqual({ x: 300, y: 200 });
    expect(
      screenToWorld(screenPoint, {
        offset: { x: 100, y: 50 },
        zoom: 2,
      }),
    ).toEqual({ x: 100, y: 75 });
  });
});
