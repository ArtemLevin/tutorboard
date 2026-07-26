import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  geometryImportId,
  groupId,
  reduceBoardDocument,
} from "../../../../src/core/public";
import {
  copyBoardSelection,
  createCutContentCommand,
  createPasteContentCommand,
} from "../../../../src/modules/clipboard/public";
import {
  loadCurrentBoardFixture,
  loadCurrentGeometryImportFixture,
  metadata,
} from "../../core/helpers";
import { readBoardDocument } from "../../../../src/core/public";

const ids = {
  geometryImport: (source: string) => geometryImportId(`copy:${source}`),
  group: (source: string) => groupId(`copy:${source}`),
  object: (source: string) => boardObjectId(`copy:${source}`),
};

describe("board clipboard", () => {
  it("expands a group and pastes it atomically with deterministic IDs", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const copied = copyBoardSelection(read.document, [
      boardObjectId("object:line-01"),
    ]);
    expect(copied.status).toBe("ok");
    if (copied.status !== "ok") {
      return;
    }
    expect(copied.payload.order).toEqual([
      "object:line-01",
      "object:rectangle-01",
    ]);

    const command = createPasteContentCommand(
      copied.payload,
      metadata("paste"),
      ids,
    );
    const pasted = reduceBoardDocument(read.document, command);

    expect(pasted.ok).toBe(true);
    if (pasted.ok) {
      expect(pasted.document.order.slice(-2)).toEqual([
        "copy:object:line-01",
        "copy:object:rectangle-01",
      ]);
      expect(
        pasted.document.groups[groupId("copy:group:example-01")]?.transform
          .translation,
      ).toEqual({ x: 24, y: 24 });
    }
  });

  it("remaps complete GeometryOS provenance without changing canonical GIR", () => {
    const read = readBoardDocument(loadCurrentGeometryImportFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const sourceId = read.document.order[0];
    expect(sourceId).toBeDefined();
    if (sourceId === undefined) {
      return;
    }
    const copied = copyBoardSelection(read.document, [sourceId]);
    expect(copied.status).toBe("ok");
    if (copied.status !== "ok") {
      return;
    }
    expect(copied.payload.order).toHaveLength(read.document.order.length);

    const pasted = reduceBoardDocument(
      read.document,
      createPasteContentCommand(
        copied.payload,
        metadata("geometry-paste", "2026-07-25T12:01:00.000Z"),
        ids,
      ),
    );
    if (!pasted.ok) {
      throw new Error(`${pasted.error.code}: ${pasted.error.message}`);
    }
    const original = copied.payload.geometryImports[0];
    const duplicate =
      pasted.document.geometryImports[
        geometryImportId(`copy:${original?.id ?? ""}`)
      ];
    expect(duplicate?.canonicalGir).toEqual(original?.canonicalGir);
    expect(duplicate?.visualTransform.translation).toEqual({
      x: (original?.visualTransform.translation.x ?? 0) + 24,
      y: (original?.visualTransform.translation.y ?? 0) + 24,
    });
    expect(
      duplicate?.boardObjectIds.every((id) => id.startsWith("copy:")),
    ).toBe(true);
  });

  it("cuts the exact copied closure and rejects an empty selection", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    expect(copyBoardSelection(read.document, [])).toEqual({
      code: "clipboard.empty",
      status: "error",
    });
    const copied = copyBoardSelection(read.document, read.document.order);
    expect(copied.status).toBe("ok");
    if (copied.status !== "ok") {
      return;
    }
    const cut = reduceBoardDocument(
      read.document,
      createCutContentCommand(copied.payload, metadata("cut")),
    );

    expect(cut.ok).toBe(true);
    if (cut.ok) {
      expect(cut.document.order).toEqual([]);
      expect(cut.document.groups).toEqual({});
    }
  });
});
