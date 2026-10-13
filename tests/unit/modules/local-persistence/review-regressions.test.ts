import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { DexieBoardDocumentRepository } from "../../../../src/adapters/persistence-dexie/public";
import { LocalDocumentAutosave } from "../../../../src/modules/local-persistence/public";
import {
  createEmptyBoardDocument,
  documentId,
  persistenceOperationId,
  serializeBoardDocument,
  validateBoardDocument,
  type BoardDocument,
  type BoardDocumentComputation,
  type LocalRevisionId,
} from "../../../../src/core/public";
import { createDenseBoardDocument } from "../../../fixtures/dense-board";

const now = "2026-10-13T12:00:00.000Z";
function dense(strokes: number): BoardDocument {
  const read = validateBoardDocument(
    createDenseBoardDocument({
      strokeCount: strokes,
      strokeGeometry: "varied",
      staticCount: 0,
    }),
  );
  if (!read.valid) throw new Error("Invalid audit fixture");
  return read.document;
}

it("prunes by JSON byte budget before the revision count limit", async () => {
  const document = dense(3_000);
  const repository = new DexieBoardDocumentRepository(
    `audit-byte-budget-${crypto.randomUUID()}`,
  );
  let revisionId: LocalRevisionId | null = null;
  try {
    for (let index = 0; index < 6; index += 1) {
      const saved = await repository.save({
        document: { ...document, title: `Snapshot ${index}` },
        expectedRevisionId: revisionId,
        operationId: persistenceOperationId(`operation:bytes:${index}`),
        savedAt: now,
      });
      expect(saved.status).toBe("saved");
      if (saved.status === "saved") revisionId = saved.revisionId;
    }
    const { revisions } = await repository.diagnose(document.id, now);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions.length).toBeLessThan(6);
    expect(
      revisions.reduce<number>((bytes, revision) => {
        if (
          typeof revision !== "object" ||
          revision === null ||
          !("serializedDocument" in revision) ||
          typeof revision.serializedDocument !== "string"
        )
          throw new Error("Invalid diagnostic revision");
        return bytes + revision.serializedDocument.length * 2;
      }, 0),
    ).toBeLessThanOrEqual(32 * 1024 * 1024);
    const loaded = await repository.load(document.id);
    expect(loaded.status).toBe("restored");
    if (loaded.status === "restored")
      expect(loaded.document.title).toBe("Snapshot 5");
  } finally {
    await repository.deleteDatabase();
  }
}, 120_000);

it.each([false, true])(
  "pagehide commits the newest snapshot without a blocked old Worker; debounceExpired=%s",
  async (debounceExpired) => {
    const older = createEmptyBoardDocument({
      id: documentId("document:audit-lifecycle"),
      title: "OLDER",
      createdAt: now,
    });
    const newest = { ...older, title: "NEWEST" };
    let release!: (value: ReturnType<typeof serializeBoardDocument>) => void;
    const blocked = new Promise<ReturnType<typeof serializeBoardDocument>>(
      (resolve) => {
        release = resolve;
      },
    );
    const sync = vi.fn(serializeBoardDocument);
    const computation: BoardDocumentComputation = {
      serialize: (document) =>
        document === older
          ? blocked
          : Promise.resolve(serializeBoardDocument(document)),
      serializeSync: sync,
      sha256: () => Promise.resolve({ ok: true, sha256: "0".repeat(64) }),
    };
    const repository = new DexieBoardDocumentRepository(
      `audit-lifecycle-${crypto.randomUUID()}`,
      computation,
    );
    const calls = vi.spyOn(repository, "save");
    let operation = 0;
    const autosave = new LocalDocumentAutosave({
      repository,
      debounceMs: 5,
      createOperationId: () =>
        persistenceOperationId(`operation:audit:${++operation}`),
      initialRevisionId: null,
      now: () => now,
      onStateChange: () => {},
    });
    try {
      autosave.schedule(older);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(calls).toHaveBeenCalledTimes(1);
      autosave.schedule(newest);
      if (debounceExpired)
        await new Promise((resolve) => setTimeout(resolve, 20));
      window.dispatchEvent(new Event("pagehide"));
      await vi.waitFor(async () => {
        const loaded = await repository.load(older.id);
        expect(loaded.status).toBe("restored");
        if (loaded.status === "restored")
          expect(loaded.document.title).toBe("NEWEST");
      });
      expect(sync.mock.calls.map(([document]) => document.title)).toEqual([
        "OLDER",
        "NEWEST",
      ]);
      await autosave.flush("lifecycle");
      release(serializeBoardDocument(older));
      await autosave.flush();
      const loaded = await repository.load(older.id);
      expect(loaded.status).toBe("restored");
      if (loaded.status === "restored")
        expect(loaded.document.title).toBe("NEWEST");
    } finally {
      release(serializeBoardDocument(older));
      await autosave.flush();
      autosave.dispose();
      await repository.deleteDatabase();
    }
  },
);

it("bounds full revisions and restores an empty current without reading the revision history", async () => {
  const document = dense(1_000);
  const repository = new DexieBoardDocumentRepository(
    `audit-retention-${crypto.randomUUID()}`,
  );
  let revisionId: LocalRevisionId | null = null;
  try {
    for (let index = 0; index < 64; index++) {
      const snapshot = {
        ...document,
        viewport: { ...document.viewport, offset: { x: index, y: 0 } },
      };
      const saved = await repository.save({
        document: snapshot,
        expectedRevisionId: revisionId,
        operationId: persistenceOperationId(`operation:revision:${index}`),
        savedAt: now,
      });
      expect(saved.status).toBe("saved");
      if (saved.status === "saved") revisionId = saved.revisionId;
    }
    const empty = createEmptyBoardDocument({
      id: document.id,
      title: "CLEARED",
      createdAt: now,
    });
    const saved = await repository.save({
      document: empty,
      expectedRevisionId: revisionId,
      operationId: persistenceOperationId("operation:clear"),
      savedAt: now,
    });
    expect(saved.status).toBe("saved");
    let recordsRead = 0,
      jsonCharsRead = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke the captured native method with its original store via call().
    const originalGet = IDBObjectStore.prototype.get;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(function (this: IDBObjectStore, key) {
        const request = originalGet.call(this, key);
        if (this.name === "revisions")
          request.addEventListener("success", () => {
            const value: unknown = request.result;
            if (
              typeof value === "object" &&
              value !== null &&
              "serializedDocument" in value &&
              typeof value.serializedDocument === "string"
            ) {
              recordsRead += 1;
              jsonCharsRead += value.serializedDocument.length;
            }
          });
        return request;
      });
    const historyRead = vi.spyOn(IDBIndex.prototype, "getAll");
    const started = performance.now();
    const loaded = await repository.load(document.id);
    const loadMs = performance.now() - started;
    spy.mockRestore();
    expect(historyRead).not.toHaveBeenCalled();
    historyRead.mockRestore();
    expect(loaded.status).toBe("restored");
    if (loaded.status === "restored")
      expect(loaded.document.order).toHaveLength(0);
    expect(recordsRead).toBe(1);
    expect(jsonCharsRead).toBe(JSON.stringify(empty).length);
    expect(
      (await repository.diagnose(document.id, now)).revisions,
    ).toHaveLength(8);
    console.info(
      "FIXED_RETENTION",
      JSON.stringify({
        strokes: 1000,
        fullSaves: 64,
        recordsRead,
        oldAndCurrentJsonMiB: jsonCharsRead / 1048576,
        currentJsonBytes: JSON.stringify(empty).length,
        loadMs,
      }),
    );
  } finally {
    await repository.deleteDatabase();
  }
}, 120_000);
