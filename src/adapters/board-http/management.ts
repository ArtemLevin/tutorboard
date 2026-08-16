import { z } from "zod";

import { documentId, type DocumentId } from "../../core/public";
import type {
  BoardInvitationSecretResult,
  BoardInvitationSummary,
  CreateBoardInvitationInput,
  StandaloneBoardDescriptor,
  StandaloneBoardManagementRepository,
  TeacherManagementContext,
  UpdateBoardInvitationInput,
  UpdateStandaloneBoardInput,
} from "../../core/ports/standalone-board-management-repository";
import {
  BoardHttpError,
  type BoardHttpClientOptions,
} from "./client";

const identifierSchema = z.string().min(1).max(128);
const dateTimeSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Expected an ISO date-time.",
);

const teacherManagementContextSchema = z
  .object({
    csrfToken: z.string().min(8).max(512),
    organizationId: identifierSchema,
    role: z.enum(["admin", "tutor"]),
    userId: identifierSchema,
  })
  .strict();

const standaloneBoardSchema = z
  .object({
    archivedAt: dateTimeSchema.nullable(),
    boardId: identifierSchema,
    createdAt: dateTimeSchema,
    currentRevision: z.number().int().min(0),
    deletedAt: dateTimeSchema.nullable(),
    guestWritesEnabled: z.boolean(),
    schemaVersion: z.literal("1.0"),
    title: z.string().min(1).max(200),
    updatedAt: dateTimeSchema,
  })
  .strict();

const invitationSummarySchema = z
  .object({
    boardId: identifierSchema,
    createdAt: dateTimeSchema,
    displayName: z.string().min(1).max(160),
    expiresAt: dateTimeSchema.nullable(),
    invitationId: identifierSchema,
    lastUsedAt: dateTimeSchema.nullable(),
    revokedAt: dateTimeSchema.nullable(),
    schemaVersion: z.literal("1.0"),
    useCount: z.number().int().min(0),
    writeEnabled: z.boolean(),
  })
  .strict();

const invitationSecretResultSchema = z
  .object({
    invitation: invitationSummarySchema,
    joinUrl: z.string().url(),
  })
  .strict();

function runtimeOrigin(options: BoardHttpClientOptions): string {
  return (
    options.origin ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  );
}

function normalizedBaseUrl(baseUrl: string, origin: string): string {
  const parsed = new URL(baseUrl, origin);
  if (parsed.origin !== new URL(origin).origin) {
    throw new Error("Board API must use the TutorBoard same-origin gateway.");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("Board API URL must not contain credentials.");
  }
  return parsed.href.replace(/\/+$/u, "");
}

function managementError(
  code: string,
  message: string,
  status: number | null,
  retryable: boolean,
): BoardHttpError {
  return new BoardHttpError(code, message, status, retryable);
}

async function readJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw managementError(
      "board.management.invalid-json",
      message,
      response.status,
      response.status >= 500,
    );
  }
}

