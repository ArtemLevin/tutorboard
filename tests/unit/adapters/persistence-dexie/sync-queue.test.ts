import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  DexiePendingBoardCommandQueue,
  type QuarantinedPendingBoardCommand,
} from "../../../../src/adapters/persistence-dexie/public";
import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  type BoardCommand,
  type ConfirmedBoardHead,
  type DocumentId,
} from "../../../../src/core/public";
import { boardDocumentSha256 } from "../../../../src/modules/server-sync/public";

const queues: DexiePendingBoardCommandQueue[] = [];
const databaseNames = new Set<string>();

function createQueue(databaseName = `sync-queue-${crypto.randomUUID()}`) {
  databaseNames.add(databaseName);
  const queue = new DexiePendingBoardCommandQueue(databaseName);
  queues.push(queue);
  return queue;
}

function command(index: number): BoardCommand {
  return {
    actorId: actorId("actor:queue-test"),
    id: commandId(`command:queue-test:${index}`),
    kind: "core.viewport.set",
    timestamp: `2026-08-05T07:0${index}:00.000Z`,
    viewport: {
      offset: { x: index * 10, y: -index },
      zoom: 1 + index / 10,
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function mutatePending(
  databaseName: string,
  activeDocumentId: DocumentId,
  sequence: number,
  mutate: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction("pending", "readwrite");
    const store = transaction.objectStore("pending");
    const raw = await requestResult(store.get([activeDocumentId, sequence]));
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Expected a pending command record.");
    }
    store.put(mutate(raw as Record<string, unknown>));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function insertLegacyPending(
  databaseName: string,
  activeDocumentId: DocumentId,
  value: BoardCommand,
): Promise<void> {
  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction("pending", "readwrite");
    transaction.objectStore("pending").put({
      commandJson: JSON.stringify(value),
      documentId: activeDocumentId,
      idempotencyKey: "legacy-key",
      sequence: 1,
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function readPendingRecord(
  databaseName: string,
  activeDocumentId: DocumentId,
  sequence: number,
): Promise<Record<string, unknown>> {
  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction("pending", "readonly");
    const raw = await requestResult(
      transaction.objectStore("pending").get([activeDocumentId, sequence]),
    );
    await transactionDone(transaction);
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Expected a pending command record.");
    }
    return raw as Record<string, unknown>;
  } finally {
    database.close();
  }
}

async function deleteDatabase(databaseName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB deletion failed."));
    request.onblocked = () => reject(new Error("IndexedDB deletion blocked."));
  });
}

afterEach(async () => {
  for (const queue of queues.splice(0)) queue.close();
  await Promise.all([...databaseNames].map(deleteDatabase));
  databaseNames.clear();
});

describe("DexiePendingBoardCommandQueue integrity", () => {
  it("stores canonical commands with hash and monotonic Lamport metadata", async () => {
    const databaseName = `sync-queue-${crypto.randomUUID()}`;
    const activeDocumentId = documentId("document:queue-integrity");
    const queue = createQueue(databaseName);

    await queue.enqueue(activeDocumentId, "key:1", command(1), {
      baseRevisionAtCreation: 7,
    });
    await queue.enqueue(activeDocumentId, "key:2", command(2), {
      baseRevisionAtCreation: 7,
    });
    queue.close();

    const first = await readPendingRecord(databaseName, activeDocumentId, 1);
    const second = await readPendingRecord(databaseName, activeDocumentId, 2);
    expect(first).toMatchObject({
      baseRevisionAtCreation: 7,
      commandSchemaVersion: "1.0",
      lamport: 8,
      schemaVersion: "2",
    });
    expect(second).toMatchObject({ lamport: 9, schemaVersion: "2" });
    expect(first.commandSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("migrates a readable legacy command lazily into queue schema v2", async () => {
    const databaseName = `sync-queue-${crypto.randomUUID()}`;
    const activeDocumentId = documentId("document:queue-legacy");
    const initial = createQueue(databaseName);
    await initial.list(activeDocumentId);
    initial.close();
    await insertLegacyPending(databaseName, activeDocumentId, command(1));

    const reopened = createQueue(databaseName);
    await expect(reopened.list(activeDocumentId)).resolves.toMatchObject([
      { idempotencyKey: "legacy-key", sequence: 1 },
    ]);
    reopened.close();

    const stored = await readPendingRecord(databaseName, activeDocumentId, 1);
    expect(stored).toMatchObject({
      actorId: "actor:queue-test",
      commandSchemaVersion: "1.0",
      lamport: 1,
      schemaVersion: "2",
    });
    expect(stored.commandSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("quarantines a corrupted command and every dependent record", async () => {
    const databaseName = `sync-queue-${crypto.randomUUID()}`;
    const activeDocumentId = documentId("document:queue-corrupt");
    const initial = createQueue(databaseName);
    await initial.enqueue(activeDocumentId, "key:1", command(1));
    await initial.enqueue(activeDocumentId, "key:2", command(2));
    initial.close();
    await mutatePending(databaseName, activeDocumentId, 1, (record) => ({
      ...record,
      commandJson: "{",
    }));

    const reopened = createQueue(databaseName);
    await expect(reopened.list(activeDocumentId)).resolves.toEqual([]);
    const quarantined = await reopened.listQuarantined(activeDocumentId);
    expect(quarantined).toHaveLength(2);
    expect(quarantined.map(({ reason }) => reason)).toEqual([
      "invalid-json",
      "dependency-gap",
    ]);
    await expect(reopened.list(activeDocumentId)).resolves.toEqual([]);
    await expect(
      reopened.listQuarantined(activeDocumentId),
    ).resolves.toHaveLength(2);
  });

  it("detects command hash substitution before replay", async () => {
    const databaseName = `sync-queue-${crypto.randomUUID()}`;
    const activeDocumentId = documentId("document:queue-hash");
    const initial = createQueue(databaseName);
    await initial.enqueue(activeDocumentId, "key:hash", command(1));
    initial.close();
    await mutatePending(databaseName, activeDocumentId, 1, (record) => ({
      ...record,
      commandSha256: "0".repeat(64),
    }));

    const reopened = createQueue(databaseName);
    await expect(reopened.list(activeDocumentId)).resolves.toEqual([]);
    const quarantined: readonly QuarantinedPendingBoardCommand[] =
      await reopened.listQuarantined(activeDocumentId);
    expect(quarantined).toMatchObject([
      { reason: "command-hash-mismatch", sequence: 1 },
    ]);
  });

  it("verifies the cached confirmed-head document checksum", async () => {
    const activeDocumentId = documentId("document:queue-head");
    const document = createEmptyBoardDocument({
      createdAt: "2026-08-05T07:00:00.000Z",
      id: activeDocumentId,
      title: "Integrity head",
    });
    const queue = createQueue();
    const head: ConfirmedBoardHead = {
      document,
      documentId: activeDocumentId,
      revision: 4,
      session: {
        actorId: actorId("actor:queue-test"),
        organizationId: "organization:test",
        role: "tutor",
      },
      sha256: await boardDocumentSha256(document),
    };

    await queue.saveHead(head);
    await expect(queue.loadHead(activeDocumentId)).resolves.toEqual(head);
    await expect(
      queue.saveHead({ ...head, sha256: "0".repeat(64) }),
    ).rejects.toThrow("checksum mismatch");
  });
});
