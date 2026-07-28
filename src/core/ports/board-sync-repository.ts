import type { BoardCommand } from "../board/commands/commands";
import type { BoardDocument } from "../board/document";
import type { ActorId, DocumentId } from "../board/identifiers";

export type BoardAccessRole = "admin" | "parent" | "student" | "tutor";

export interface BoardSessionContext {
  readonly actorId: ActorId;
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly role: BoardAccessRole;
}

export interface BoardCommandEnvelope {
  readonly actorId: ActorId;
  readonly baseRevision: number;
  readonly commands: readonly BoardCommand[];
  readonly documentId: DocumentId;
  readonly expectedDocumentSha256: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: "1.0";
}

export interface ServerBoardCommandBatch {
  readonly actorUserId: string;
  readonly baseRevision: number;
  readonly createdAt: string;
  readonly envelope: BoardCommandEnvelope;
  readonly idempotencyKey: string;
  readonly payloadSha256: string;
  readonly revision: number;
}

export interface ServerBoardDescriptor {
  readonly currentDocumentSha256: string;
  readonly currentRevision: number;
  readonly documentId: DocumentId;
  readonly lastSnapshotRevision: number;
  readonly lessonId: string;
  readonly snapshotDue: boolean;
  readonly studentId: string;
}

export interface BoardServerRecovery {
  readonly board: ServerBoardDescriptor;
  readonly commandBatches: readonly ServerBoardCommandBatch[];
  readonly snapshot: {
    readonly document: BoardDocument;
    readonly documentId: DocumentId;
    readonly documentSha256: string;
    readonly revision: number;
    readonly schemaVersion: "1.0";
  } | null;
}

export interface BoardCommandPage {
  readonly currentRevision: number;
  readonly hasMore: boolean;
  readonly items: readonly ServerBoardCommandBatch[];
}

export type PushBoardCommandsResult =
  | {
      readonly currentDocumentSha256: string;
      readonly revision: number;
      readonly snapshotDue: boolean;
      readonly status: "accepted";
    }
  | {
      readonly currentRevision: number;
      readonly hasMore: boolean;
      readonly missingCommandBatches: readonly ServerBoardCommandBatch[];
      readonly status: "conflict";
    };

export interface BoardSyncRepository {
  readonly context: () => Promise<BoardSessionContext>;
  readonly ensureBoard: (
    lessonId: string,
    documentId: DocumentId,
    csrfToken: string,
  ) => Promise<ServerBoardDescriptor>;
  readonly load: (documentId: DocumentId) => Promise<BoardServerRecovery>;
  readonly pull: (
    documentId: DocumentId,
    afterRevision: number,
  ) => Promise<BoardCommandPage>;
  readonly saveSnapshot: (
    documentId: DocumentId,
    revision: number,
    document: BoardDocument,
    documentSha256: string,
    csrfToken: string,
  ) => Promise<void>;
  readonly push: (
    envelope: BoardCommandEnvelope,
    csrfToken: string,
  ) => Promise<PushBoardCommandsResult>;
}

export interface PendingBoardCommand {
  readonly command: BoardCommand;
  readonly documentId: DocumentId;
  readonly idempotencyKey: string;
  readonly sequence: number;
}

export interface ConfirmedBoardHead {
  readonly document: BoardDocument;
  readonly documentId: DocumentId;
  readonly revision: number;
  readonly session: Omit<BoardSessionContext, "csrfToken">;
  readonly sha256: string;
}

export interface PendingBoardCommandQueue {
  readonly acknowledge: (
    documentId: DocumentId,
    sequence: number,
  ) => Promise<void>;
  readonly close?: () => void;
  readonly deleteDatabase?: () => Promise<void>;
  readonly enqueue: (
    documentId: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
  ) => Promise<PendingBoardCommand>;
  readonly loadHead: (
    documentId: DocumentId,
  ) => Promise<ConfirmedBoardHead | null>;
  readonly list: (
    documentId: DocumentId,
  ) => Promise<readonly PendingBoardCommand[]>;
  readonly replace: (
    documentId: DocumentId,
    commands: readonly PendingBoardCommand[],
  ) => Promise<void>;
  readonly saveHead: (head: ConfirmedBoardHead) => Promise<void>;
}