async function ensureOk(response: Response, message: string): Promise<unknown> {
  const payload = await readJson(response, message);
  if (!response.ok) {
    throw managementError(
      `board.management.${response.status}`,
      message,
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return payload;
}

function parseBoard(value: unknown): StandaloneBoardDescriptor {
  const parsed = standaloneBoardSchema.safeParse(value);
  if (!parsed.success) {
    throw managementError(
      "board.management.invalid-board",
      "Сервер вернул несовместимое описание доски.",
      200,
      false,
    );
  }
  return { ...parsed.data, boardId: documentId(parsed.data.boardId) };
}

function parseInvitation(value: unknown): BoardInvitationSummary {
  const parsed = invitationSummarySchema.safeParse(value);
  if (!parsed.success) {
    throw managementError(
      "board.management.invalid-invitation",
      "Сервер вернул несовместимое приглашение.",
      200,
      false,
    );
  }
  return { ...parsed.data, boardId: documentId(parsed.data.boardId) };
}

function parseSecretResult(
  value: unknown,
  origin: string,
): BoardInvitationSecretResult {
  const parsed = invitationSecretResultSchema.safeParse(value);
  if (!parsed.success) {
    throw managementError(
      "board.management.invalid-secret-result",
      "Сервер вернул несовместимую ссылку приглашения.",
      200,
      false,
    );
  }
  const joinUrl = new URL(parsed.data.joinUrl);
  if (joinUrl.origin !== new URL(origin).origin || !joinUrl.pathname.startsWith("/j/")) {
    throw managementError(
      "board.management.invalid-join-url",
      "Сервер вернул небезопасную ссылку приглашения.",
      200,
      false,
    );
  }
  return {
    invitation: parseInvitation(parsed.data.invitation),
    joinUrl: joinUrl.href,
  };
}

export async function fetchTeacherManagementContext(
  options: BoardHttpClientOptions = {},
): Promise<TeacherManagementContext> {
  const request = options.fetch ?? globalThis.fetch;
  const origin = runtimeOrigin(options);
  const baseUrl = normalizedBaseUrl(options.baseUrl ?? "/api/v1", origin);
  let response: Response;
  try {
    response = await request(`${baseUrl}/boards/context`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw managementError(
      "board.management.transport",
      "Управление досками недоступно.",
      null,
      true,
    );
  }
  const payload = await ensureOk(response, "Управление досками недоступно.");
  const parsed = teacherManagementContextSchema.safeParse(payload);
  if (!parsed.success) {
    throw managementError(
      "board.management.invalid-context",
      "Управление досками доступно только преподавателю.",
      response.status,
      false,
    );
  }
  return parsed.data;
}

export function createTeacherBoardManagementRepository(
  context: TeacherManagementContext,
  options: BoardHttpClientOptions = {},
): StandaloneBoardManagementRepository {
  const request = options.fetch ?? globalThis.fetch;
  const origin = runtimeOrigin(options);
  const baseUrl = normalizedBaseUrl(options.baseUrl ?? "/api/v1", origin);

  const requestJson = async (
    path: string,
    init: RequestInit = {},
    message = "Не удалось выполнить операцию с доской.",
  ): Promise<unknown> => {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      headers.set("X-CSRF-Token", context.csrfToken);
      if (init.body !== undefined) headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await request(`${baseUrl}${path}`, {
        ...init,
        credentials: "same-origin",
        headers,
      });
    } catch {
      throw managementError("board.management.transport", message, null, true);
    }
    if (response.status === 204) {
      if (!response.ok) {
        throw managementError(
          `board.management.${response.status}`,
          message,
          response.status,
          false,
        );
      }
      return null;
    }
    return ensureOk(response, message);
  };

  const boardPath = (boardId: DocumentId) =>
    `/boards/${encodeURIComponent(boardId)}`;
  const invitationPath = (boardId: DocumentId, invitationId?: string) =>
    `${boardPath(boardId)}/invitations${
      invitationId === undefined ? "" : `/${encodeURIComponent(invitationId)}`
    }`;

  return {
    archiveBoard: async (boardId) =>
      parseBoard(
        await requestJson(`${boardPath(boardId)}/archive`, { method: "POST" }),
      ),
    createBoard: async (title) =>
      parseBoard(
        await requestJson(
          "/boards",
          {
            body: JSON.stringify(title === undefined ? {} : { title }),
            method: "POST",
          },
          "Не удалось создать доску.",
        ),
      ),
    createInvitation: async (boardId, input: CreateBoardInvitationInput) =>
      parseSecretResult(
        await requestJson(
          invitationPath(boardId),
          { body: JSON.stringify(input), method: "POST" },
          "Не удалось создать ссылку для ученика.",
        ),
        origin,
      ),
    deleteBoard: async (boardId) => {
      await requestJson(
        boardPath(boardId),
        { method: "DELETE" },
        "Не удалось удалить доску.",
      );
    },
    listBoards: async (includeArchived = false) => {
      const suffix = includeArchived ? "?includeArchived=true" : "";
      const payload = await requestJson(`/boards${suffix}`);
      const parsed = z.object({ items: z.array(standaloneBoardSchema) }).strict().safeParse(payload);
      if (!parsed.success) {
        throw managementError(
          "board.management.invalid-list",
          "Сервер вернул несовместимый список досок.",
          200,
          false,
        );
      }
      return parsed.data.items.map(parseBoard);
    },
    listInvitations: async (boardId) => {
      const payload = await requestJson(invitationPath(boardId));
      const parsed = z.object({ items: z.array(invitationSummarySchema) }).strict().safeParse(payload);
      if (!parsed.success) {
        throw managementError(
          "board.management.invalid-invitation-list",
          "Сервер вернул несовместимый список приглашений.",
          200,
          false,
        );
      }
      return parsed.data.items.map(parseInvitation);
    },
    revokeInvitation: async (boardId, invitationId) =>
      parseInvitation(
        await requestJson(
          `${invitationPath(boardId, invitationId)}/revoke`,
          { method: "POST" },
          "Не удалось отозвать приглашение.",
        ),
      ),
    rotateInvitation: async (boardId, invitationId) =>
      parseSecretResult(
        await requestJson(
          `${invitationPath(boardId, invitationId)}/rotate`,
          { method: "POST" },
          "Не удалось ротировать ссылку приглашения.",
        ),
        origin,
      ),
    unarchiveBoard: async (boardId) =>
      parseBoard(
        await requestJson(`${boardPath(boardId)}/unarchive`, { method: "POST" }),
      ),
    updateBoard: async (boardId, input: UpdateStandaloneBoardInput) =>
      parseBoard(
        await requestJson(boardPath(boardId), {
          body: JSON.stringify(input),
          method: "PATCH",
        }),
      ),
    updateInvitation: async (
      boardId,
      invitationId,
      input: UpdateBoardInvitationInput,
    ) =>
      parseInvitation(
        await requestJson(invitationPath(boardId, invitationId), {
          body: JSON.stringify(input),
          method: "PATCH",
        }),
      ),
  };
}
