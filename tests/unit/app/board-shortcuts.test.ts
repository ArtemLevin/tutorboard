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

  it("keeps key-only synthetic events compatible without weakening physical codes", () => {
    expect(
      resolveBoardShortcut(
        {
          altKey: false,
          code: "",
          ctrlKey: false,
          key: "r",
          metaKey: false,
          repeat: false,
          shiftKey: false,
        },
        { readOnly: false },
      ),
    ).toBe("tool.rectangle");
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

  it("resolves X to eraser while leaving accelerator X to clipboard handling", () => {
    expect(resolveBoardShortcut(key("KeyX"), { readOnly: false })).toBe(
      "tool.eraser",
    );
    expect(
      resolveBoardShortcut(key("KeyX", { ctrlKey: true }), {
        readOnly: false,
      }),
    ).toBeNull();
    expect(resolveBoardShortcut(key("KeyX"), { readOnly: true })).toBeNull();
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
