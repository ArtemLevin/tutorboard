import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DexieBoardDocumentRepository } from "../../../../src/adapters/persistence-dexie/public";
import {
  createEmptyBoardDocument,
  documentId,
  localRevisionId,
  persistenceOperationId,
  type BoardDocument,
} from "../../../../src/core/public";

const repositories: DexieBoardDocumentRepository[] = [];

function createRepository() {
  const repository = new DexieBoardDocumentRepository(
    `tutorboard-test-${crypto.randomUUID()}`,
  );
  repositories.push(repository);
  return repository;
}

function testDocument(title = "Local board"): BoardDocument {
  return createEmptyBoardDocument({
    createdAt: "2026-07-24T07:00:00.000Z",
    id: documentId("document:local-board"),
    title,
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function corruptAllRevisions(databaseName: string): Promise<void> {
  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction("revisions", "readwrite");
    const store = transaction.objectStore("revisions");
    const revisions = await requestResult(store.getAll());
    for (const revision of revisions as Array<Record<string, unknown>>) {
      store.put({ ...revision, serializedDocument: "{" });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("IndexedDB transaction aborted."),
        );
    });
  } finally {
    database.close();
  }
}

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((item) => item.deleteDatabase()),
  );
});

describe("DexieBoardDocumentRepository", () => {
  it("restores the exact saved document and viewport", async () => {
    const repository = createRepository();
    const document = {
      ...testDocument(),
      viewport: { offset: { x: 340, y: -120 }, zoom: 1.75 },
    } satisfies BoardDocument;
    const saved = await repository.save({
      document,
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation:first"),
      savedAt: "2026-07-24T08:00:00.000Z",
    });
    expect(saved.status).toBe("saved");

    const loaded = await repository.load(document.id);
    expect(loaded.status).toBe("restored");
    if (loaded.status === "restored") {
      expect(loaded.document).toEqual(document);
    }
  });

  it("deduplicates a retry by durable operation identity", async () => {
    const repository = createRepository();
    const input = {
      document: testDocument(),
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation:retry"),
      savedAt: "2026-07-24T08:00:00.000Z",
    } as const;

    const first = await repository.save(input);
    const retry = await repository.save(input);

    expect(first.status).toBe("saved");
    expect(retry).toEqual({
      duplicate: true,
      revisionId: localRevisionId("revision:operation:retry"),
      status: "saved",
    });
    const diagnostics = await repository.diagnose(
      input.document.id,
      "2026-07-24T09:00:00.000Z",
    );
    expect(diagnostics.revisions).toHaveLength(1);
  });

  it("rejects stale expected revisions without overwriting", async () => {
    const repository = createRepository();
    const first = await repository.save({
      document: testDocument("First"),
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation:first"),
      savedAt: "2026-07-24T08:00:00.000Z",
    });
    expect(first.status).toBe("saved");

    const conflict = await repository.save({
      document: testDocument("Stale"),
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation:stale"),
      savedAt: "2026-07-24T08:01:00.000Z",
    });
    expect(conflict).toEqual({
      currentRevisionId: localRevisionId("revision:operation:first"),
      status: "conflict",
    });
  });

  it("opens recovery UI state when no stored revision is readable", async () => {
    const databaseName = `tutorboard-test-${crypto.randomUUID()}`;
    const repository = new DexieBoardDocumentRepository(databaseName);
    repositories.push(repository);
    const saved = await repository.save({
      document: testDocument(),
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation:corrupt"),
      savedAt: "2026-07-24T08:00:00.000Z",
    });
    expect(saved.status).toBe("saved");
    repository.close();
    await corruptAllRevisions(databaseName);

    const reopenedRepository = new DexieBoardDocumentRepository(databaseName);
    repositories.push(reopenedRepository);
    const loaded = await reopenedRepository.load(
      documentId("document:local-board"),
    );
    expect(loaded.status).toBe("recovery-required");
    if (loaded.status === "recovery-required") {
      expect(loaded.recovery.raw).toBe("{");
      expect(loaded.recovery.reason).toBe("invalid-json");
    }
  });
});
