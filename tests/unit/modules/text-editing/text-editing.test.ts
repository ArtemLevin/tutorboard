import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  reduceBoardDocument,
  type TextObject,
} from "../../../../src/core/public";
import {
  createUpdateTextCommand,
  isEditableTextObject,
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
