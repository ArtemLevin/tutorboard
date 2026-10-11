import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyBoardDocument,
  documentId,
  serializeBoardDocument,
  type BoardDocument,
} from "../../../../src/core/public";
import { BoardDocumentWorkerComputation } from "../../../../src/adapters/board-document-worker/public";

class FakeWorker extends EventTarget {
  readonly messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  fail(message: string): void {
    this.dispatchEvent(new ErrorEvent("error", { message }));
  }
}

const workerState: { current: FakeWorker | null } = { current: null };

class WorkerStub extends FakeWorker {
  constructor() {
    super();
    workerState.current = this;
  }
}

function document(): BoardDocument {
  return createEmptyBoardDocument({
    createdAt: "2026-10-06T12:00:00.000Z",
    id: documentId("document:worker-test"),
    title: "Worker test",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  workerState.current = null;
});

describe("BoardDocumentWorkerComputation", () => {
  it("prewarms serialization once and reuses the worker result", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const input = document();
    const expected = serializeBoardDocument(input);

    computation.prepareSerialization(input);
    expect(workerState.current?.messages).toHaveLength(1);
    const request = workerState.current?.messages[0];
    expect(request).toMatchObject({ kind: "serialize" });
    const id =
      typeof request === "object" &&
      request !== null &&
      "id" in request &&
      typeof request.id === "number"
        ? request.id
        : null;
    expect(id).not.toBeNull();
    workerState.current?.respond({ id, kind: "serialize", result: expected });

    await expect(computation.serialize(input)).resolves.toEqual(expected);
    expect(workerState.current?.messages).toHaveLength(1);
    computation.dispose();
  });

  it("uses synchronous serialization for lifecycle priority while prewarm is pending", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const input = document();

    computation.prepareSerialization(input);
    const result = await computation.serialize(input, "lifecycle");

    expect(result).toEqual(serializeBoardDocument(input));
    expect(workerState.current?.messages).toHaveLength(1);
    computation.dispose();
  });

  it("returns worker-computed SHA-256 and terminates cleanly", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const input = document();
    const hashing = computation.sha256(input);

    const request = workerState.current?.messages[0];
    expect(request).toMatchObject({ kind: "sha256" });
    const id =
      typeof request === "object" &&
      request !== null &&
      "id" in request &&
      typeof request.id === "number"
        ? request.id
        : null;
    workerState.current?.respond({
      id,
      kind: "sha256",
      result: { ok: true, sha256: "abc" },
    });

    await expect(hashing).resolves.toEqual({ ok: true, sha256: "abc" });
    computation.dispose();
    expect(workerState.current?.terminated).toBe(true);
  });

  it("sends a compact viewport message after a full Worker ACK", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const original = document();
    const initial = computation.serialize(original);
    const worker = workerState.current;
    expect(worker?.messages[0]).toMatchObject({
      document: original,
      kind: "serialize",
    });
    const full = worker?.messages[0] as { id: number };
    worker?.respond({
      id: full.id,
      kind: "serialize",
      result: serializeBoardDocument(original),
    });
    await expect(initial).resolves.toEqual(serializeBoardDocument(original));

    const latest: BoardDocument = {
      ...original,
      updatedAt: "2026-10-06T12:01:00.000Z",
      viewport: { zoom: 1.5, offset: { x: 30, y: 50 } },
    };
    const updated = computation.serialize(latest);
    expect(worker?.messages[1]).toEqual({
      baseVersion: full.id,
      documentId: latest.id,
      id: full.id + 1,
      kind: "serialize-viewport",
      updatedAt: latest.updatedAt,
      viewport: latest.viewport,
    });
    worker?.respond({
      id: full.id + 1,
      kind: "serialize",
      result: serializeBoardDocument(latest),
    });
    await expect(updated).resolves.toEqual(serializeBoardDocument(latest));
    computation.dispose();
  });

  it("resends the complete document after a version mismatch", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const original = document();
    const seed = computation.serialize(original);
    const worker = workerState.current;
    const full = worker?.messages[0] as { id: number };
    worker?.respond({
      id: full.id,
      kind: "serialize",
      result: serializeBoardDocument(original),
    });
    await seed;

    const latest = {
      ...original,
      updatedAt: "2026-10-06T12:02:00.000Z",
      viewport: { zoom: 1.1, offset: { x: -5, y: 2 } },
    } satisfies BoardDocument;
    const pending = computation.serialize(latest);
    const delta = worker?.messages[1] as { id: number };
    worker?.respond({
      id: delta.id,
      kind: "failure",
      code: "cache-miss",
      message: "stale version",
    });
    await vi.waitFor(() => expect(worker?.messages).toHaveLength(3));
    expect(worker?.messages[2]).toMatchObject({
      kind: "serialize",
      document: latest,
    });
    const replacement = worker?.messages[2] as { id: number };
    worker?.respond({
      id: replacement.id,
      kind: "serialize",
      result: serializeBoardDocument(latest),
    });
    await expect(pending).resolves.toEqual(serializeBoardDocument(latest));
    computation.dispose();
  });

  it("seeds a new Worker after a crash during a viewport delta", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const original = document();
    const seed = computation.serialize(original);
    const beforeCrash = workerState.current;
    const initial = beforeCrash?.messages[0] as { id: number };
    beforeCrash?.respond({
      id: initial.id,
      kind: "serialize",
      result: serializeBoardDocument(original),
    });
    await seed;

    const after: BoardDocument = {
      ...original,
      updatedAt: "2026-10-06T12:03:00.000Z",
      viewport: { zoom: 1.4, offset: { x: 15, y: -30 } },
    };
    const pending = computation.serialize(after);
    expect(beforeCrash?.messages[1]).toMatchObject({
      kind: "serialize-viewport",
    });
    beforeCrash?.fail("worker crash");
    await vi.waitFor(() => {
      expect(workerState.current).not.toBe(beforeCrash);
      expect(workerState.current?.messages).toHaveLength(1);
    });
    expect(beforeCrash?.terminated).toBe(true);
    const recovered = workerState.current;
    const full = recovered?.messages[0] as { id: number };
    expect(recovered?.messages[0]).toMatchObject({
      document: after,
      kind: "serialize",
    });
    recovered?.respond({
      id: full.id,
      kind: "serialize",
      result: serializeBoardDocument(after),
    });
    await expect(pending).resolves.toEqual(serializeBoardDocument(after));
    computation.dispose();
  });

  it("invalidates the content version on any document subtree replacement", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const original = document();
    const seed = computation.serialize(original);
    const worker = workerState.current;
    const initial = worker?.messages[0] as { id: number };
    worker?.respond({
      id: initial.id,
      kind: "serialize",
      result: serializeBoardDocument(original),
    });
    await seed;

    const changed: BoardDocument = {
      ...original,
      objects: { ...original.objects },
      updatedAt: "2026-10-06T12:04:00.000Z",
    };
    const next = computation.serialize(changed);
    expect(worker?.messages[1]).toMatchObject({
      kind: "serialize",
      document: changed,
    });
    const full = worker?.messages[1] as { id: number };
    worker?.respond({
      id: full.id,
      kind: "serialize",
      result: serializeBoardDocument(changed),
    });
    await expect(next).resolves.toEqual(serializeBoardDocument(changed));
    computation.dispose();
  });

  it("falls back to inline hashing when the worker fails", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const computation = new BoardDocumentWorkerComputation();
    const input = document();
    const hashing = computation.sha256(input);

    workerState.current?.fail("worker unavailable");

    const result = await hashing;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
    computation.dispose();
  });
});
