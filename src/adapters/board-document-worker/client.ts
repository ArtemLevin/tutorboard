import {
  serializeBoardDocument,
  type BoardDocument,
  type BoardDocumentComputation,
  type BoardDocumentComputationPriority,
  type BoardDocumentSerializationResult,
  type BoardDocumentSha256Result,
} from "../../core/public";

import type {
  BoardDocumentWorkerRequest,
  BoardDocumentWorkerResponse,
} from "./protocol";

interface WorkerLike {
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<BoardDocumentWorkerResponse>) => void,
  ): void;
  postMessage(message: BoardDocumentWorkerRequest): void;
  terminate(): void;
}

type WorkerFactory = () => WorkerLike;

interface PendingRequest {
  readonly reject: (error: Error) => void;
  readonly resolve: (response: BoardDocumentWorkerResponse) => void;
}

interface SerializationTask {
  readonly document: BoardDocument;
  readonly waiters: {
    readonly resolve: (result: BoardDocumentSerializationResult) => void;
    readonly reject: (error: Error) => void;
  }[];
}

// One small result, independent of the documents retained by Undo. Counting
// UTF-16 bytes conservatively bounds the string payload without allocating
// another encoded copy of a large JSON merely to measure it.
const maximumPreparedJsonBytes = 1024 * 1024;

function computationError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error("Board document computation failed.");
}

function disposedError(): Error {
  return new Error("Board document computation was disposed.");
}

function browserWorkerFactory(): WorkerLike {
  return new Worker(new URL("./worker.ts", import.meta.url), {
    name: "tutorboard-document-computation",
    type: "module",
  });
}

