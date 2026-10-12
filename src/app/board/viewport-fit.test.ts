import { describe, expect, it } from "vitest";

import { fitBoardViewport } from "./viewport-fit";

describe("fitBoardViewport", () => {
  it("centers the full bounds with padding and respects zoom limits", () => {
    expect(
      fitBoardViewport(
        { x: 0, y: 0, width: 100, height: 50 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      zoom: 7.04,
      offset: { x: 48, y: 124 },
    });
    expect(
      fitBoardViewport(
        { x: -500, y: -500, width: 1000, height: 1000 },
        { width: 320, height: 240 },
      )?.zoom,
    ).toBeCloseTo(0.16);
    expect(
      fitBoardViewport(
        { x: 0, y: 0, width: 10_000, height: 10_000 },
        { width: 800, height: 600 },
      )?.zoom,
    ).toBe(0.1);
  });

  it("rejects empty or invalid viewports without writing document state", () => {
    expect(fitBoardViewport(null, { width: 800, height: 600 })).toBeNull();
    expect(
      fitBoardViewport(
        { x: 0, y: 0, width: 10, height: -1 },
        { width: 800, height: 600 },
      ),
    ).toBeNull();
    expect(
      fitBoardViewport(
        { x: Infinity, y: 0, width: 10, height: 10 },
        { width: 800, height: 600 },
      ),
    ).toBeNull();
    expect(
      fitBoardViewport(
        { x: 0, y: 0, width: 10, height: 10 },
        { width: 0, height: 600 },
      ),
    ).toBeNull();
  });
});
