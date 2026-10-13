import { expect, it, vi } from "vitest";
import * as validation from "../../../src/core/board/validation/validate";
import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  readBoardDocument,
  validateBoardDocument,
  type BoardCommand,
  type BoardDocument,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

const meta = {
  actorId: actorId("actor:snapshot"),
  id: commandId("command:snapshot"),
  timestamp: "2026-10-13T12:00:00.000Z",
};
function checked(document: BoardDocument, command: BoardCommand) {
  const result = reduceBoardDocument(document, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
function initial() {
  const read = validateBoardDocument(
    createDenseBoardDocument({
      strokeCount: 4,
      staticCount: 0,
      strokeGeometry: "varied",
    }),
  );
  if (!read.valid) throw new Error("Invalid fixture");
  return read.document;
}
function owned(input = initial()) {
  return checked(input, {
    ...meta,
    kind: "core.document.rename",
    title: "Owned",
  });
}

it("clones external input, freezes owned descendants and never trusts a subsequently mutated input", () => {
  const input = initial();
  const snapshot = owned(input);
  expect(Object.isFrozen(input)).toBe(false);
  expect(Object.isFrozen(input.objects)).toBe(false);
  expect(Object.isFrozen(snapshot)).toBe(true);
  const stroke = snapshot.objects[snapshot.order[0]!]!;
  expect(Object.isFrozen(stroke)).toBe(true);
  if (stroke.kind !== "drawing.pen-stroke") throw new Error("Expected stroke");
  expect(Object.isFrozen(stroke.ink?.samples[0]?.point)).toBe(true);
  expect(Reflect.set(stroke.points[0]!, "x", Infinity)).toBe(false);
  Reflect.set(input, "order", [input.order[0], input.order[0]]);
  const rejected = reduceBoardDocument(input, {
    ...meta,
    kind: "core.document.rename",
    title: "Bad input",
  });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok)
    expect(rejected.error.code).toBe("command.invalid-current-document");
  expect(validateBoardDocument(snapshot).valid).toBe(true);
});

it("shares unchanged content in owned metadata transitions and retains strict unknown-field rejection", () => {
  const original = owned();
  const next = checked(original, {
    ...meta,
    kind: "core.viewport.set",
    viewport: { offset: { x: 5, y: 8 }, zoom: 2 },
  });
  expect(next.objects).toBe(original.objects);
  expect(next.order).toBe(original.order);
  const bad = {
    ...meta,
    kind: "core.viewport.set" as const,
    viewport: { offset: { x: 0, y: 0 }, zoom: 1, unknown: true },
  };
  expect(reduceBoardDocument(next, bad)).toMatchObject({
    ok: false,
    document: next,
    error: { code: "command.invalid-result" },
  });
});

it("clones newly supplied command objects without freezing the caller payload", () => {
  const source = initial();
  const object = structuredClone(source.objects[source.order[0]!]!);
  const empty = owned(
    createEmptyBoardDocument({
      id: documentId("document:payload"),
      title: "Empty",
      createdAt: meta.timestamp,
    }),
  );
  const next = checked(empty, {
    ...meta,
    kind: "core.objects.add",
    objects: [object],
  });
  expect(Object.isFrozen(object)).toBe(false);
  expect(Object.isFrozen(next.objects[object.id])).toBe(true);
  Reflect.set(object, "position", { x: Infinity, y: 0 });
  expect(validateBoardDocument(next).valid).toBe(true);
  expect(
    reduceBoardDocument(empty, {
      ...meta,
      kind: "core.objects.add",
      objects: [object],
    }).ok,
  ).toBe(false);
});

it("rejects changed noncanonical ink and broken record keys on an owned input", () => {
  const original = owned();
  const stroke = original.objects[original.order[0]!]!;
  if (stroke.kind !== "drawing.pen-stroke" || stroke.ink === undefined)
    throw new Error("Expected ink");
  const changed = {
    ...stroke,
    ink: {
      ...stroke.ink,
      samples: stroke.ink.samples.map((sample, index) =>
        index === 0 ? { ...sample, point: { x: 999, y: 999 } } : sample,
      ),
    },
  };
  const rejected = reduceBoardDocument(original, {
    ...meta,
    kind: "core.objects.replace",
    originals: [stroke],
    replacements: [changed],
  });
  expect(rejected.ok).toBe(false);
  const forged = {
    ...original,
    objects: {
      ...original.objects,
      [boardObjectId("object:wrong-key")]: stroke,
    },
  };
  expect(
    reduceBoardDocument(forged, {
      ...meta,
      kind: "core.document.rename",
      title: "Invalid",
    }).ok,
  ).toBe(false);
});

it("validates an external root once, reuses historical owned roots and rejects frozen forgeries", () => {
  const input = initial();
  const validate = vi.spyOn(validation, "validateBoardDocument");
  try {
    const first = owned(input);
    expect(validate).toHaveBeenCalledTimes(1);
    let next = first;
    for (let index = 0; index < 40; index += 1) {
      next = checked(next, {
        ...meta,
        kind: "core.document.rename",
        title: `Revision ${index}`,
      });
    }
    const returned = checked(first, {
      ...meta,
      kind: "core.document.rename",
      title: "Returned to history",
    });
    expect(returned.objects).toBe(first.objects);
    expect(validate).toHaveBeenCalledTimes(1);
    const forged = Object.freeze({
      ...first,
      order: [first.order[0]!, first.order[0]!],
    });
    expect(
      reduceBoardDocument(forged, {
        ...meta,
        kind: "core.document.rename",
        title: "Forged",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "command.invalid-current-document" },
    });
    expect(validate).toHaveBeenCalledTimes(2);
  } finally {
    validate.mockRestore();
  }
});

it("clones viewport command payloads and keeps external readers strict", () => {
  const first = owned();
  const viewport = { offset: { x: 12, y: 34 }, zoom: 2 };
  const next = checked(first, { ...meta, kind: "core.viewport.set", viewport });
  expect(Object.isFrozen(viewport)).toBe(false);
  expect(Object.isFrozen(viewport.offset)).toBe(false);
  viewport.offset.x = Infinity;
  expect(next.viewport.offset.x).toBe(12);
  expect(validateBoardDocument({ ...next, viewport }).valid).toBe(false);
  expect(validateBoardDocument({ ...next, unexpected: true }).valid).toBe(
    false,
  );
});

it("certifies independently cloned reader output before the first interactive command", () => {
  const input = initial();
  const validate = vi.spyOn(validation, "validateBoardDocument");
  try {
    const read = readBoardDocument(input);
    if (read.status !== "ok") throw new Error("Reader rejected fixture");
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(read.document)).toBe(true);
    const next = checked(read.document, {
      ...meta,
      kind: "core.viewport.set",
      viewport: { offset: { x: 4, y: 9 }, zoom: 2 },
    });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(next.objects).toBe(read.document.objects);
    Reflect.set(input, "title", "Mutable source");
    expect(read.document.title).not.toBe("Mutable source");
  } finally {
    validate.mockRestore();
  }
});
