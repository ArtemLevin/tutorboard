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

interface PreparedSerialization {
  promise: Promise<BoardDocumentSerializationResult>;
  result: BoardDocumentSerializationResult | null;
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
  readonly #prepared = new WeakMap<BoardDocument, PreparedSerialization>();
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
    const error = new Error("Board document computation was disposed.");
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  prepareSerialization(document: BoardDocument): void {
    if (this.#disposed || this.#prepared.has(document)) return;
    const prepared: PreparedSerialization = {
      promise: Promise.resolve({ ok: false, issues: [] }),
      result: null,
    };
    prepared.promise = this.#serializeInWorker(document)
      .catch(() => this.serializeSync(document))
      .then((result) => {
        prepared.result = result;
        return result;
      });
    this.#prepared.set(document, prepared);
  }

  serialize(
    document: BoardDocument,
    priority: BoardDocumentComputationPriority = "background",
  ): Promise<BoardDocumentSerializationResult> {
    const prepared = this.#prepared.get(document);
    if (priority === "lifecycle") {
      return Promise.resolve(prepared?.result ?? this.serializeSync(document));
    }
    if (prepared !== undefined) return prepared.promise;
    this.prepareSerialization(document);
    return (
      this.#prepared.get(document)?.promise ??
      Promise.resolve(this.serializeSync(document))
    );
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
    } catch {
      return await inlineSha256(document);
    }
  }

  async #serializeInWorker(
    document: BoardDocument,
  ): Promise<BoardDocumentSerializationResult> {
    if (this.#disposed) return this.serializeSync(document);
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
    worker.addEventListener("message", this.#handleMessage);
    worker.addEventListener("error", this.#handleError);
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
