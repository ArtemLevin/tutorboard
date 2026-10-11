import type {
  BoardDocument,
  BoardDocumentSerializationResult,
  BoardDocumentSha256Result,
  ViewportState,
} from "../../core/public";

export type BoardDocumentWorkerRequest =
  | {
      readonly document: BoardDocument;
      readonly id: number;
      readonly kind: "serialize";
    }
  | {
      readonly document: BoardDocument;
      readonly id: number;
      readonly kind: "sha256";
    }
  | {
      readonly baseVersion: number;
      readonly documentId: BoardDocument["id"];
      readonly id: number;
      readonly kind: "serialize-viewport";
      readonly updatedAt: string;
      readonly viewport: ViewportState;
    };

export type BoardDocumentWorkerResponse =
  | {
      readonly id: number;
      readonly kind: "serialize";
      readonly result: BoardDocumentSerializationResult;
    }
  | {
      readonly id: number;
      readonly kind: "sha256";
      readonly result: BoardDocumentSha256Result;
    }
  | {
      readonly id: number;
      readonly kind: "failure";
      readonly message: string;
      readonly code?: "cache-miss";
    };
