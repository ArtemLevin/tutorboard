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
