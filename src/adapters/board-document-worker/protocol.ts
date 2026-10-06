import type {
  BoardDocument,
  BoardDocumentSerializationResult,
  BoardDocumentSha256Result,
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
    };
