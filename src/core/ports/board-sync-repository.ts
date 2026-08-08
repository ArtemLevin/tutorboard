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

export interface BoardCommandOrder {
  readonly baseRevisionAtCreation: number;
  readonly lamport: number;
}

export interface OrderedBoardCommand {
  readonly command: BoardCommand;
  readonly order: BoardCommandOrder;
}

export interface LegacyBoardCommandEnvelope {
  readonly actorId: ActorId;
  readonly baseRevision: number;
  readonly commands: readonly BoardCommand[];
  readonly documentId: DocumentId;
  readonly expectedDocumentSha256: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: "1.0" | "1.2";
}

export interface OrderedBoardCommandEnvelope {
  readonly actorId: ActorId;
  readonly baseRevision: number;
  readonly commands: readonly OrderedBoardCommand[];
  readonly documentId: DocumentId;
  readonly expectedDocumentSha256: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: "1.3";
}

export type BoardCommandEnvelope =
  LegacyBoardCommandEnvelope | OrderedBoardCommandEnvelope;

export interface ServerBoardCommandBatch {
  readonly actorUserId: string | null;
  readonly baseRevision: number;
  readonly createdAt: string;
  readonly envelope: BoardCommandEnvelope;
  readonly idempotencyKey: string;
  readonly payloadSha256: string;
  readonly revision: number;
}

export interface ServerBoardDescriptor {
  readonly archivedAt: string | null;
  readonly currentDocumentSha256: string;
  readonly currentRevision: number;
  readonly documentId: DocumentId;
  readonly lastSnapshotRevision: number;
  readonly lessonId: string;
  readonly snapshotDue: boolean;
  readonly studentId: string;
}

export interface BoardRevisionDescriptor {
  readonly actorUserId: string | null;
  readonly createdAt: string;
  readonly documentSha256: string;
  readonly revision: number;
  readonly snapshotAvailable: boolean;
}

export interface BoardEvidenceDescriptor {
  readonly artifacts: {
    readonly manifest: string;
    readonly png: string | null;
    readonly svg: string;
  };
  readonly documentId: DocumentId;
  readonly documentSchemaVersion: string;
  readonly documentSha256: string;
  readonly evidenceId: string;
  readonly finalizedAt: string;
  readonly lessonId: string;
  readonly manifestSha256: string;
  readonly publishedAt: string | null;
  readonly revision: number;
  readonly revokedAt: string | null;
  readonly schemaVersion: "1.0";
  readonly studentId: string;
  readonly transcriptLinks: readonly BoardTranscriptLink[];
}

export interface BoardTranscriptLink {
  readonly endMs?: number | undefined;
  readonly label: string;
  readonly startMs: number;
}

export interface BoardCollaborationTicket {
  readonly expiresInSeconds: number;
  readonly protocolVersion: "1.0";
  readonly ticket: string;
  readonly websocketPath: string;
}

export interface BoardClientEvent {
  readonly durationMs?: number;
  readonly name:
    | "board.load"
    | "board.sync"
    | "collaboration.connection"
    | "evidence.finalize";
  readonly outcome: "failure" | "offline" | "recovered" | "success";
}

export interface BoardServerRecovery {
  readonly board: ServerBoardDescriptor;
  readonly commandBatches: readonly ServerBoardCommandBatch[];
  readonly snapshot: {
    readonly createdAt: string;
    readonly document: BoardDocument;
    readonly documentId: DocumentId;
    readonly documentSha256: string;
    readonly revision: number;
    readonly schemaVersion: "1.1" | "1.2" | "1.3";
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
    envelope: OrderedBoardCommandEnvelope,
    csrfToken: string,
  ) => Promise<PushBoardCommandsResult>;
}

export interface BoardPlatformRepository extends BoardSyncRepository {
  readonly archive: (
    documentId: DocumentId,
    csrfToken: string,
  ) => Promise<ServerBoardDescriptor>;
  readonly collaborationTicket: (
    documentId: DocumentId,
    clientId: string,
    csrfToken: string,
  ) => Promise<BoardCollaborationTicket>;
  readonly finalizeEvidence: (
    documentId: DocumentId,
    revision: number,
    documentSha256: string,
    previewSvg: string,
    previewPngBase64: string,
    transcriptLinks: readonly BoardTranscriptLink[],
    csrfToken: string,
  ) => Promise<BoardEvidenceDescriptor>;
  readonly listBoards: (
    lessonId: string,
    includeArchived?: boolean,
  ) => Promise<readonly ServerBoardDescriptor[]>;
  readonly listEvidence: (
    lessonId: string,
  ) => Promise<readonly BoardEvidenceDescriptor[]>;
  readonly listRevisions: (
    documentId: DocumentId,
  ) => Promise<readonly BoardRevisionDescriptor[]>;
  readonly publishEvidence: (
    evidenceId: string,
    csrfToken: string,
  ) => Promise<BoardEvidenceDescriptor>;
  readonly recordClientEvent: (
    event: BoardClientEvent,
    csrfToken: string,
  ) => Promise<void>;
  readonly revokeEvidence: (
    evidenceId: string,
    csrfToken: string,
  ) => Promise<BoardEvidenceDescriptor>;
  readonly unarchive: (
    documentId: DocumentId,
    csrfToken: string,
  ) => Promise<ServerBoardDescriptor>;
}

export interface PendingBoardCommand {
  readonly command: BoardCommand;
  readonly documentId: DocumentId;
  readonly idempotencyKey: string;
  readonly order: BoardCommandOrder;
  readonly sequence: number;
}

export interface PendingBoardCommandOrderingInput {
  readonly baseRevisionAtCreation?: number;
  readonly observedLamport?: number;
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
    ordering?: PendingBoardCommandOrderingInput,
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
