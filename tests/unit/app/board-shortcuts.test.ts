import { describe, expect, it } from "vitest";

import {
  boardShortcutForTool,
  duplicateBoardShortcutChords,
  resolveBoardShortcut,
} from "../../../src/app/board/shortcuts/board-shortcuts";
import { drawingTools } from "../../../src/modules/drawing/public";
import {
  lassoSelectionTool,
  selectionTool,
} from "../../../src/modules/selection/public";

const input = (
  code: string,
  overrides: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    shiftKey: boolean;
  }> = {},
) => ({
  altKey: false,
  code,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  shiftKey: false,
  ...overrides,
});

const context = {
  handwrittenFunctionsEnabled: true,
  readOnly: false,
} as const;

describe("board shortcut registry", () => {
  it("has no duplicate chords", () => {
    expect(duplicateBoardShortcutChords()).toEqual([]);
  });

  it("keeps legacy tool metadata aligned with the executable registry", () => {
    for (const tool of drawingTools) {
      expect(boardShortcutForTool(tool.id)).toBe(tool.shortcut);
    }
    expect(boardShortcutForTool(selectionTool.id)).toBe(selectionTool.shortcut);
    expect(boardShortcutForTool(lassoSelectionTool.id)).toBe(
      lassoSelectionTool.shortcut,
    );
  });

  it("keeps L for line and moves lasso to Shift+V", () => {
    expect(resolveBoardShortcut(input("KeyL"), context)).toEqual({
      kind: "activate-tool",
      tool: "drawing.line",
    });
    expect(
      resolveBoardShortcut(input("KeyV", { shiftKey: true }), context),
    ).toEqual({
      kind: "activate-tool",
      tool: "selection.lasso",
    });
    expect(resolveBoardShortcut(input("KeyV"), context)).toEqual({
      kind: "activate-tool",
      tool: "selection.select",
    });
    expect(boardShortcutForTool("drawing.line")).toBe("L");
    expect(boardShortcutForTool("selection.lasso")).toBe("Shift+V");
  });

  it("resolves physical key codes independently of keyboard layout", () => {
    expect(resolveBoardShortcut(input("KeyL"), context)).toEqual({
      kind: "activate-tool",
      tool: "drawing.line",
    });
  });

  it("blocks mutating shortcuts in read-only mode", () => {
    const readOnly = { ...context, readOnly: true };
    expect(resolveBoardShortcut(input("KeyP"), readOnly)).toBeNull();
    expect(resolveBoardShortcut(input("Digit1"), readOnly)).toBeNull();
    expect(resolveBoardShortcut(input("KeyV"), readOnly)).toEqual({
      kind: "activate-tool",
      tool: "selection.select",
    });
  });

  it("ignores repeats and modified tool chords", () => {
    expect(
      resolveBoardShortcut(input("KeyL", { repeat: true }), context),
    ).toBeNull();
    expect(
      resolveBoardShortcut(input("KeyL", { ctrlKey: true }), context),
    ).toBeNull();
    expect(
      resolveBoardShortcut(input("KeyL", { altKey: true }), context),
    ).toBeNull();
  });

  it("respects feature availability for handwritten functions", () => {
    expect(
      resolveBoardShortcut(input("KeyF"), {
        ...context,
        handwrittenFunctionsEnabled: false,
      }),
    ).toBeNull();
  });

  it("maps digit shortcuts to the shared primary color palette", () => {
    expect(resolveBoardShortcut(input("Digit1"), context)).toEqual({
      color: "#111827",
      kind: "set-primary-color",
    });
    expect(resolveBoardShortcut(input("Digit5"), context)).toEqual({
      color: "#facc15",
      kind: "set-primary-color",
    });
  });
});
