import type { DocumentId } from "../board/identifiers";

export type TeacherManagementRole = "admin" | "tutor";

export interface TeacherManagementContext {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly role: TeacherManagementRole;
  readonly userId: string;
}

export interface StandaloneBoardDescriptor {
  readonly archivedAt: string | null;
  readonly boardId: DocumentId;
  readonly createdAt: string;
  readonly currentRevision: number;
  readonly deletedAt: string | null;
  readonly guestWritesEnabled: boolean;
  readonly schemaVersion: "1.0";
  readonly title: string;
  readonly updatedAt: string;
}

export interface BoardInvitationSummary {
  readonly boardId: DocumentId;
  readonly createdAt: string;
  readonly displayName: string;
  readonly expiresAt: string | null;
  readonly invitationId: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly schemaVersion: "1.0";
  readonly useCount: number;
  readonly writeEnabled: boolean;
}

export interface BoardInvitationSecretResult {
  readonly invitation: BoardInvitationSummary;
  readonly joinUrl: string;
}

export interface CreateBoardInvitationInput {
  readonly displayName: string;
  readonly expiresAt: string | null;
  readonly writeEnabled: boolean;
}

export interface UpdateBoardInvitationInput {
  readonly displayName?: string;
  readonly expiresAt?: string | null;
  readonly writeEnabled?: boolean;
}

export interface UpdateStandaloneBoardInput {
  readonly guestWritesEnabled?: boolean;
  readonly title?: string;
}

/** Teacher-only standalone-board lifecycle. Raw invitation secrets exist only in create/rotate results. */
export interface StandaloneBoardManagementRepository {
  readonly archiveBoard: (
    boardId: DocumentId,
  ) => Promise<StandaloneBoardDescriptor>;
  readonly createBoard: (title?: string) => Promise<StandaloneBoardDescriptor>;
  readonly createInvitation: (
    boardId: DocumentId,
    input: CreateBoardInvitationInput,
  ) => Promise<BoardInvitationSecretResult>;
  readonly deleteBoard: (boardId: DocumentId) => Promise<void>;
  readonly listBoards: (
    includeArchived?: boolean,
  ) => Promise<readonly StandaloneBoardDescriptor[]>;
  readonly listInvitations: (
    boardId: DocumentId,
  ) => Promise<readonly BoardInvitationSummary[]>;
  readonly revokeInvitation: (
    boardId: DocumentId,
    invitationId: string,
  ) => Promise<BoardInvitationSummary>;
  readonly rotateInvitation: (
    boardId: DocumentId,
    invitationId: string,
  ) => Promise<BoardInvitationSecretResult>;
  readonly unarchiveBoard: (
    boardId: DocumentId,
  ) => Promise<StandaloneBoardDescriptor>;
  readonly updateBoard: (
    boardId: DocumentId,
    input: UpdateStandaloneBoardInput,
  ) => Promise<StandaloneBoardDescriptor>;
  readonly updateInvitation: (
    boardId: DocumentId,
    invitationId: string,
    input: UpdateBoardInvitationInput,
  ) => Promise<BoardInvitationSummary>;
}