async function inlineSha256(
  document: BoardDocument,
): Promise<BoardDocumentSha256Result> {
  const serialized = serializeBoardDocument(document);
  if (!serialized.ok) {
    return { issues: serialized.issues, ok: false };
  }
  const bytes = new TextEncoder().encode(serialized.json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    ok: true,
    sha256: [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
  };
}

export class BoardDocumentWorkerComputation implements BoardDocumentComputation {
  readonly #factory: WorkerFactory;
  readonly #pending = new Map<number, PendingRequest>();
  #prepared: {
    readonly document: BoardDocument;
    readonly result: BoardDocumentSerializationResult;
  } | null = null;
  #activeSerialization: SerializationTask | null = null;
  #queuedPreparation: BoardDocument | null = null;
  readonly #requiredSerializations: SerializationTask[] = [];
  #disposed = false;
  #nextRequestId = 1;
  #worker: WorkerLike | null = null;

  constructor(factory: WorkerFactory = browserWorkerFactory) {
    this.#factory = factory;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker?.terminate();
    this.#worker = null;
    this.#prepared = null;
    this.#queuedPreparation = null;
    const error = disposedError();
    if (this.#activeSerialization !== null) {
      this.#rejectSerialization(this.#activeSerialization, error);
    }
    for (const task of this.#requiredSerializations) {
      this.#rejectSerialization(task, error);
    }
    this.#requiredSerializations.length = 0;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  prepareSerialization(document: BoardDocument): void {
    if (this.#disposed) return;
    if (this.#prepared?.document === document) {
      this.#queuedPreparation = null;
      return;
    }
    this.#prepared = null;
    // Only unsent, speculative work is replaceable. A save that joined an
    // active preparation, or explicitly requested a snapshot, must settle for
    // that exact document even if a newer document has since been prepared.
    this.#queuedPreparation =
      this.#activeSerialization?.document === document ||
      this.#requiredSerializations.some((task) => task.document === document)
        ? null
        : document;
    this.#startNextSerialization();
  }

  serialize(
    document: BoardDocument,
    priority: BoardDocumentComputationPriority = "background",
  ): Promise<BoardDocumentSerializationResult> {
    const prepared =
      this.#prepared?.document === document ? this.#prepared.result : null;
    if (priority === "lifecycle") {
      return Promise.resolve(prepared ?? this.serializeSync(document));
    }
    if (prepared !== null) return Promise.resolve(prepared);
    // Explicit calls after disposal retain the synchronous compatibility
    // path. Already pending work is cancelled by dispose, without fallback.
    if (this.#disposed) return Promise.resolve(this.serializeSync(document));
    return new Promise((resolve, reject) => {
      let task =
        this.#activeSerialization?.document === document
          ? this.#activeSerialization
          : this.#requiredSerializations.find(
              (candidate) => candidate.document === document,
            );
      if (task === undefined) {
        task = { document, waiters: [] };
        this.#requiredSerializations.push(task);
      }
      task.waiters.push({ reject, resolve });
      if (this.#queuedPreparation === document) this.#queuedPreparation = null;
      this.#startNextSerialization();
    });
  }

  serializeSync(document: BoardDocument): BoardDocumentSerializationResult {
    return serializeBoardDocument(document);
  }

  async sha256(document: BoardDocument): Promise<BoardDocumentSha256Result> {
    if (this.#disposed) return await inlineSha256(document);
    try {
      const response = await this.#request({
        document,
        id: this.#nextRequestId++,
        kind: "sha256",
      });
      if (response.kind === "sha256") return response.result;
      throw new Error(
        response.kind === "failure"
          ? response.message
          : "Unexpected document worker response.",
      );
    } catch (error) {
      if (this.#disposed) throw computationError(error);
      return await inlineSha256(document);
    }
  }

  #startNextSerialization(): void {
    if (this.#disposed || this.#activeSerialization !== null) return;
    const required = this.#requiredSerializations.shift();
    const document = required?.document ?? this.#queuedPreparation;
    if (document === null) return;
    if (this.#queuedPreparation === document) this.#queuedPreparation = null;
    const task = required ?? { document, waiters: [] };
    this.#activeSerialization = task;
    void this.#runSerialization(task);
  }

  async #runSerialization(task: SerializationTask): Promise<void> {
    try {
      let result: BoardDocumentSerializationResult;
      try {
        result = await this.#serializeInWorker(task.document);
      } catch (error) {
        // Speculative work has no save contract and no promise consumers.
        // Worker failure/disposal must not synchronously replay stale graphs.
        // A requested save still has the existing error fallback while its
        // computation owner is alive.
        if (this.#disposed || task.waiters.length === 0) {
          this.#rejectSerialization(task, computationError(error));
          return;
        }
        result = this.serializeSync(task.document);
      }
      if (this.#disposed) {
        this.#rejectSerialization(task, disposedError());
        return;
      }
      this.#prepared =
        result.ok && result.json.length * 2 <= maximumPreparedJsonBytes
          ? { document: task.document, result }
          : null;
      for (const waiter of task.waiters) waiter.resolve(result);
      task.waiters.length = 0;
    } catch (error) {
      this.#rejectSerialization(task, computationError(error));
    } finally {
      this.#activeSerialization = null;
      this.#startNextSerialization();
    }
  }

  #rejectSerialization(task: SerializationTask, error: Error): void {
    for (const waiter of task.waiters) waiter.reject(error);
    task.waiters.length = 0;
  }

  async #serializeInWorker(
    document: BoardDocument,
  ): Promise<BoardDocumentSerializationResult> {
    if (this.#disposed) throw disposedError();
    const response = await this.#request({
      document,
      id: this.#nextRequestId++,
      kind: "serialize",
    });
    if (response.kind === "serialize") return response.result;
    throw new Error(
      response.kind === "failure"
        ? response.message
        : "Unexpected document worker response.",
    );
  }

  #ensureWorker(): WorkerLike {
    if (this.#worker !== null) return this.#worker;
    const worker = this.#factory();
    worker.addEventListener("message", (event) => {
      if (this.#worker === worker) this.#handleMessage(event);
    });
    worker.addEventListener("error", (event) => {
      if (this.#worker === worker) this.#handleError(event);
    });
    this.#worker = worker;
    return worker;
  }

  #request(
    request: BoardDocumentWorkerRequest,
  ): Promise<BoardDocumentWorkerResponse> {
    return new Promise((resolve, reject) => {
      if (this.#disposed) {
        reject(new Error("Board document computation was disposed."));
        return;
      }
      this.#pending.set(request.id, { reject, resolve });
      try {
        this.#ensureWorker().postMessage(request);
      } catch (error) {
        this.#pending.delete(request.id);
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to post document computation request."),
        );
      }
    });
  }

  readonly #handleMessage = (
    event: MessageEvent<BoardDocumentWorkerResponse>,
  ): void => {
    const pending = this.#pending.get(event.data.id);
    if (pending === undefined) return;
    this.#pending.delete(event.data.id);
    if (event.data.kind === "failure") {
      pending.reject(new Error(event.data.message));
      return;
    }
    pending.resolve(event.data);
  };

  readonly #handleError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Board document worker failed.");
    this.#worker?.terminate();
    this.#worker = null;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  };
}

export function createBoardDocumentWorkerComputation(): BoardDocumentWorkerComputation {
  return new BoardDocumentWorkerComputation();
}
