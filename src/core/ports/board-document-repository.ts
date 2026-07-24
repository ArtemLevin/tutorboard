import type { BoardDocument } from "../board/document";
import type { DocumentId } from "../board/identifiers";
import type { ValidationIssue } from "../board/validation/validate";

declare const localRevisionIdBrand: unique symbol;
declare const persistenceOperationIdBrand: unique symbol;

export type LocalRevisionId = string & {
  readonly [localRevisionIdBrand]: "LocalRevisionId";
};
export type PersistenceOperationId = string & {
  readonly [persistenceOperationIdBrand]: "PersistenceOperationId";
};

function requireOpaqueId(value: string, label: string): string {
  if (value.length === 0 || value.length > 256) {
    throw new RangeError(`${label} must contain 1–256 characters.`);
  }
  return value;
}

export function localRevisionId(value: string): LocalRevisionId {
  return requireOpaqueId(value, "Local revision ID") as LocalRevisionId;
}

export function persistenceOperationId(value: string): PersistenceOperationId {
  return requireOpaqueId(
    value,
    "Persistence operation ID",
  ) as PersistenceOperationId;
}

export const localDiagnosticSchemaVersion =
  "tutorboard.local-diagnostics/1" as const;

export type BoardDocumentRecoveryReason =
  | "document-id-mismatch"
  | "incompatible-object"
  | "incompatible-schema"
  | "invalid-document"
  | "invalid-json"
  | "invalid-storage-record"
  | "missing-current-revision"
  | "missing-head";

export interface BoardDocumentRecoveryRecord {
  readonly capturedAt: string;
  readonly documentId: DocumentId;
  readonly failedRevisionId: LocalRevisionId | null;
  readonly issueCodes: readonly string[];
  readonly raw: string;
  readonly reason: BoardDocumentRecoveryReason;
}

export type BoardDocumentLoadResult =
  | {
      readonly status: "empty";
    }
  | {
      readonly document: BoardDocument;
      readonly revisionId: LocalRevisionId;
      readonly status: "restored";
    }
  | {
      readonly document: BoardDocument;
      readonly recovery: BoardDocumentRecoveryRecord;
      readonly revisionId: LocalRevisionId;
      readonly status: "recovered";
    }
  | {
      readonly currentRevisionId: LocalRevisionId | null;
      readonly recovery: BoardDocumentRecoveryRecord;
      readonly status: "recovery-required";
    }
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "failure";
    };

export interface SaveBoardDocumentInput {
  readonly document: BoardDocument;
  readonly expectedRevisionId: LocalRevisionId | null;
  readonly operationId: PersistenceOperationId;
  readonly savedAt: string;
}

export type SaveBoardDocumentResult =
  | {
      readonly duplicate: boolean;
      readonly revisionId: LocalRevisionId;
      readonly status: "saved";
    }
  | {
      readonly currentRevisionId: LocalRevisionId | null;
      readonly status: "conflict";
    }
  | {
      readonly issues: readonly ValidationIssue[];
      readonly status: "invalid-document";
    }
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "failure";
    };

export interface BoardDocumentDiagnosticBundle {
  readonly documentId: DocumentId;
  readonly generatedAt: string;
  readonly head: unknown;
  readonly recovery: unknown;
  readonly revisions: readonly unknown[];
  readonly schemaVersion: typeof localDiagnosticSchemaVersion;
}

export interface BoardDocumentRepository {
  readonly diagnose: (
    documentId: DocumentId,
    generatedAt: string,
  ) => Promise<BoardDocumentDiagnosticBundle>;
  readonly load: (documentId: DocumentId) => Promise<BoardDocumentLoadResult>;
  readonly save: (
    input: SaveBoardDocumentInput,
  ) => Promise<SaveBoardDocumentResult>;
}
