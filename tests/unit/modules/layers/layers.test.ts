import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  groupId,
  reduceBoardDocument,
} from "../../../../src/core/public";
import {
  createGroupSelectionCommand,
  createReorderLayersCommand,
  createSetLayerVisibilityCommand,
  createUngroupSelectionCommand,
  selectLayers,
} from "../../../../src/modules/layers/public";
import {
  loadCurrentBoardFixture,
  loadCurrentGeometryImportFixture,
  metadata,
} from "../../core/helpers";
import { readBoardDocument } from "../../../../src/core/public";

describe("layers", () => {
  it("groups a complete user selection atomically", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const ungrouped = reduceBoardDocument(
      read.document,
      createUngroupSelectionCommand(
        metadata("ungroup-first"),
        read.document,
        read.document.order,
      ),
    );
    expect(ungrouped.ok).toBe(true);
    if (!ungrouped.ok) {
      return;
    }
    const regrouped = reduceBoardDocument(
      ungrouped.document,
      createGroupSelectionCommand(
        metadata("regroup", "2026-07-24T12:02:00.000Z"),
        groupId("group:regrouped"),
        ungrouped.document.order,
      ),
    );
    expect(regrouped.ok).toBe(true);
    if (regrouped.ok) {
      expect(
        regrouped.document.groups[groupId("group:regrouped")]?.objectIds,
      ).toEqual(ungrouped.document.order);
    }
  });

  it("reorders a selection while preserving relative order", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const front = reduceBoardDocument(
      read.document,
      createReorderLayersCommand(
        metadata("front"),
        [boardObjectId("object:line-01")],
        "front",
      ),
    );
    expect(front.ok).toBe(true);
    if (front.ok) {
      expect(front.document.order).toEqual([
        "object:rectangle-01",
        "object:line-01",
      ]);
      expect(selectLayers(front.document)[0]?.id).toBe("object:line-01");
    }
  });

  it("changes visibility without changing z-order", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const hidden = reduceBoardDocument(
      read.document,
      createSetLayerVisibilityCommand(
        metadata("hide"),
        [boardObjectId("object:line-01")],
        false,
      ),
    );
    expect(hidden.ok).toBe(true);
    if (hidden.ok) {
      expect(hidden.document.order).toEqual(read.document.order);
      expect(
        hidden.document.objects[boardObjectId("object:line-01")]?.visible,
      ).toBe(false);
    }
  });

  it("ungroups user content but preserves GeometryOS root groups", () => {
    const user = readBoardDocument(loadCurrentBoardFixture());
    expect(user.status).toBe("ok");
    if (user.status !== "ok") {
      return;
    }
    const ungrouped = reduceBoardDocument(
      user.document,
      createUngroupSelectionCommand(metadata("ungroup"), user.document, [
        boardObjectId("object:line-01"),
      ]),
    );
    expect(ungrouped.ok).toBe(true);
    if (ungrouped.ok) {
      expect(ungrouped.document.groups).toEqual({});
      expect(
        ungrouped.document.objects[boardObjectId("object:line-01")]?.groupId,
      ).toBeNull();
    }

    const geometry = readBoardDocument(loadCurrentGeometryImportFixture());
    expect(geometry.status).toBe("ok");
    if (geometry.status !== "ok") {
      return;
    }
    const rejected = reduceBoardDocument(geometry.document, {
      ...metadata("geometry-ungroup", "2026-07-25T12:01:00.000Z"),
      groupIds: [groupId("group:geometry-root-01")],
      kind: "core.groups.remove",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe(
        "command.imported-group-remove-unsupported",
      );
    }
  });
});
