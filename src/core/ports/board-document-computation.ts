import type { BoardDocument } from "../board/document";
import type { BoardDocumentSerializationResult } from "../board/serialization/serialization";
import type { ValidationIssue } from "../board/validation/validate";

export type BoardDocumentComputationPriority = "background" | "lifecycle";

export type BoardDocumentSha256Result =
  | {
      readonly ok: true;
      readonly sha256: string;
    }
  | {
      readonly issues: readonly ValidationIssue[];
      readonly ok: false;
    };

export interface BoardDocumentComputation {
  readonly dispose?: () => void;
  readonly prepareSerialization?: (document: BoardDocument) => void;
  readonly serialize: (
    document: BoardDocument,
    priority?: BoardDocumentComputationPriority,
  ) => Promise<BoardDocumentSerializationResult>;
  readonly serializeSync: (
    document: BoardDocument,
  ) => BoardDocumentSerializationResult;
  readonly sha256: (
    document: BoardDocument,
  ) => Promise<BoardDocumentSha256Result>;
}
