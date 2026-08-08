import { describe, expect, it } from "vitest";

import {
  boardCommandKinds,
  boardObjectId,
  createEmptyBoardDocument,
  deserializeBoardDocument,
  documentId,
  geometryImportId,
  readBoardDocument,
  selectOrderedObjects,
  serializeBoardDocument,
  validateBoardDocument,
  type BoardDocument,
} from "../../../src/core/public";
import {
  loadBoardFixture,
  loadCurrentBoardFixture,
  loadCurrentGeometryImportFixture,
  loadStableBoardFixture,
} from "./helpers";

describe("BoardDocument 1.3", () => {
  it("accepts the canonical fixture and uses order as z-order", () => {
    const result = readBoardDocument(loadStableBoardFixture());

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.document.schemaVersion).toBe("1.3");
      expect(selectOrderedObjects(result.document).map(({ id }) => id)).toEqual(
        ["object:line-01", "object:rectangle-01"],
      );
    }
  });

  it("migrates 0.1 without changing IDs, order or objects", () => {
    const raw = loadBoardFixture();
    const originalObjects = structuredClone(raw.objects);
    const originalOrder = structuredClone(raw.order);

    const result = readBoardDocument(raw);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.document.schemaVersion).toBe("1.3");
      expect(result.document.objects).toEqual(originalObjects);
      expect(result.document.order).toEqual(originalOrder);
    }
    expect(raw.schemaVersion).toBe("0.1");
  });

  it("migrates 0.2 through the explicit compatibility step", () => {
    const raw = loadCurrentBoardFixture();
    raw.schemaVersion = "0.2";

    const result = readBoardDocument(raw);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.document.schemaVersion).toBe("1.3");
    }
  });

  it("rejects duplicate, missing, and omitted order references", () => {
    const duplicate = loadCurrentBoardFixture();
    duplicate.order = ["object:line-01", "object:line-01", "object:missing"];

    const result = validateBoardDocument(duplicate);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "document.order-duplicate",
          "document.order-missing-object",
          "document.object-missing-from-order",
        ]),
      );
    }
  });

  it("never treats Object prototype properties as stored records", () => {
    const raw = loadCurrentBoardFixture();
    raw.objects = {};
    raw.groups = {};
    raw.order = ["toString"];

    const result = validateBoardDocument(raw);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ code }) => code)).toContain(
        "document.order-missing-object",
      );
    }
  });

  it("rejects broken group references", () => {
    const raw = loadCurrentBoardFixture();
    const groups = raw.groups as Record<string, Record<string, unknown>>;
    groups["group:example-01"]!.objectIds = [
      "object:rectangle-01",
      "object:missing",
    ];

    const result = validateBoardDocument(raw);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "document.group-missing-object",
          "document.object-group-reference-invalid",
        ]),
      );
    }
  });

  it("keeps incompatible schema input intact for recovery", () => {
    const raw = loadBoardFixture();
    raw.schemaVersion = "9.0";

    const result = readBoardDocument(raw);

    expect(result.status).toBe("incompatible-schema");
    if (result.status === "incompatible-schema") {
      expect(result.raw).toBe(raw);
      expect(result.schemaVersion).toBe("9.0");
    }
  });

  it("keeps unknown object kinds intact for recovery", () => {
    const raw = loadBoardFixture();
    const objects = raw.objects as Record<string, Record<string, unknown>>;
    objects["object:line-01"]!.kind = "geometry.future-conic";

    const result = readBoardDocument(raw);

    expect(result.status).toBe("incompatible-object");
    if (result.status === "incompatible-object") {
      expect(result.raw).toBe(raw);
      expect(result.objectKinds).toEqual(["geometry.future-conic"]);
    }
  });

  it("rejects runtime state instead of persisting it", () => {
    const raw = loadBoardFixture();
    raw.selection = ["object:line-01"];

    const result = readBoardDocument(raw);

    expect(result.status).toBe("invalid-document");
    if (result.status === "invalid-document") {
      expect(result.raw).toBe(raw);
      expect(
        result.issues.some(({ code }) => code === "schema.unrecognized_keys"),
      ).toBe(true);
    }
  });

  it("round-trips deterministically regardless of record insertion order", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const reversed: BoardDocument = {
      ...read.document,
      objects: Object.fromEntries(
        Object.entries(read.document.objects).reverse(),
      ),
    };
    const first = serializeBoardDocument(read.document);
    const second = serializeBoardDocument(reversed);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.json).toBe(first.json);
      const restored = deserializeBoardDocument(first.json);
      expect(restored.status).toBe("ok");
      if (restored.status === "ok") {
        expect(restored.document).toEqual(read.document);
      }
      expect(first.json).not.toContain("selection");
      expect(first.json).not.toContain("Konva");
    }
  });

  it("preserves canonical GIR and enforces one import transform owner", () => {
    const raw = loadCurrentGeometryImportFixture();
    const read = readBoardDocument(raw);

    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const serialized = serializeBoardDocument(read.document);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) {
      const restored = deserializeBoardDocument(serialized.json);
      expect(restored.status).toBe("ok");
      if (restored.status === "ok") {
        const importId = geometryImportId("import:geometry-01");
        expect(
          restored.document.geometryImports[importId]?.canonicalGir,
        ).toEqual(read.document.geometryImports[importId]?.canonicalGir);
      }
    }

    const groups = raw.groups as Record<string, Record<string, unknown>>;
    const group = groups["group:geometry-root-01"]!;
    group.transform = {
      rotation: 0,
      scale: { x: 1, y: 1 },
      translation: { x: 1, y: 0 },
    };
    const invalid = validateBoardDocument(raw);
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.issues.map(({ code }) => code)).toContain(
        "document.import-root-group-transform-not-identity",
      );
    }
  });

  it("preserves malformed JSON for recovery", () => {
    const raw = '{"schemaVersion":"0.1",';

    expect(deserializeBoardDocument(raw)).toEqual({
      status: "invalid-json",
      raw,
    });
  });

  it("does not serialize an invalid in-memory document", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const invalid = {
      ...read.document,
      order: [boardObjectId("object:missing")],
    };
    const result = serializeBoardDocument(invalid);

    expect(result.ok).toBe(false);
  });

  it("guards factory input and names every persistent command", () => {
    expect(() =>
      createEmptyBoardDocument({
        id: documentId("document:invalid-title"),
        title: "",
        createdAt: "2026-07-24T12:00:00Z",
      }),
    ).toThrow(RangeError);
    expect(() =>
      createEmptyBoardDocument({
        id: documentId("document:invalid-time"),
        title: "Board",
        createdAt: "2026-07-24",
      }),
    ).toThrow(TypeError);
    expect(() => documentId("__proto__")).toThrow("Invalid DocumentId");
    expect(boardCommandKinds.every((kind) => kind.includes("."))).toBe(true);
  });
});
