import { describe, expect, it, vi } from "vitest";

import { BoardDocumentWorkerComputation } from "../../../../src/adapters/board-document-worker/public";
import type {
  BoardDocumentWorkerRequest,
  BoardDocumentWorkerResponse,
} from "../../../../src/adapters/board-document-worker/protocol";
import {
  createEmptyBoardDocument,
  documentId,
  serializeBoardDocument,
  validateBoardDocument,
  type BoardDocument,
} from "../../../../src/core/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
} from "../../../../src/modules/history/public";
import { createDenseBoardDocument } from "../../../fixtures/dense-board";

class ControlledWorker {
  readonly requests: BoardDocumentWorkerRequest[] = [];
  readonly listeners: ((
    event: MessageEvent<BoardDocumentWorkerResponse>,
  ) => void)[] = [];
  readonly errorListeners: ((event: ErrorEvent) => void)[] = [];
  terminated = false;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<BoardDocumentWorkerResponse>) => void,
  ): void;
  addEventListener(
    ...args:
      | ["error", (event: ErrorEvent) => void]
      | ["message", (event: MessageEvent<BoardDocumentWorkerResponse>) => void]
  ): void {
    if (args[0] === "message") this.listeners.push(args[1]);
    else this.errorListeners.push(args[1]);
  }
  postMessage(request: BoardDocumentWorkerRequest): void {
    this.requests.push(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  fail(): void {
    for (const listener of this.errorListeners) {
      listener(new ErrorEvent("error", { message: "Worker failed" }));
    }
  }
  respond(index: number): void {
    const request = this.requests[index];
    if (request === undefined) throw new Error("Missing worker request");
    const data: BoardDocumentWorkerResponse = {
      id: request.id,
      kind: "serialize",
      result: serializeBoardDocument(request.document),
    };
    for (const listener of this.listeners)
      listener(new MessageEvent("message", { data }));
  }
}

function empty(title = "Empty"): BoardDocument {
  return createEmptyBoardDocument({
    id: documentId("document:dense-board"),
    title,
    createdAt: "2026-10-05T16:00:00.000Z",
  });
}

function dense(strokeCount = 300): BoardDocument {
  const parsed = validateBoardDocument(
    createDenseBoardDocument({ strokeCount, strokeGeometry: "varied" }),
  );
  if (!parsed.valid) throw new Error("Invalid fixture");
  return parsed.document;
}

describe("bounded document serialization lifecycle", () => {
  it("coalesces superseded preparations and sends the cleared document next", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const before = dense();
    computation.prepareSerialization(before);
    const firstSave = computation.serialize(before);
    for (let revision = 0; revision < 20; revision += 1) {
      computation.prepareSerialization({
        ...before,
        title: `Revision ${revision}`,
      });
    }
    const cleared = empty();
    computation.prepareSerialization(cleared);
    expect(worker.requests).toHaveLength(1);
    worker.respond(0);
    await firstSave;
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.document).toBe(cleared);
    const emptySave = computation.serialize(cleared);
    worker.respond(1);
    await expect(emptySave).resolves.toEqual(serializeBoardDocument(cleared));
    expect(worker.requests).toHaveLength(2);
    computation.dispose();
  });

  it("releases old cached JSON even while Undo retains the original document", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const before = dense();
    const first = computation.serialize(before);
    worker.respond(0);
    await first;
    const cleared = empty();
    const history = commitDocumentHistory(
      createDocumentHistory(before),
      cleared,
    );
    const saved = computation.serialize(cleared);
    worker.respond(1);
    await saved;
    expect(history.past[0]).toBe(before);
    const restoredSave = computation.serialize(before);
    expect(worker.requests).toHaveLength(3);
    worker.respond(2);
    await expect(restoredSave).resolves.toEqual(serializeBoardDocument(before));
    expect(history.past[0]?.order).toHaveLength(310);
    computation.dispose();
  });

  it("returns large results to saves without retaining them as a prepared cache", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const before = dense(1000);
    const first = computation.serialize(before);
    worker.respond(0);
    const result = await first;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.json.length * 2).toBeGreaterThan(1024 * 1024);
    const second = computation.serialize(before);
    expect(worker.requests).toHaveLength(2);
    worker.respond(1);
    await expect(second).resolves.toEqual(result);
    computation.dispose();
  });

  it("does not serialize stale speculative documents synchronously on dispose", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const serializeSync = vi.spyOn(computation, "serializeSync");
    const before = dense();
    for (let revision = 0; revision < 8; revision += 1)
      computation.prepareSerialization({
        ...before,
        title: `Revision ${revision}`,
      });
    computation.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(serializeSync).not.toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
    expect(worker.requests).toHaveLength(1);
  });

  it("settles every mandatory save for its exact snapshot despite newer preparations", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const firstDocument = empty("Required one");
    const secondDocument = empty("Required two");
    const first = computation.serialize(firstDocument);
    const second = computation.serialize(secondDocument);
    const duplicate = computation.serialize(secondDocument);
    computation.prepareSerialization(empty("Speculative latest"));
    expect(worker.requests).toHaveLength(1);
    worker.respond(0);
    await expect(first).resolves.toEqual(serializeBoardDocument(firstDocument));
    expect(worker.requests[1]?.document).toBe(secondDocument);
    worker.respond(1);
    await expect(second).resolves.toEqual(
      serializeBoardDocument(secondDocument),
    );
    await expect(duplicate).resolves.toEqual(
      serializeBoardDocument(secondDocument),
    );
    expect(worker.requests).toHaveLength(3);
    worker.respond(2);
    computation.dispose();
  });

  it("rejects active and queued saves on owner disposal without synchronous fallback", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const serializeSync = vi.spyOn(computation, "serializeSync");
    const first = expect(
      computation.serialize(empty("Active")),
    ).rejects.toThrow("disposed");
    const second = expect(
      computation.serialize(empty("Queued")),
    ).rejects.toThrow("disposed");
    computation.dispose();
    await Promise.all([first, second]);
    expect(serializeSync).not.toHaveBeenCalled();
    worker.respond(0);
    await Promise.resolve();
    expect(worker.requests).toHaveLength(1);
  });

  it("discards failed speculative work and starts the latest preparation on a new worker", async () => {
    const workers: ControlledWorker[] = [];
    const computation = new BoardDocumentWorkerComputation(() => {
      const worker = new ControlledWorker();
      workers.push(worker);
      return worker;
    });
    const serializeSync = vi.spyOn(computation, "serializeSync");
    computation.prepareSerialization(dense());
    const cleared = empty();
    computation.prepareSerialization(cleared);
    workers[0]?.fail();
    await Promise.resolve();
    await Promise.resolve();
    expect(serializeSync).not.toHaveBeenCalled();
    expect(workers[0]?.terminated).toBe(true);
    expect(workers[1]?.requests[0]?.document).toBe(cleared);
    workers[0]?.fail();
    expect(workers[1]?.terminated).toBe(false);
    const saved = computation.serialize(cleared);
    workers[1]?.respond(0);
    await expect(saved).resolves.toEqual(serializeBoardDocument(cleared));
    computation.dispose();
  });

  it("drops an obsolete queued preparation when the newest request already has a cached result", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const readyDocument = empty("Ready latest");
    computation.prepareSerialization(readyDocument);
    const required = computation.serialize(empty("Required intermediate"));
    computation.prepareSerialization(empty("Obsolete speculative"));
    const first = computation.serialize(readyDocument);
    worker.respond(0);
    await first;
    computation.prepareSerialization(readyDocument);
    worker.respond(1);
    await required;
    expect(worker.requests).toHaveLength(2);
    computation.dispose();
  });

  it("keeps the synchronous fallback for an explicitly requested save when the worker fails", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const serializeSync = vi.spyOn(computation, "serializeSync");
    const document = dense();
    const saved = computation.serialize(document);
    worker.fail();
    await expect(saved).resolves.toEqual(serializeBoardDocument(document));
    expect(serializeSync).toHaveBeenCalledOnce();
    computation.dispose();
  });

  it("cancels an in-flight hash without falling back to expensive inline work", async () => {
    const worker = new ControlledWorker();
    const computation = new BoardDocumentWorkerComputation(() => worker);
    const digest = vi.spyOn(crypto.subtle, "digest");
    try {
      const hashing = expect(computation.sha256(dense())).rejects.toThrow(
        "disposed",
      );
      computation.dispose();
      await hashing;
      expect(digest).not.toHaveBeenCalled();
    } finally {
      digest.mockRestore();
    }
  });
});
