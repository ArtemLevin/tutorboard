import { describe, expect, it } from "vitest";

import {
  startsStylusEraser,
  transitionStylusEraserGesture,
} from "./stylus-eraser";

describe("QoL 2.5 stylus eraser pointer state", () => {
  const pen = { pointerType: "pen", button: 2, buttons: 2 } as const;

  it("recognizes the barrel switch and eraser tip only on an enabled pen", () => {
    expect(startsStylusEraser(pen, true, "drawing.pen")).toBe(true);
    expect(
      startsStylusEraser({ ...pen, button: 5, buttons: 32 }, true, "drawing.pen"),
    ).toBe(true);
    expect(
      startsStylusEraser({ ...pen, button: -1, buttons: 32 }, true, "drawing.pen"),
    ).toBe(true);
    expect(startsStylusEraser(pen, false, "drawing.pen")).toBe(false);
    expect(startsStylusEraser(pen, true, "editing.eraser")).toBe(false);
    expect(startsStylusEraser(pen, true, "selection.select")).toBe(false);
    expect(startsStylusEraser({ ...pen, pointerType: "mouse" }, true, "drawing.pen")).toBe(false);
    expect(startsStylusEraser({ ...pen, pointerType: "touch" }, true, "drawing.pen")).toBe(false);
    expect(startsStylusEraser({ pointerType: "pen", button: 0, buttons: 1 }, true, "drawing.pen")).toBe(false);
  });

  it("ends only the owner pointer and cancels on capture loss, focus loss or disable", () => {
    const first = transitionStylusEraserGesture(null, {
      kind: "start",
      pointerId: 31,
      enabled: true,
    });
    expect(first?.pointerId).toBe(31);
    expect(transitionStylusEraserGesture(first, { kind: "end", pointerId: 32 })).toEqual(first);
    expect(transitionStylusEraserGesture(first, { kind: "lostcapture", pointerId: 31 })).toBeNull();
    expect(transitionStylusEraserGesture(first, { kind: "cancel", pointerId: 31 })).toBeNull();
    expect(transitionStylusEraserGesture(first, { kind: "blur" })).toBeNull();
    expect(transitionStylusEraserGesture(first, { kind: "disable" })).toBeNull();
    expect(transitionStylusEraserGesture(first, { kind: "unmount" })).toBeNull();
    expect(transitionStylusEraserGesture(null, { kind: "start", pointerId: 4, enabled: false })).toBeNull();
  });
});
