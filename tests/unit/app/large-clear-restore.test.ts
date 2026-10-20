import { expect, it } from "vitest";
import * as core from "../../../src/core/public";
import { CollaborativeUndoAvailability } from "../../../src/app/board/collaborative-undo-availability";
import { planAtomicClearRestore } from "../../../src/app/board/large-clear-restore";
import { copyBoardSelection, createCutContentCommand } from "../../../src/modules/clipboard/public";
import { invertOwnBoardCommand } from "../../../src/modules/server-sync/public";
import { emptyDocument, loadCurrentBoardFixture, metadata, rectangle } from "../core/helpers";

function fixture(count: number, grouped = false): core.BoardDocument {
  const first = core.readBoardDocument(loadCurrentBoardFixture());
  if (first.status !== "ok") throw new Error("Invalid seed");
  const objects = Array.from({ length: count }, (_, i) => rectangle(`bulk:${i}`));
  const groups = grouped
    ? {
        ...first.document.groups,
        "group:bulk": {
          id: core.groupId("group:bulk"),
          locked: false,
          objectIds: objects.map((item) => item.id),
          transform: {
            rotation: 0,
            scale: { x: 1, y: 1 },
            translation: { x: 0, y: 0 },
          },
        },
      }
    : first.document.groups;
  const included = grouped
    ? objects.map((object) => ({
        ...object,
        groupId: core.groupId("group:bulk"),
      }))
    : objects;
  return {
    ...first.document,
    groups,
    objects: {
      ...first.document.objects,
      ...Object.fromEntries(included.map((object) => [object.id, object])),
    },
    order: [...first.document.order, ...included.map((object) => object.id)],
  };
}

function makeCut(source: core.BoardDocument) {
  const selected = copyBoardSelection(source, source.order);
  if (selected.status !== "ok") throw new Error("Cannot select objects");
  const cut = createCutContentCommand(selected.payload, metadata("atomic-clear"));
  const after = core.reduceBoardDocument(source, cut);
  if (!after.ok) throw new Error(after.error.message);
  const inverse = invertOwnBoardCommand(cut, source, {
    actorId: metadata("atomic-undo").actorId,
    createId: () => "command:atomic-undo",
    now: () => metadata("atomic-undo").timestamp,
  });
  return { after: after.document, cut, inverse };
}

it("restores 5200+ objects as one validated multi-command Undo group preserving order and all seeded groups", () => {
  const source = fixture(5_200);
  const { after, cut, inverse } = makeCut(source);
  const checker = new CollaborativeUndoAvailability();
  const planned = checker.prepareCommittedCut(cut, inverse);
  expect(planned).not.toBe(false);
  expect(planned).toBeDefined();
  if (!planned) throw new Error("Restore was not planned");
  expect(planned.length).toBeGreaterThan(1);
  expect(planned.length).toBeLessThanOrEqual(100);
  expect(Object.isFrozen(planned)).toBe(true);
  expect(checker.stillApplies(after, planned)).toBe(true);
  let current = after;
  for (const command of planned) {
    expect(command.kind).toBe("core.clipboard.paste");
    const result = core.reduceBoardDocument(current, command);
    if (!result.ok) throw new Error(result.error.message);
    current = result.document;
  }
  expect(current.order).toEqual(source.order);
  expect(current.objects).toEqual(source.objects);
  expect(current.groups).toEqual(source.groups);
  expect(current.geometryImports).toEqual(source.geometryImports);
  expect(current.solidModels).toEqual(source.solidModels);

  // Peer collisions must invalidate the whole Undo before durable admission.
  const colliding = core.reduceBoardDocument(after, {
    ...metadata("peer"),
    kind: "core.objects.add",
    objects: [source.objects[source.order[0]!]!],
  });
  if (!colliding.ok) throw new Error(colliding.error.message);
  expect(checker.stillApplies(colliding.document, planned)).toBe(false);
});

it("keeps large groups indivisible and refuses an unsafe partial restoration", () => {
  const source = fixture(5_200, true);
  const { cut, inverse } = makeCut(source);
  const checker = new CollaborativeUndoAvailability();
  expect(checker.prepareCommittedCut(cut, inverse)).toBe(false);
  const paste = inverse[0];
  if (paste?.kind !== "core.clipboard.paste") throw new Error("Missing paste");
  expect(planAtomicClearRestore(paste)).toBeNull();
});

it("preserves old single-command Undo and its collision certificate", () => {
  const source = emptyDocument();
  const added = core.reduceBoardDocument(source, {
    ...metadata("add-one"),
    kind: "core.objects.add",
    objects: [rectangle("single")],
  });
  if (!added.ok) throw new Error(added.error.message);
  const { cut, inverse, after } = makeCut(added.document);
  const checker = new CollaborativeUndoAvailability();
  expect(checker.prepareCommittedCut(cut, inverse)).toBe(inverse);
  expect(checker.stillApplies(after, inverse)).toBe(true);
});
