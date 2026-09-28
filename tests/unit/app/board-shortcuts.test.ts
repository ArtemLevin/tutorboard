import { describe, expect, it } from "vitest";

import {
  boardShortcutBindings,
  resolveBoardShortcut,
  shortcutConflicts,
} from "../../../src/app/board/shortcuts/board-shortcuts";

function key(
  code: string,
  overrides: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    altKey: false,
    code,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("board shortcuts", () => {
  it("has no conflicting physical chords", () => {
    expect(shortcutConflicts()).toEqual([]);
    expect(boardShortcutBindings.length).toBeGreaterThan(10);
  });

  it("resolves line and lasso to distinct chords", () => {
    expect(resolveBoardShortcut(key("KeyL"), { readOnly: false })).toBe(
      "tool.line",
    );
    expect(
      resolveBoardShortcut(key("KeyV", { shiftKey: true }), {
        readOnly: false,
      }),
    ).toBe("tool.lasso");
    expect(resolveBoardShortcut(key("KeyV"), { readOnly: false })).toBe(
      "tool.select",
    );
  });

  it("uses physical key codes independently of keyboard layout", () => {
    expect(resolveBoardShortcut(key("KeyL"), { readOnly: false })).toBe(
      "tool.line",
    );
  });

  it("blocks write actions in read-only mode while keeping navigation", () => {
    expect(resolveBoardShortcut(key("KeyP"), { readOnly: true })).toBeNull();
    expect(resolveBoardShortcut(key("KeyG"), { readOnly: true })).toBeNull();
    expect(resolveBoardShortcut(key("KeyH"), { readOnly: true })).toBe(
      "tool.pan",
    );
  });

  it("ignores modifier conflicts and repeated one-shot actions", () => {
    expect(
      resolveBoardShortcut(key("KeyL", { ctrlKey: true }), {
        readOnly: false,
      }),
    ).toBeNull();
    expect(
      resolveBoardShortcut(key("KeyL", { repeat: true }), {
        readOnly: false,
      }),
    ).toBeNull();
  });

  it("resolves the five primary color shortcuts", () => {
    expect(resolveBoardShortcut(key("Digit1"), { readOnly: false })).toBe(
      "color.1",
    );
    expect(resolveBoardShortcut(key("Digit5"), { readOnly: false })).toBe(
      "color.5",
    );
  });
});
