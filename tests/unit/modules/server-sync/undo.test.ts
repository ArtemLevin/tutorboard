import { describe, expect, it } from "vitest";

import {
  commandId,
  groupId,
  identityTransform,
  reduceBoardDocument,
  type BoardCommand,
  type BoardDocument,
} from "../../../../src/core/public";
import { invertOwnBoardCommand } from "../../../../src/modules/server-sync/public";
import { actor, emptyDocument, metadata, rectangle } from "../../core/helpers";

function apply(
  document: BoardDocument,
  commands: readonly BoardCommand[],
): BoardDocument {
  return commands.reduce((current, command) => {
    const result = reduceBoardDocument(current, command);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.document;
  }, document);
}

const undoMetadata = {
  actorId: actor,
  createId: () => commandId("command:undo"),
  now: () => "2026-07-24T12:03:00.000Z",
};

describe("collaborative own-operation undo", () => {
  it("inverts one atomic object replacement with its snapshots", () => {
    const original = rectangle("smart-ink");
    const before = apply(emptyDocument(), [
      {
        ...metadata("seed"),
        kind: "core.objects.add",
        objects: [original],
      },
    ]);
    const replacement = {
      groupId: original.groupId,
      id: original.id,
      kind: "drawing.ellipse" as const,
      locked: original.locked,
      position: original.position,
      radius: { x: 60, y: 40 },
      rotation: original.rotation,
      scale: original.scale,
      source: original.source,
      style: original.style,
      visible: original.visible,
    };
    const command: BoardCommand = {
      ...metadata("replace", "2026-07-24T12:02:00.000Z"),
      kind: "core.objects.replace",
      originals: [original],
      replacements: [replacement],
    };
    const after = apply(before, [command]);
    const inverse = invertOwnBoardCommand(command, before, undoMetadata);
    const restored = apply(after, inverse);

    expect(inverse).toEqual([
      expect.objectContaining({
        kind: "core.objects.replace",
        originals: [replacement],
        replacements: [original],
      }),
    ]);
    expect(restored.objects).toEqual(before.objects);
    expect(restored.order).toEqual(before.order);
  });

  it("inverts a mixed batch replacement as one collaborative command", () => {
    const one = rectangle("batch-one");
    const two = rectangle("batch-two");
    const before = apply(emptyDocument(), [
      {
        ...metadata("batch-seed"),
        kind: "core.objects.add",
        objects: [one, two],
      },
    ]);
    const fragment = {
      ...one,
      id: one.id,
      position: { x: 12, y: 0 },
    };
    const command: BoardCommand = {
      ...metadata("batch-change", "2026-07-24T12:02:00.000Z"),
      changes: [
        {
          atIndex: 0,
          originals: [one],
          replacements: [fragment],
        },
        {
          atIndex: 1,
          originals: [two],
          replacements: [],
        },
      ],
      kind: "core.objects.batch-replace",
    };
    const after = apply(before, [command]);
    const inverse = invertOwnBoardCommand(command, before, undoMetadata);
    expect(inverse).toHaveLength(1);
    expect(inverse[0]).toMatchObject({
      kind: "core.objects.batch-replace",
      changes: [
        {
          atIndex: 0,
          originals: [fragment],
          replacements: [one],
        },
        {
          atIndex: 1,
          originals: [],
          replacements: [two],
        },
      ],
    });
    const restored = apply(after, inverse);
    expect(restored.objects).toEqual(before.objects);
    expect(restored.order).toEqual(before.order);
  });

  it("restores adjacent batch deletions at their exact layer positions", () => {
    const one = rectangle("adjacent-one");
    const two = rectangle("adjacent-two");
    const three = rectangle("adjacent-three");
    const four = rectangle("adjacent-four");
    const before = apply(emptyDocument(), [
      {
        ...metadata("adjacent-seed"),
        kind: "core.objects.add",
        objects: [one, two, three, four],
      },
    ]);
    const command: BoardCommand = {
      ...metadata("adjacent-delete", "2026-07-24T12:02:00.000Z"),
      changes: [
        { atIndex: 1, originals: [two], replacements: [] },
        { atIndex: 2, originals: [three], replacements: [] },
      ],
      kind: "core.objects.batch-replace",
    };

    const after = apply(before, [command]);
    expect(after.order).toEqual([one.id, four.id]);

    const inverse = invertOwnBoardCommand(command, before, undoMetadata);
    expect(inverse).toHaveLength(1);
    expect(inverse[0]).toMatchObject({
      kind: "core.objects.batch-replace",
      changes: [
        {
          atIndex: 1,
          originals: [],
          replacements: [two, three],
        },
      ],
    });

    const restored = apply(after, inverse);
    expect(restored.objects).toEqual(before.objects);
    expect(restored.order).toEqual(before.order);
  });

  it("turns an object add into a command-log delete", () => {
    const before = emptyDocument();
    const command: BoardCommand = {
      ...metadata("add"),
      kind: "core.objects.add",
      objects: [rectangle("one")],
    };
    const after = apply(before, [command]);
    const inverse = invertOwnBoardCommand(command, before, undoMetadata);
    const restored = apply(after, inverse);

    expect(inverse[0]?.kind).toBe("core.objects.delete");
    expect(restored.objects).toEqual(before.objects);
    expect(restored.order).toEqual(before.order);
  });

  it("restores the previous group transform", () => {
    const object = rectangle("grouped");
    const before = apply(emptyDocument(), [
      { ...metadata("seed"), kind: "core.objects.add", objects: [object] },
      {
        ...metadata("group", "2026-07-24T12:01:00.000Z"),
        group: {
          id: groupId("group:transform"),
          locked: false,
          objectIds: [object.id],
          transform: identityTransform,
        },
        kind: "core.groups.add",
      },
    ]);
    const command: BoardCommand = {
      ...metadata("transform", "2026-07-24T12:02:00.000Z"),
      groupId: groupId("group:transform"),
      kind: "core.groups.set-transform",
      transform: {
        rotation: 45,
        scale: { x: 1.2, y: 1.2 },
        translation: { x: 20, y: 10 },
      },
    };
    const after = apply(before, [command]);
    const inverse = invertOwnBoardCommand(command, before, undoMetadata);
    const restored = apply(after, inverse);

    expect(inverse[0]).toMatchObject({
      groupId: groupId("group:transform"),
      kind: "core.groups.set-transform",
      transform: identityTransform,
    });
    expect(restored.groups).toEqual(before.groups);
  });

  it("restores ungrouped deletes at their exact layer positions", () => {
    const initial = emptyDocument();
    const populated = apply(initial, [
      {
        ...metadata("seed"),
        kind: "core.objects.add",
        objects: [rectangle("one"), rectangle("two"), rectangle("three")],
      },
    ]);
    const command: BoardCommand = {
      ...metadata("delete", "2026-07-24T12:02:00.000Z"),
      kind: "core.objects.delete",
      objectIds: [rectangle("one").id, rectangle("three").id],
    };
    const after = apply(populated, [command]);
    const inverse = invertOwnBoardCommand(command, populated, {
      ...undoMetadata,
      createId: (() => {
        let sequence = 0;
        return () => `command:undo:${++sequence}`;
      })(),
      now: (() => {
        let sequence = 0;
        return () => `2026-07-24T12:03:0${++sequence}.000Z`;
      })(),
    });
    const restored = apply(after, inverse);

    expect(restored.objects).toEqual(populated.objects);
    expect(restored.order).toEqual(populated.order);
  });

  it("refuses an inexact inverse instead of replacing the document", () => {
    const before = emptyDocument();
    const command: BoardCommand = {
      ...metadata("style"),
      kind: "core.selection.set-style",
      objectIds: [],
      style: { stroke: "#ff0000" },
    };

    expect(invertOwnBoardCommand(command, before, undoMetadata)).toEqual([]);
  });
});
