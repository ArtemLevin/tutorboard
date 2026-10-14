import { expect, it } from "vitest";
import * as core from "../../../src/core/public";
import {
  CollaborativeUndoAvailability,
  sameUndoContent,
} from "../../../src/app/board/collaborative-undo-availability";
import { invertOwnBoardCommand } from "../../../src/modules/server-sync/public";
import {
  copyBoardSelection,
  createCutContentCommand,
  createPasteContentCommand,
} from "../../../src/modules/clipboard/public";
import {
  emptyDocument,
  rectangle,
  metadata,
  loadCurrentBoardFixture,
  loadCurrentGeometryImportFixture,
} from "../core/helpers";
import { createDenseBoardDocument } from "../../fixtures/dense-board";
import {
  createTextShapePlacementCommand,
  textShapeCatalog,
} from "../../../src/modules/text-shape-placement/public";
function changed(
  document: core.BoardDocument,
  command: core.BoardCommand,
): core.BoardDocument {
  const result = core.reduceBoardDocument(document, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
function prepared(source: core.BoardDocument) {
  const copied = copyBoardSelection(source, source.order);
  if (copied.status !== "ok") throw new Error("Missing clipboard source");
  const cut = createCutContentCommand(copied.payload, metadata("clear"));
  const after = changed(source, cut);
  const inverse = invertOwnBoardCommand(cut, source, {
    actorId: metadata("undo").actorId,
    createId: () => "command:undo",
    now: () => metadata("undo").timestamp,
  });
  const checker = new CollaborativeUndoAvailability();
  const registered = checker.registerCommittedCut(cut, inverse);
  return { source, after, inverse, checker, copied, registered };
}
it.each([false, true])(
  "matches full reducer collision decisions for a generated clear; geometry=%s",
  (geometry) => {
    const read = core.readBoardDocument(
      geometry ? loadCurrentGeometryImportFixture() : loadCurrentBoardFixture(),
    );
    if (read.status !== "ok") throw new Error("Invalid fixture");
    const p = prepared(read.document);
    expect(p.registered).toBe(true);
    const unrelated = changed(p.after, {
      ...metadata("remote"),
      kind: "core.objects.add",
      objects: [rectangle("remote")],
    });
    for (const doc of [p.after, unrelated, p.source]) {
      const reference = core.reduceBoardDocument(doc, p.inverse[0]!);
      expect(p.checker.stillApplies(doc, p.inverse)).toBe(reference.ok);
    }
    const remapped = createPasteContentCommand(
      p.copied.payload,
      metadata("remote-remap"),
      {
        object: (id) => core.boardObjectId(`remote:${id}`),
        group: (id) => core.groupId(`remote:${id}`),
        geometryImport: (id) =>
          geometry
            ? core.geometryImportId(id)
            : core.geometryImportId(`remote:${id}`),
      },
    );
    const remote = changed(p.after, remapped);
    expect(p.checker.stillApplies(remote, p.inverse)).toBe(!geometry);
    expect(core.reduceBoardDocument(remote, p.inverse[0]!).ok).toBe(!geometry);
  },
);
it("detects a group ID collision without an object ID collision", () => {
  const read = core.readBoardDocument(loadCurrentBoardFixture());
  if (read.status !== "ok") throw new Error("Invalid fixture");
  const p = prepared(read.document);
  const group = Object.values(p.source.groups)[0];
  if (!group) throw new Error("Missing group");
  const object = rectangle("remote");
  const remote = changed(
    changed(p.after, {
      ...metadata("new-object"),
      kind: "core.objects.add",
      objects: [object],
    }),
    {
      ...metadata("new-group"),
      kind: "core.groups.add",
      group: { ...group, objectIds: [object.id] },
    },
  );
  expect(p.checker.stillApplies(remote, p.inverse)).toBe(false);
  expect(core.reduceBoardDocument(remote, p.inverse[0]!).ok).toBe(false);
});
it("detects a solid ID collision without object or group ID collisions", () => {
  const source = changed(
    emptyDocument(),
    createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition: textShapeCatalog.find(({ id }) => id === "cube")!,
      metadata: metadata("cube"),
      placement: { x: 120, y: 80 },
      token: "cube",
    }),
  );
  const p = prepared(source);
  expect(p.registered).toBe(true);
  const remote = changed(
    p.after,
    createPasteContentCommand(p.copied.payload, metadata("remote-solid"), {
      object: (id) => core.boardObjectId(`remote:${id}`),
      group: (id) => core.groupId(`remote:${id}`),
      geometryImport: (id) => core.geometryImportId(`remote:${id}`),
      solid3D: (id) => core.solid3DId(id),
    }),
  );
  expect(p.checker.stillApplies(remote, p.inverse)).toBe(false);
  expect(core.reduceBoardDocument(remote, p.inverse[0]!).ok).toBe(false);
});
it("retains full validation for unregistered inverses", () => {
  const source = changed(emptyDocument(), {
    ...metadata("add"),
    kind: "core.objects.add",
    objects: [rectangle("source")],
  });
  const p = prepared(source);
  const unregistered = [...p.inverse];
  expect(
    new CollaborativeUndoAvailability().stillApplies(p.after, unregistered),
  ).toBe(true);
  const invalid = [
    {
      ...p.inverse[0]!,
      kind: "core.clipboard.paste" as const,
      objects: [{ ...rectangle("invalid"), size: { width: -1, height: 1 } }],
      groups: [],
      geometryImports: [],
    },
  ];
  expect(
    new CollaborativeUndoAvailability().stillApplies(p.after, invalid),
  ).toBe(false);
});
it.each([1000, 3000, 10000])(
  "never trial-restores a generated %s-stroke inverse",
  (strokeCount) => {
    const read = core.readBoardDocument(
      createDenseBoardDocument({
        strokeCount,
        staticCount: 0,
        strokeGeometry: "varied",
      }),
    );
    if (read.status !== "ok") throw new Error("Invalid fixture");
    const p = prepared(read.document);
    expect(p.registered).toBe(strokeCount === 1000);
    const start = performance.now();
    for (let index = 0; index < 100; index++)
      expect(p.checker.stillApplies(p.after, p.inverse)).toBe(
        strokeCount === 1000,
      );
    console.info(
      "CLEAR_UNDO_AVAILABILITY",
      JSON.stringify({
        strokeCount,
        checks: 100,
        ms: performance.now() - start,
      }),
    );
    expect(Object.isFrozen(p.inverse)).toBe(strokeCount === 1000);
  },
);
it("skips metadata-only changes but distinguishes changed content and document identity", () => {
  const source = emptyDocument();
  expect(
    sameUndoContent(source, {
      ...source,
      title: "Other",
      viewport: { offset: { x: 1, y: 0 }, zoom: 2 },
    }),
  ).toBe(true);
  expect(
    sameUndoContent(source, {
      ...source,
      id: core.documentId("document:other"),
    }),
  ).toBe(false);
  expect(sameUndoContent(source, { ...source, objects: {} })).toBe(false);
});
