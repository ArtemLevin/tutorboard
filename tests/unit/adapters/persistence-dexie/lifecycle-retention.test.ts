import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { DexieBoardDocumentRepository } from "../../../../src/adapters/persistence-dexie/public";
import {
  createEmptyBoardDocument,
  documentId,
  localRevisionId,
  persistenceOperationId,
  serializeBoardDocument,
  type BoardDocument,
  type SaveBoardDocumentInput,
} from "../../../../src/core/public";
import * as core from "../../../../src/core/board/validation/validate";

const now = "2026-10-13T12:00:00.000Z";
function input(
  title: string,
  operation: string,
  id = "document:batch",
): SaveBoardDocumentInput {
  return {
    document: createEmptyBoardDocument({
      id: documentId(id),
      title,
      createdAt: now,
    }),
    expectedRevisionId: null,
    operationId: persistenceOperationId(operation),
    savedAt: now,
  };
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () =>
      reject(value.error ?? new Error("IndexedDB request failed"));
  });
}
async function seedLegacy(databaseName: string, document: BoardDocument) {
  const database = await request(indexedDB.open(databaseName));
  const serialized = serializeBoardDocument(document);
  if (!serialized.ok) throw new Error("Invalid fixture");
  try {
    const tx = database.transaction(["documents", "revisions"], "readwrite");
    for (let sequence = 1; sequence <= 64; sequence += 1) {
      tx.objectStore("revisions").put({
        documentId: document.id,
        documentSchemaVersion: document.schemaVersion,
        operationId: `operation:legacy:${sequence}`,
        revisionId: `revision:legacy:${sequence}`,
        savedAt: now,
        sequence,
        serializedDocument: serialized.json,
      });
    }
    tx.objectStore("documents").put({
      documentId: document.id,
      currentRevisionId: "revision:legacy:64",
      lastGoodRevisionId: "revision:legacy:64",
      nextSequence: 65,
      updatedAt: now,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
    });
  } finally {
    database.close();
  }
}

it("rolls the entire lifecycle chain back if a later operation collides", async () => {
  const repository = new DexieBoardDocumentRepository(
    `lifecycle-collision-${crypto.randomUUID()}`,
  );
  try {
    expect(
      (
        await repository.save(
          input("Other", "operation:collision", "document:other"),
        )
      ).status,
    ).toBe("saved");
    const results = await repository.saveLifecycleBatch([
      input("A", "operation:a"),
      input("B", "operation:collision"),
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.status === "failure")).toBe(true);
    expect((await repository.load(documentId("document:batch"))).status).toBe(
      "empty",
    );
    expect((await repository.load(documentId("document:other"))).status).toBe(
      "restored",
    );
  } finally {
    await repository.deleteDatabase();
  }
});

it("keeps cross-tab CAS conflicts and deduplicates an already committed lifecycle chain", async () => {
  const repository = new DexieBoardDocumentRepository(
    `lifecycle-cas-${crypto.randomUUID()}`,
  );
  try {
    const a = input("A", "operation:a"),
      b = input("B", "operation:b");
    const first = await repository.saveLifecycleBatch([a, b]);
    expect(first.every((item) => item.status === "saved")).toBe(true);
    expect(await repository.saveLifecycleBatch([a, b])).toEqual(
      first.map((item) => ({ ...item, duplicate: true })),
    );
    const stale = await repository.saveLifecycleBatch([
      input("Stale A", "operation:stale:a"),
      input("Stale B", "operation:stale:b"),
    ]);
    expect(stale.every((item) => item.status === "conflict")).toBe(true);
    const loaded = await repository.load(a.document.id);
    expect(loaded.status).toBe("restored");
    if (loaded.status === "restored") expect(loaded.document.title).toBe("B");
    expect(
      (await repository.diagnose(a.document.id, now)).revisions,
    ).toHaveLength(2);
  } finally {
    await repository.deleteDatabase();
  }
});

it("compacts a legacy database on the next save and stops recovery at the nearest valid revision", async () => {
  const name = `retention-legacy-${crypto.randomUUID()}`;
  const repository = new DexieBoardDocumentRepository(name);
  try {
    const initial = input("Legacy", "operation:initial");
    await repository.save(initial);
    await seedLegacy(name, initial.document);
    const latest = { ...initial.document, title: "Latest" };
    const saved = await repository.save({
      ...input("Latest", "operation:latest"),
      document: latest,
      expectedRevisionId: localRevisionId("revision:legacy:64"),
    });
    expect(saved.status).toBe("saved");
    expect(
      (await repository.diagnose(initial.document.id, now)).revisions,
    ).toHaveLength(8);
    const database = await request(indexedDB.open(name));
    try {
      const tx = database.transaction("revisions", "readwrite");
      const row: unknown = await request(
        tx.objectStore("revisions").get("revision:operation:latest"),
      );
      if (typeof row !== "object" || row === null)
        throw new Error("Missing revision");
      tx.objectStore("revisions").put({ ...row, serializedDocument: "{" });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
      });
    } finally {
      database.close();
    }
    const validate = vi.spyOn(core, "validateBoardDocument");
    const loaded = await repository.load(initial.document.id);
    expect(loaded.status).toBe("recovered");
    expect(validate).toHaveBeenCalledTimes(1);
    validate.mockRestore();
    if (loaded.status !== "recovered") throw new Error("Recovery failed");
    expect(loaded.revisionId).toBe("revision:legacy:64");
    expect(loaded.recovery.raw).toBe("{");
    expect(
      (
        await repository.save({
          ...input("After recovery", "operation:recovered"),
          expectedRevisionId: loaded.revisionId,
        })
      ).status,
    ).toBe("saved");
    const diagnostics = await repository.diagnose(initial.document.id, now);
    expect(diagnostics.head).toMatchObject({ nextSequence: 67 });
  } finally {
    await repository.deleteDatabase();
  }
});
