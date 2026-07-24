import { describe, expect, it } from "vitest";

import {
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAt,
  type ViewportState,
} from "../../../src/core/public";

const viewport: ViewportState = {
  offset: { x: 140, y: -60 },
  zoom: 2.5,
};

describe("viewport coordinates", () => {
  it.each([
    { x: 0, y: 0 },
    { x: -1_000, y: 700 },
    { x: 42.25, y: -19.75 },
  ])("round-trips world point $x,$y", (worldPoint) => {
    const restored = screenToWorld(
      worldToScreen(worldPoint, viewport),
      viewport,
    );

    expect(restored.x).toBeCloseTo(worldPoint.x, 12);
    expect(restored.y).toBeCloseTo(worldPoint.y, 12);
  });

  it("keeps the anchored world point under the cursor while zooming", () => {
    const anchor = { x: 320, y: 240 };
    const worldBefore = screenToWorld(anchor, viewport);
    const zoomed = zoomViewportAt(viewport, anchor, 6.5, {
      minimum: 0.1,
      maximum: 8,
    });

    expect(screenToWorld(anchor, zoomed).x).toBeCloseTo(worldBefore.x, 12);
    expect(screenToWorld(anchor, zoomed).y).toBeCloseTo(worldBefore.y, 12);
  });

  it("returns to the original viewport after reciprocal zoom", () => {
    const anchor = { x: 127, y: 391 };
    const zoomed = zoomViewportAt(viewport, anchor, viewport.zoom * 1.8, {
      minimum: 0.1,
      maximum: 8,
    });
    const restored = zoomViewportAt(zoomed, anchor, viewport.zoom, {
      minimum: 0.1,
      maximum: 8,
    });

    expect(restored.zoom).toBeCloseTo(viewport.zoom, 12);
    expect(restored.offset.x).toBeCloseTo(viewport.offset.x, 12);
    expect(restored.offset.y).toBeCloseTo(viewport.offset.y, 12);
  });

  it("clamps zoom without moving the anchor", () => {
    const anchor = { x: 20, y: 30 };
    const worldBefore = screenToWorld(anchor, viewport);
    const zoomed = zoomViewportAt(viewport, anchor, 100, {
      minimum: 0.1,
      maximum: 8,
    });

    expect(zoomed.zoom).toBe(8);
    expect(screenToWorld(anchor, zoomed).x).toBeCloseTo(worldBefore.x, 12);
    expect(screenToWorld(anchor, zoomed).y).toBeCloseTo(worldBefore.y, 12);
  });

  it("applies the same screen pan delta at every zoom", () => {
    const delta = { x: 75, y: -31 };
    const atOne = panViewport({ offset: { x: 0, y: 0 }, zoom: 1 }, delta);
    const atEight = panViewport({ offset: { x: 0, y: 0 }, zoom: 8 }, delta);

    expect(atOne.offset).toEqual(delta);
    expect(atEight.offset).toEqual(delta);
    expect(atOne.zoom).toBe(1);
    expect(atEight.zoom).toBe(8);
  });

  it("rejects invalid coordinate and zoom inputs", () => {
    expect(() =>
      zoomViewportAt(viewport, { x: 0, y: 0 }, Number.NaN, {
        minimum: 0.1,
        maximum: 8,
      }),
    ).toThrow(RangeError);
    expect(() =>
      screenToWorld({ x: Number.POSITIVE_INFINITY, y: 0 }, viewport),
    ).toThrow(RangeError);
  });
});
