import {
  serializeBoardDocument,
  type BoardDocument,
  type BoardDocumentSerializationResult,
} from "../../core/public";

import type {
  BoardDocumentWorkerRequest,
  BoardDocumentWorkerResponse,
} from "./protocol";

type SerializationRequest = Extract<
  BoardDocumentWorkerRequest,
  { readonly kind: "serialize" | "serialize-viewport" }
>;

/**
 * The worker owns one authoritative structured-cloned content snapshot at a
 * time. The main thread never sends a cached content graph with viewport
 * messages, and a mismatched version cannot silently serialize old content.
 */
export class WorkerSerializationCache {
  #base: { readonly document: BoardDocument; readonly version: number } | null =
    null;

  serialize(request: SerializationRequest): BoardDocumentWorkerResponse {
    if (request.kind === "serialize") {
      const result = serializeBoardDocument(request.document);
      // Invalid full documents must never establish a trusted cached base.
      this.#base = result.ok
        ? { document: request.document, version: request.id }
        : null;
      return { id: request.id, kind: "serialize", result };
    }

    const base = this.#base;
    if (
      base === null ||
      base.version !== request.baseVersion ||
      base.document.id !== request.documentId
    ) {
      return {
        id: request.id,
        kind: "failure",
        code: "cache-miss",
        message: "Worker content version is unavailable.",
      };
    }

    // The clone of the original content remains stable in Worker ownership.
    // Only the inexpensive viewport metadata is reconstructed and the SAME
    // canonical serializer/validator runs before returning persisted bytes.
    const document: BoardDocument = {
      ...base.document,
      updatedAt: request.updatedAt,
      viewport: request.viewport,
    };
    const result: BoardDocumentSerializationResult =
      serializeBoardDocument(document);
    return { id: request.id, kind: "serialize", result };
  }
}
