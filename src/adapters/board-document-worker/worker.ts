import {
  serializeBoardDocument,
  type BoardDocumentSha256Result,
} from "../../core/public";

import { WorkerSerializationCache } from "./serialization-cache";

import type {
  BoardDocumentWorkerRequest,
  BoardDocumentWorkerResponse,
} from "./protocol";

async function sha256(
  request: Extract<BoardDocumentWorkerRequest, { readonly kind: "sha256" }>,
): Promise<BoardDocumentSha256Result> {
  const serialized = serializeBoardDocument(request.document);
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

const serializationCache = new WorkerSerializationCache();

globalThis.addEventListener(
  "message",
  (event: MessageEvent<BoardDocumentWorkerRequest>) => {
    const request = event.data;
    void (async () => {
      try {
        const response: BoardDocumentWorkerResponse =
          request.kind === "sha256"
            ? {
                id: request.id,
                kind: "sha256",
                result: await sha256(request),
              }
            : serializationCache.serialize(request);
        globalThis.postMessage(response);
      } catch (error) {
        const response: BoardDocumentWorkerResponse = {
          id: request.id,
          kind: "failure",
          message:
            error instanceof Error
              ? error.message
              : "Unknown document worker failure.",
        };
        globalThis.postMessage(response);
      }
    })();
  },
);
