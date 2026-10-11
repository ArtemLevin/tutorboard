import { describe, expect, it } from "vitest";

import {
  createEmptyBoardDocument,
  documentId,
  readBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
} from "../../../../src/core/public";
import { WorkerSerializationCache } from "../../../../src/adapters/board-document-worker/serialization-cache";
import { createDenseBoardDocument } from "../../../fixtures/dense-board";

function document(): BoardDocument {
  return createEmptyBoardDocument({
    createdAt: "2026-10-11T10:00:00.000Z",
    id: documentId("document:versioned-worker"),
    title: "Versioned Worker",
  });
}

describe("S6.4-B WorkerSerializationCache", () => {
  it("serializes compact viewport deltas identically to the canonical full serializer", () => {
    const cache = new WorkerSerializationCache();
    const initial = document();
    const first = cache.serialize({
      document: initial,
      id: 1,
      kind: "serialize",
    });
    expect(first).toEqual({
      id: 1,
      kind: "serialize",
      result: serializeBoardDocument(initial),
    });

    const updated: BoardDocument = {
      ...initial,
      updatedAt: "2026-10-11T10:01:00.000Z",
      viewport: { zoom: 2, offset: { x: 40, y: -15 } },
    };
    const delta = cache.serialize({
      baseVersion: 1,
      documentId: updated.id,
      id: 2,
      kind: "serialize-viewport",
      updatedAt: updated.updatedAt,
      viewport: updated.viewport,
    });
    expect(delta).toEqual({
      id: 2,
      kind: "serialize",
      result: serializeBoardDocument(updated),
    });
    // A later delta still references the original version, not a
    // mutated cache; no second full snapshot is retained.
    expect(
      cache.serialize({
        baseVersion: 1,
        documentId: initial.id,
        id: 3,
        kind: "serialize-viewport",
        updatedAt: initial.updatedAt,
        viewport: initial.viewport,
      }),
    ).toEqual({
      id: 3,
      kind: "serialize",
      result: serializeBoardDocument(initial),
    });
  });

  it("retains canonical bytes with dense ink and embedded media", () => {
    const loaded = readBoardDocument(
      createDenseBoardDocument({ strokeCount: 128, staticCount: 2 }),
    );
    if (loaded.status !== "ok") throw new Error("Invalid dense test fixture");
    const original = loaded.document;
    const serialized = serializeBoardDocument(original);
    expect(serialized.ok).toBe(true);
    const cache = new WorkerSerializationCache();
    const seed = cache.serialize({
      document: original,
      id: 40,
      kind: "serialize",
    });
    expect(seed).toMatchObject({ kind: "serialize", result: { ok: true } });

    const changed: BoardDocument = {
      ...original,
      updatedAt: "2026-10-11T16:30:00.000Z",
      viewport: { zoom: 1.7, offset: { x: 190, y: -74 } },
    };
    const smallRequest = {
      baseVersion: 40,
      documentId: original.id,
      id: 41,
      kind: "serialize-viewport" as const,
      updatedAt: changed.updatedAt,
      viewport: changed.viewport,
    };
    const delta = cache.serialize(smallRequest);
    expect(delta).toEqual({
      id: 41,
      kind: "serialize",
      result: serializeBoardDocument(changed),
    });
    if (serialized.ok) {
      expect(JSON.stringify(smallRequest).length * 20).toBeLessThan(
        serialized.json.length,
      );
    }
  });

  it("rejects stale versions and foreign document IDs", () => {
    const cache = new WorkerSerializationCache();
    const original = document();
    cache.serialize({ document: original, id: 11, kind: "serialize" });
    for (const [baseVersion, id] of [
      [10, original.id],
      [11, documentId("document:foreign")],
    ] as const) {
      expect(
        cache.serialize({
          baseVersion,
          documentId: id,
          id: 12,
          kind: "serialize-viewport",
          updatedAt: original.updatedAt,
          viewport: original.viewport,
        }),
      ).toMatchObject({ kind: "failure", code: "cache-miss" });
    }
    cache.serialize({ document: original, id: 20, kind: "serialize" });
    expect(
      cache.serialize({
        baseVersion: 11,
        documentId: original.id,
        id: 21,
        kind: "serialize-viewport",
        updatedAt: original.updatedAt,
        viewport: original.viewport,
      }),
    ).toMatchObject({ kind: "failure", code: "cache-miss" });
  });

  it("evicts earlier document snapshots across repeated content versions", () => {
    const cache = new WorkerSerializationCache();
    const original = document();
    for (let version = 1; version <= 64; version += 1) {
      const changed: BoardDocument = {
        ...original,
        title: `Content version ${version}`,
      };
      expect(
        cache.serialize({
          document: changed,
          id: version,
          kind: "serialize",
        }),
      ).toMatchObject({ kind: "serialize", result: { ok: true } });
    }

    const old = cache.serialize({
      baseVersion: 1,
      documentId: original.id,
      id: 65,
      kind: "serialize-viewport",
      updatedAt: original.updatedAt,
      viewport: original.viewport,
    });
    expect(old).toMatchObject({ kind: "failure", code: "cache-miss" });
    const current = cache.serialize({
      baseVersion: 64,
      documentId: original.id,
      id: 66,
      kind: "serialize-viewport",
      updatedAt: original.updatedAt,
      viewport: original.viewport,
    });
    expect(current).toMatchObject({ kind: "serialize", result: { ok: true } });
  });

  it("invalidates on a failed full seed and rejects invalid delta content", () => {
    const cache = new WorkerSerializationCache();
    const original = document();
    cache.serialize({ document: original, id: 1, kind: "serialize" });
    const bad = { ...original, title: "" } as BoardDocument;
    expect(
      cache.serialize({ document: bad, id: 2, kind: "serialize" }),
    ).toMatchObject({ kind: "serialize", result: { ok: false } });
    expect(
      cache.serialize({
        baseVersion: 1,
        documentId: original.id,
        id: 3,
        kind: "serialize-viewport",
        viewport: original.viewport,
        updatedAt: original.updatedAt,
      }),
    ).toMatchObject({ kind: "failure", code: "cache-miss" });

    cache.serialize({ document: original, id: 4, kind: "serialize" });
    const invalid = cache.serialize({
      baseVersion: 4,
      documentId: original.id,
      id: 5,
      kind: "serialize-viewport",
      updatedAt: original.updatedAt,
      viewport: { offset: { x: 0, y: 0 }, zoom: -1 },
    });
    expect(invalid).toMatchObject({ kind: "serialize", result: { ok: false } });
    expect(
      cache.serialize({
        baseVersion: 4,
        documentId: original.id,
        id: 6,
        kind: "serialize-viewport",
        updatedAt: original.updatedAt,
        viewport: original.viewport,
      }),
    ).toMatchObject({ kind: "serialize", result: { ok: true } });
  });
});
