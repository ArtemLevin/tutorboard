import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  groupId,
  identityTransform,
  readBoardDocument,
  reduceBoardDocument,
  selectGroupObjects,
  type BoardDocument,
} from "../../../src/core/public";
import {
  emptyDocument,
  loadGeometryImportFixture,
  metadata,
  rectangle,
} from "./helpers";

function addObjects(
  document: BoardDocument,
  suffix: string,
  objects: ReturnType<typeof rectangle>[],
  atIndex?: number,
  timestamp = "2026-07-24T12:01:00.000Z",
) {
  return reduceBoardDocument(document, {
    ...metadata(suffix, timestamp),
    kind: "core.objects.add",
    objects,
    ...(atIndex === undefined ? {} : { atIndex }),
  });
}

describe("BoardDocument reducer", () => {
  it("adds objects atomically at the requested z-order index", () => {
    const first = addObjects(
      emptyDocument(),
      "add-first",
      [rectangle("back"), rectangle("front")],
      0,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = addObjects(
      first.document,
      "add-middle",
      [rectangle("middle")],
      1,
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.document.order).toEqual([
        "object:back",
        "object:middle",
        "object:front",
      ]);
    }
  });

  it("returns the original reference after any failed command", () => {
    const object = rectangle("same");
    const added = addObjects(emptyDocument(), "add-same", [object]);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const failed = addObjects(added.document, "duplicate", [object]);

    expect(failed.ok).toBe(false);
    expect(failed.document).toBe(added.document);
    if (!failed.ok) {
      expect(failed.error.code).toBe("command.object-exists");
    }
  });

  it("treats inherited record names as missing IDs", () => {
    const document = emptyDocument();

    const result = reduceBoardDocument(document, {
      ...metadata("prototype-lookup"),
      kind: "core.objects.move",
      objectIds: [boardObjectId("toString")],
      delta: { x: 1, y: 1 },
    });

    expect(result.ok).toBe(false);
    expect(result.document).toBe(document);
    if (!result.ok) {
      expect(result.error.code).toBe("command.object-missing");
    }
  });

  it("adds a group and moves it without rewriting member coordinates", () => {
    const added = addObjects(emptyDocument(), "group-members", [
      rectangle("one", { x: 10 }),
      rectangle("two", { x: 30 }),
    ]);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const grouped = reduceBoardDocument(added.document, {
      ...metadata("add-group", "2026-07-24T12:02:00.000Z"),
      kind: "core.groups.add",
      group: {
        id: groupId("group:pair"),
        locked: false,
        objectIds: added.document.order,
        transform: identityTransform,
      },
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) {
      return;
    }

    const moved = reduceBoardDocument(grouped.document, {
      ...metadata("move-group", "2026-07-24T12:03:00.000Z"),
      kind: "core.groups.move",
      groupId: groupId("group:pair"),
      delta: { x: 15, y: -5 },
    });

    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(
        moved.document.groups[groupId("group:pair")]?.transform.translation,
      ).toEqual({ x: 15, y: -5 });
      expect(
        moved.document.objects[added.document.order[0]!]!.position,
      ).toEqual({ x: 10, y: 0 });
      expect(
        selectGroupObjects(moved.document, groupId("group:pair")).map(
          ({ groupId: memberGroupId }) => memberGroupId,
        ),
      ).toEqual([groupId("group:pair"), groupId("group:pair")]);
    }
  });

  it("updates group membership when an object is added to an existing group", () => {
    const added = addObjects(emptyDocument(), "initial-member", [
      rectangle("one"),
    ]);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const grouped = reduceBoardDocument(added.document, {
      ...metadata("initial-group", "2026-07-24T12:02:00.000Z"),
      kind: "core.groups.add",
      group: {
        id: groupId("group:pair"),
        locked: false,
        objectIds: added.document.order,
        transform: identityTransform,
      },
    });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) {
      return;
    }

    const result = addObjects(
      grouped.document,
      "append-member",
      [rectangle("two", { group: "group:pair" })],
      undefined,
      "2026-07-24T12:03:00.000Z",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.groups[groupId("group:pair")]?.objectIds).toEqual([
        "object:one",
        "object:two",
      ]);
    }
  });

  it("removes an empty group when its final user object is deleted", () => {
    const object = rectangle("only");
    const groupedDocument: BoardDocument = {
      ...emptyDocument(),
      updatedAt: "2026-07-24T12:01:00.000Z",
      objects: { [object.id]: { ...object, groupId: groupId("group:only") } },
      order: [object.id],
      groups: {
        [groupId("group:only")]: {
          id: groupId("group:only"),
          locked: false,
          objectIds: [object.id],
          transform: identityTransform,
        },
      },
    };

    const result = reduceBoardDocument(groupedDocument, {
      ...metadata("delete-only", "2026-07-24T12:02:00.000Z"),
      kind: "core.objects.delete",
      objectIds: [object.id],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.objects).toEqual({});
      expect(result.document.groups).toEqual({});
      expect(result.document.order).toEqual([]);
    }
  });

  it("rejects invalid references and locked group members without mutation", () => {
    const document = emptyDocument();
    const invalidGroup = reduceBoardDocument(document, {
      ...metadata("missing-member"),
      kind: "core.groups.add",
      group: {
        id: groupId("group:invalid"),
        locked: false,
        objectIds: [rectangle("missing").id],
        transform: identityTransform,
      },
    });

    expect(invalidGroup.ok).toBe(false);
    expect(invalidGroup.document).toBe(document);

    const member = rectangle("locked-member", { group: "group:locked" });
    const lockedDocument: BoardDocument = {
      ...document,
      updatedAt: "2026-07-24T12:01:00.000Z",
      objects: { [member.id]: member },
      order: [member.id],
      groups: {
        [groupId("group:locked")]: {
          id: groupId("group:locked"),
          locked: true,
          objectIds: [member.id],
          transform: identityTransform,
        },
      },
    };
    const moved = reduceBoardDocument(lockedDocument, {
      ...metadata("move-locked", "2026-07-24T12:02:00.000Z"),
      kind: "core.objects.move",
      objectIds: [member.id],
      delta: { x: 1, y: 1 },
    });

    expect(moved.ok).toBe(false);
    expect(moved.document).toBe(lockedDocument);
    if (!moved.ok) {
      expect(moved.error.code).toBe("command.locked");
    }
  });

  it("compares timestamps by instant, including timezone offsets", () => {
    const document: BoardDocument = {
      ...emptyDocument(),
      updatedAt: "2026-07-24T09:00:00-04:00",
    };

    const result = reduceBoardDocument(document, {
      ...metadata("stale-offset", "2026-07-24T12:00:00Z"),
      kind: "core.document.rename",
      title: "Too late",
    });

    expect(result.ok).toBe(false);
    expect(result.document).toBe(document);
    if (!result.ok) {
      expect(result.error.code).toBe("command.stale-timestamp");
    }
  });

  it("commits a valid viewport and rejects an invalid one atomically", () => {
    const document = emptyDocument();
    const committed = reduceBoardDocument(document, {
      ...metadata("viewport"),
      kind: "core.viewport.set",
      viewport: { offset: { x: -240, y: 90 }, zoom: 2.5 },
    });

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.document.viewport).toEqual({
      offset: { x: -240, y: 90 },
      zoom: 2.5,
    });

    const rejected = reduceBoardDocument(committed.document, {
      ...metadata("invalid-viewport", "2026-07-24T12:02:00.000Z"),
      kind: "core.viewport.set",
      viewport: { offset: { x: 0, y: 0 }, zoom: 0 },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.document).toBe(committed.document);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe("command.invalid");
    }
  });

  it("requires specialized commands for imported geometry edits", () => {
    const read = readBoardDocument(loadGeometryImportFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const movedObject = reduceBoardDocument(read.document, {
      ...metadata("move-import", "2026-07-24T13:02:00.000Z"),
      kind: "core.objects.move",
      objectIds: [boardObjectId("object:geometry-point-A")],
      delta: { x: 1, y: 0 },
    });
    expect(movedObject.ok).toBe(false);
    expect(movedObject.document).toBe(read.document);
    if (!movedObject.ok) {
      expect(movedObject.error.code).toBe(
        "command.imported-object-move-unsupported",
      );
    }

    const movedGroup = reduceBoardDocument(read.document, {
      ...metadata("move-import-group", "2026-07-24T13:02:00.000Z"),
      kind: "core.groups.move",
      groupId: groupId("group:geometry-root-01"),
      delta: { x: 1, y: 0 },
    });
    expect(movedGroup.ok).toBe(false);
    expect(movedGroup.document).toBe(read.document);
    if (!movedGroup.ok) {
      expect(movedGroup.error.code).toBe(
        "command.imported-group-move-unsupported",
      );
    }
  });

  it("rejects a command when the current document is already invalid", () => {
    const invalid = {
      ...emptyDocument(),
      order: [rectangle("missing").id],
    };

    const result = reduceBoardDocument(invalid, {
      ...metadata("invalid-current"),
      kind: "core.document.rename",
      title: "Ignored",
    });

    expect(result.ok).toBe(false);
    expect(result.document).toBe(invalid);
    if (!result.ok) {
      expect(result.error.code).toBe("command.invalid-current-document");
    }
  });
});
