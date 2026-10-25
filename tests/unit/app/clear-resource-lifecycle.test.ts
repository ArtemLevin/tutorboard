import { describe, expect, it, vi } from "vitest";

import {
  releaseClearedBoardImageResources,
  resetBoardTransientStateAfterClear,
  shouldResetBoardRenderResources,
} from "../../../src/app/board/controllers/clear-resource-lifecycle";
import { readBoardDocument } from "../../../src/core/public";
import { selectionToolId } from "../../../src/modules/selection/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

describe("clear board transient lifecycle", () => {
  it("resets only after a same-board clear", () => {
    const populated = { documentId: "board:one", hasObjects: true };
    const cleared = { documentId: "board:one", hasObjects: false };
    const unrelatedEmpty = { documentId: "board:two", hasObjects: false };

    expect(shouldResetBoardRenderResources(populated, cleared)).toBe(true);
    expect(shouldResetBoardRenderResources(populated, populated)).toBe(false);
    expect(shouldResetBoardRenderResources(cleared, cleared)).toBe(false);
    expect(shouldResetBoardRenderResources(cleared, populated)).toBe(false);
    const switched = shouldResetBoardRenderResources(populated, unrelatedEmpty);
    expect(switched).toBe(false);
  });

  it("extracts unique embedded sources without passing documents to the cache", () => {
    const read = readBoardDocument(
      createDenseBoardDocument({
        strokeCount: 4,
        staticCount: 2,
        gifCount: 1,
      }),
    );
    if (read.status !== "ok") throw new Error("Invalid image board");
    const retireSources = vi.fn<(sources: Iterable<string>) => void>();

    releaseClearedBoardImageResources(read.document, retireSources);
    expect(retireSources).toHaveBeenCalledOnce();
    const sources = retireSources.mock.calls[0]?.[0];
    expect(sources).toBeInstanceOf(Set);
    expect(sources === undefined ? [] : [...sources]).toHaveLength(2);
  });

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
