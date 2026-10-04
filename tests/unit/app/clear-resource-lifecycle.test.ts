import { describe, expect, it, vi } from "vitest";

import { resetBoardTransientStateAfterClear } from "../../../src/app/board/controllers/clear-resource-lifecycle";
import { selectionToolId } from "../../../src/modules/selection/public";

describe("clear board transient lifecycle", () => {
  it("cancels transient sessions without touching undo-retained document state", () => {
    const drawing = {
      cancel: vi.fn(),
      resetSmartInkSession: vi.fn(),
      setSmartInkNotice: vi.fn(),
    };
    const eraser = { clear: vi.fn() };
    const geometry = { resetTransientState: vi.fn() };
    const handwriting = { resetSession: vi.fn() };
    const laser = { clear: vi.fn() };
    const selection = {
      cancel: vi.fn(),
      replaceSelection: vi.fn(),
    };
    const onInspectorClose = vi.fn();
    const setActiveTool = vi.fn();

    resetBoardTransientStateAfterClear({
      drawing,
      eraser,
      geometry,
      handwriting,
      laser,
      onInspectorClose,
      selection,
      setActiveTool,
    });

    expect(drawing.cancel).toHaveBeenCalledOnce();
    expect(eraser.clear).toHaveBeenCalledOnce();
    expect(drawing.setSmartInkNotice).toHaveBeenCalledWith(null);
    expect(drawing.resetSmartInkSession).toHaveBeenCalledOnce();
    expect(handwriting.resetSession).toHaveBeenCalledOnce();
    expect(geometry.resetTransientState).toHaveBeenCalledOnce();
    expect(laser.clear).toHaveBeenCalledOnce();
    expect(selection.cancel).toHaveBeenCalledOnce();
    expect(selection.replaceSelection).toHaveBeenCalledWith([]);
    expect(onInspectorClose).toHaveBeenCalledOnce();
    expect(setActiveTool).toHaveBeenCalledWith(selectionToolId);
  });
});
