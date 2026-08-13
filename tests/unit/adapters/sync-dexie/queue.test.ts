import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DexiePendingBoardCommandQueue } from "../../../../src/adapters/persistence-dexie/public";
import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
} from "../../../../src/core/public";
import { boardDocumentSha256 } from "../../../../src/modules/server-sync/public";

const queues: DexiePendingBoardCommandQueue[] = [];

function createQueue() {
  const queue = new DexiePendingBoardCommandQueue(
    `tutorboard-sync-test-${crypto.randomUUID()}`,
  );
  queues.push(queue);
  return queue;
}

afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.deleteDatabase()));
});

describe("Dexie pending board command queue", () => {
  it("persists ordered commands and acknowledges one item", async () => {
    const queue = createQueue();
    const expectedDocumentId = documentId("document:lesson-1");
    const first = await queue.enqueue(expectedDocumentId, "client:first", {
      actorId: actorId("user:tutor"),
      id: commandId("command:first"),
      kind: "core.document.rename",
      timestamp: "2026-07-28T18:00:00.000Z",
      title: "First",
    });
    await queue.enqueue(expectedDocumentId, "client:second", {
      actorId: actorId("user:tutor"),
      id: commandId("command:second"),
      kind: "core.document.rename",
      timestamp: "2026-07-28T18:01:00.000Z",
      title: "Second",
    });

    const queued = await queue.list(expectedDocumentId);
    expect(queued.map((item) => item.sequence)).toEqual([1, 2]);
    await queue.acknowledge(expectedDocumentId, first.sequence);
    const remaining = await queue.list(expectedDocumentId);
    expect(remaining.map((item) => item.idempotencyKey)).toEqual([
      "client:second",
    ]);
    await queue.reconcile(
      expectedDocumentId,
      remaining,
      queued.map(({ sequence }) => sequence),
    );
    const second = remaining[0];
    if (second === undefined) {
      throw new Error("Expected the second queued command.");
    }
    await queue.acknowledge(expectedDocumentId, second.sequence);
    expect(await queue.list(expectedDocumentId)).toEqual([]);
  });

  it("round-trips a confirmed server head", async () => {
    const queue = createQueue();
    const expectedDocumentId = documentId("document:lesson-1");
    const document = createEmptyBoardDocument({
      createdAt: "2026-07-28T18:00:00.000Z",
      id: expectedDocumentId,
      title: "Lesson",
    });
    const sha256 = await boardDocumentSha256(document);
    await queue.saveHead({
      document,
      documentId: expectedDocumentId,
      revision: 4,
      session: {
        actorId: actorId("user:tutor"),
        organizationId: "organization:1",
        role: "tutor",
      },
      sha256,
    });

    expect(await queue.loadHead(expectedDocumentId)).toEqual({
      document,
      documentId: expectedDocumentId,
      revision: 4,
      session: {
        actorId: "user:tutor",
        organizationId: "organization:1",
        role: "tutor",
      },
      sha256,
    });
  });
});
