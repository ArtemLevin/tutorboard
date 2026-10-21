import { describe, expect, it } from "vitest";

import {
  clampSolid3DWindowRect,
  initialSolid3DWindowRect,
} from "./solid-3d-window-geometry";

describe("embedded 3D window bounds", () => {
  it("starts in the upper-right without covering the whole workspace", () => {
    expect(initialSolid3DWindowRect({ width: 1280, height: 820 })).toEqual({
      left: 384,
      top: 16,
      width: 880,
      height: 620,
    });
    expect(
      initialSolid3DWindowRect({ width: 1280, height: 820 }, true),
    ).toEqual({
      left: 144,
      top: 16,
      width: 1120,
      height: 620,
    });
  });

  it("clamps position, resize and minimum dimensions", () => {
    expect(
      clampSolid3DWindowRect(
        { left: -1000, top: 2000, width: 120, height: 1000 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      left: 16,
      top: 16,
      width: 380,
      height: 568,
    });
    expect(
      clampSolid3DWindowRect(
        { left: 800, top: 600, width: 500, height: 340 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      left: 284,
      top: 244,
      width: 500,
      height: 340,
    });
  });

  it("clamps an open window when the workspace shrinks", () => {
    expect(
      clampSolid3DWindowRect(
        { left: 654, top: 110, width: 610, height: 620 },
        { width: 450, height: 390 },
      ),
    ).toEqual({
      left: 16,
      top: 16,
      width: 418,
      height: 358,
    });
  });
});
