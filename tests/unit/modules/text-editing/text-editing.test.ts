import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  reduceBoardDocument,
  type TextObject,
} from "../../../../src/core/public";
import {
  createUpdateTextCommand,
  isEditableTextObject,
  resolveTextEditorKeyboardAction,
  resolveTextTypography,
  textLineMetrics,
  wrapBoardText,
} from "../../../../src/modules/text-editing/public";
import {
  emptyDocument,
  loadCurrentGeometryImportFixture,
  metadata,
} from "../../core/helpers";
import { readBoardDocument } from "../../../../src/core/public";

function userText(): TextObject {
  return {
    groupId: null,
    id: boardObjectId("object:text"),
    kind: "drawing.text",
    locked: false,
    position: { x: 10, y: 20 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: { fill: "#111111", opacity: 1, stroke: null, strokeWidth: 0 },
    text: "Before",
    visible: true,
  };
}

describe("text editing", () => {
  it("updates one unlocked user text object", () => {
    const added = reduceBoardDocument(emptyDocument(), {
      ...metadata("add-text"),
      kind: "core.objects.add",
      objects: [userText()],
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(isEditableTextObject(added.document.objects[userText().id])).toBe(
      true,
    );
    const updated = reduceBoardDocument(
      added.document,
      createUpdateTextCommand(
        metadata("update-text", "2026-07-24T12:02:00.000Z"),
        userText().id,
        "$x^2$",
      ),
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.document.objects[userText().id]).toMatchObject({
        text: "$x^2$",
      });
    }
  });

  it("rejects editing canonical GeometryOS labels", () => {
    const raw = loadCurrentGeometryImportFixture();
    const stored = Object.values(
      raw.objects as Record<string, Record<string, unknown>>,
    )[0];
    expect(stored).toBeDefined();
    if (stored === undefined) {
      return;
    }
    stored.kind = "drawing.text";
    stored.text = "A";
    delete stored.radius;
    const read = readBoardDocument(raw);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const label = Object.values(read.document.objects).find(
      (object) => object?.kind === "drawing.text",
    );
    expect(label).toBeDefined();
    if (label === undefined) {
      return;
    }
    const updated = reduceBoardDocument(
      read.document,
      createUpdateTextCommand(
        metadata("update-import-label", "2026-07-25T12:01:00.000Z"),
        label.id,
        "Changed",
      ),
    );
    expect(updated.ok).toBe(false);
    if (!updated.ok) {
      expect(updated.error.code).toBe(
        "command.imported-object-edit-unsupported",
      );
    }
  });
});

describe("text editor keyboard contract", () => {
  const event = (
    overrides: Partial<
      Parameters<typeof resolveTextEditorKeyboardAction>[0]
    > = {},
  ) => ({
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "Enter",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });

  it("keeps bare Enter native for multiline editing", () => {
    expect(resolveTextEditorKeyboardAction(event())).toBe("native");
  });

  it.each([
    { ctrlKey: false, metaKey: false, shiftKey: true },
    { ctrlKey: true, metaKey: false, shiftKey: false },
    { ctrlKey: false, metaKey: true, shiftKey: false },
  ])("commits the supported Enter chord %#", (modifiers) => {
    expect(
      resolveTextEditorKeyboardAction(event({ key: "Enter", ...modifiers })),
    ).toBe("commit");
  });

  it("cancels with Escape", () => {
    expect(resolveTextEditorKeyboardAction(event({ key: "Escape" }))).toBe(
      "cancel",
    );
  });

  it.each([
    { key: "Enter", shiftKey: true },
    { ctrlKey: true, key: "Enter" },
    { key: "Escape" },
  ])("gives IME composition precedence %#", (overrides) => {
    expect(
      resolveTextEditorKeyboardAction(
        event({ ...overrides, isComposing: true }),
      ),
    ).toBe("compose");
  });

  it("does not hijack Alt+Enter", () => {
    expect(
      resolveTextEditorKeyboardAction(event({ altKey: true, shiftKey: true })),
    ).toBe("native");
  });
});

describe("text typography and 20-character wrapping", () => {
  it("wraps long lines by words, at most 20 Unicode code points", () => {
    const source = "Первая длинная строка и дальнейшее продолжение";
    const lines = wrapBoardText(source).split("\n");
    expect(lines.every((line) => Array.from(line).length <= 20)).toBe(true);
    expect(lines.join(" ")).toBe(source);
  });

  it("splits long words and keeps manual breaks and emoji intact", () => {
    expect(wrapBoardText("😀".repeat(22))).toBe("😀".repeat(20) + "\n😀😀");
    expect(wrapBoardText("до\nпосле")).toBe("до\nпосле");
  });

  it("keeps legacy text appearance and supports independent typography", () => {
    expect(resolveTextTypography(userText().style)).toMatchObject({
      fontSize: 22,
      lineHeight: 1.35,
      fontWeight: "normal",
    });
    expect(
      resolveTextTypography({
        ...userText().style,
        fontSize: 13,
        fontWeight: "bold",
        fontStyle: "italic",
      }),
    ).toMatchObject({ fontSize: 13, fontStyle: "bold italic" });
  });
});

describe("text interaction geometry", () => {
  it("uses the same logical wrapped lines in selection, eraser and culling", () => {
    expect(textLineMetrics("😀".repeat(43))).toEqual({
      lineCount: 3,
      maximumCharacters: 20,
    });
    expect(textLineMetrics("first\nsecond")).toEqual({
      lineCount: 2,
      maximumCharacters: 6,
    });
    expect(textLineMetrics("\n".repeat(75_000))).toEqual({
      lineCount: 75_001,
      maximumCharacters: 1,
    });
  });
});
