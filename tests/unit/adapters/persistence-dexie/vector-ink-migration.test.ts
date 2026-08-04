import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DexieBoardDocumentRepository } from "../../../../src/adapters/persistence-dexie/public";
import {
  createEmptyBoardDocument,
  documentId,
  persistenceOperationId,
} from "../../../../src/core/public";

const repositories: DexieBoardDocumentRepository[] = [];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function replaceSerializedRevision(
  databaseName: string,
  serializedDocument: string,
): Promise<void> {
  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction("revisions", "readwrite");
    const store = transaction.objectStore("revisions");
    const revisions = await requestResult(store.getAll());
    for (const revision of revisions as Array<Record<string, unknown>>) {
      store.put({ ...revision, serializedDocument });
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
    repositories.splice(0).map((repository) => repository.deleteDatabase()),
  );
});

describe("Vector Ink persistence migration", () => {
  it("loads a stored BoardDocument 1.1 stroke as canonical 1.2 ink", async () => {
    const databaseName = `tutorboard-vector-ink-${crypto.randomUUID()}`;
    const repository = new DexieBoardDocumentRepository(databaseName);
    repositories.push(repository);
    const current = createEmptyBoardDocument({
      createdAt: "2026-08-04T12:00:00.000Z",
      id: documentId("document-vector-ink-persistence"),
      title: "Vector Ink persistence",
    });
    await repository.save({
      document: current,
      expectedRevisionId: null,
      operationId: persistenceOperationId("operation-vector-ink-seed"),
      savedAt: "2026-08-04T12:01:00.000Z",
    });
    repository.close();

    const legacy = {
      ...current,
      objects: {
        "object:legacy": {
          groupId: null,
          id: "object:legacy",
          kind: "drawing.pen-stroke",
          locked: false,
          points: [
            { x: 0, y: 0 },
            { x: 30, y: 12 },
            { x: 60, y: 0 },
          ],
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          source: { kind: "user" },
          style: {
            fill: null,
            opacity: 1,
            stroke: "#245d6b",
            strokeWidth: 3,
          },
          visible: true,
        },
      },
      order: ["object:legacy"],
      schemaVersion: "1.1",
    };
    await replaceSerializedRevision(databaseName, JSON.stringify(legacy));

    const reopened = new DexieBoardDocumentRepository(databaseName);
    repositories.push(reopened);
    const loaded = await reopened.load(current.id);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.document.schemaVersion).toBe("1.2");
    const stroke = loaded.document.objects["object:legacy"];
    expect(stroke?.kind).toBe("drawing.pen-stroke");
    if (stroke?.kind !== "drawing.pen-stroke") return;
    expect(stroke.ink?.version).toBe("1.0");
    expect(stroke.ink?.samples).toHaveLength(3);
  });
});
