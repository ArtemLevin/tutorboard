import type { ActorId, DocumentId } from "../board/identifiers";

export const boardCapabilities = [
  "board.read",
  "board.write",
  "board.snapshot.write",
  "collaboration.connect",
  "board.export",
  "board.history.read",
  "board.invites.manage",
  "board.archive",
  "board.delete",
] as const;

export type BoardCapability = (typeof boardCapabilities)[number];
export type BoardAccessRole = "admin" | "parent" | "student" | "tutor";
export type BoardPrincipalType = "guest" | "legacy" | "teacher";

interface BoardAccessContextBase {
  readonly accessEpoch: string;
  readonly actorId: ActorId;
  readonly boardId: DocumentId;
  readonly cacheScopeId: string;
  readonly capabilities: readonly BoardCapability[];
  readonly csrfToken: string;
  readonly displayName: string;
  readonly role: BoardAccessRole;
}

export interface TeacherBoardAccessContext extends BoardAccessContextBase {
  readonly organizationId: string;
  readonly principalType: "teacher";
  readonly role: "admin" | "tutor";
  readonly schemaVersion: "1.0";
  readonly userId: string;
}

export interface GuestBoardAccessContext extends BoardAccessContextBase {
  readonly principalType: "guest";
  readonly role: "student";
  readonly schemaVersion: "1.0";
}

export interface LegacyBoardAccessContext extends BoardAccessContextBase {
  readonly organizationId: string;
  readonly principalType: "legacy";
  readonly schemaVersion: "legacy";
}

export type BoardAccessContext =
  | GuestBoardAccessContext
  | TeacherBoardAccessContext;

export type BoardRuntimeAccessContext =
  | BoardAccessContext
  | LegacyBoardAccessContext;

export interface BoardLocalAccessScope {
  readonly accessEpoch: string;
  readonly cacheScopeId: string;
}

export const legacyBoardCacheScopeId = "legacy:lesson-bound:v1";
export const legacyBoardAccessEpoch = "legacy:access:v1";

export interface LegacyBoardSessionLike {
  readonly actorId: ActorId;
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly role: BoardAccessRole;
}

export function createLegacyBoardAccessContext(
  session: LegacyBoardSessionLike,
  boardId: DocumentId,
): LegacyBoardAccessContext {
  const canWrite = session.role !== "parent";
  return {
    accessEpoch: legacyBoardAccessEpoch,
    actorId: session.actorId,
    boardId,
    cacheScopeId: legacyBoardCacheScopeId,
    capabilities: [
      "board.read",
      ...(canWrite
        ? (["board.write", "board.snapshot.write"] as const)
        : []),
      "collaboration.connect",
      ...(session.role === "admin" || session.role === "tutor"
        ? ([
            "board.export",
            "board.history.read",
            "board.invites.manage",
            "board.archive",
            "board.delete",
          ] as const)
        : []),
    ],
    csrfToken: session.csrfToken,
    displayName: session.actorId,
    organizationId: session.organizationId,
    principalType: "legacy",
    role: session.role,
    schemaVersion: "legacy",
  };
}

export interface BoardMutationPolicy {
  readonly canWrite: boolean;
  readonly reason: "allowed" | "missing-board-write" | "revoked";
}

export const writableBoardMutationPolicy: BoardMutationPolicy = {
  canWrite: true,
  reason: "allowed",
};

export function boardMutationPolicyFromAccess(
  context: Pick<BoardRuntimeAccessContext, "capabilities">,
): BoardMutationPolicy {
  return context.capabilities.includes("board.write")
    ? writableBoardMutationPolicy
    : { canWrite: false, reason: "missing-board-write" };
}

export const revokedBoardMutationPolicy: BoardMutationPolicy = {
  canWrite: false,
  reason: "revoked",
};

export function boardMutationPolicyMessage(policy: BoardMutationPolicy): string {
  switch (policy.reason) {
    case "allowed":
      return "";
    case "missing-board-write":
      return "Доска открыта только для чтения.";
    case "revoked":
      return "Доступ к изменению доски отозван.";
  }
}
