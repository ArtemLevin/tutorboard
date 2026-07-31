import { z } from "zod";

import {
  actorId,
  documentId,
  readBoardDocument,
  type BoardCommand,
  type BoardCommandPage,
  type BoardCollaborationTicket,
  type BoardEvidenceDescriptor,
  type BoardPlatformRepository,
  type BoardRevisionDescriptor,
  type BoardServerRecovery,
  type BoardSessionContext,
  type PushBoardCommandsResult,
  type ServerBoardCommandBatch,
  type ServerBoardDescriptor,
} from "../../core/public";

const identifierSchema = z.string().min(1).max(128);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boardDescriptorSchema = z
  .object({
    archivedAt: z.string().min(1).max(64).nullable().optional(),
    createdAt: z.string().min(1).max(64).optional(),
    currentDocumentSha256: z.string(),
    currentRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    lastSnapshotRevision: z.number().int().nonnegative(),
    lessonId: identifierSchema,
    schemaVersion: z.literal("1.0").optional(),
    snapshotDue: z.boolean(),
    studentId: identifierSchema,
    updatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
const commandSchema = z
  .object({
    actorId: identifierSchema,
    id: identifierSchema,
    kind: z.string().min(1).max(128),
    timestamp: z.string().min(1).max(64),
  })
  .passthrough();
const envelopeSchema = z
  .object({
    actorId: identifierSchema,
    baseRevision: z.number().int().nonnegative(),
    commands: z.array(commandSchema).min(1).max(100),
    documentId: identifierSchema,
    expectedDocumentSha256: sha256Schema,
    idempotencyKey: z.string().min(1).max(128),
    schemaVersion: z.literal("1.1"),
  })
  .strict();
const commandBatchSchema = z
  .object({
    actorUserId: identifierSchema.nullable(),
    baseRevision: z.number().int().nonnegative(),
    createdAt: z.string().min(1).max(64),
    envelope: envelopeSchema,
    idempotencyKey: z.string().min(1).max(128),
    payloadSha256: sha256Schema,
    revision: z.number().int().positive(),
  })
  .strict();
const contextSchema = z
  .object({
    csrfToken: z.string().min(1).max(512),
    organizationId: identifierSchema,
    role: z.enum(["admin", "parent", "student", "tutor"]),
    userId: identifierSchema,
  })
  .strict();
const revisionSchema = z
  .object({
    actorUserId: identifierSchema.nullable(),
    createdAt: z.string().min(1).max(64),
    documentSha256: z.string(),
    revision: z.number().int().nonnegative(),
    snapshotAvailable: z.boolean(),
  })
  .strict();
const transcriptLinkSchema = z
  .object({
    endMs: z.number().int().nonnegative().optional(),
    label: z.string().min(1).max(160),
    startMs: z.number().int().nonnegative(),
  })
  .strict();
const evidenceSchema = z
  .object({
    artifacts: z
      .object({
        manifest: z.string().startsWith("/"),
        png: z.string().startsWith("/").nullable(),
        svg: z.string().startsWith("/"),
      })
      .strict(),
    documentId: identifierSchema,
    documentSchemaVersion: z.string().min(1).max(16),
    documentSha256: sha256Schema,
    evidenceId: identifierSchema,
    finalizedAt: z.string().min(1).max(64),
    lessonId: identifierSchema,
    manifestSha256: sha256Schema,
    publishedAt: z.string().min(1).max(64).nullable(),
    revision: z.number().int().nonnegative(),
    revokedAt: z.string().min(1).max(64).nullable(),
    schemaVersion: z.literal("1.0"),
    studentId: identifierSchema,
    transcriptLinks: z.array(transcriptLinkSchema).max(100),
  })
  .strict();
const collaborationTicketSchema = z
  .object({
    expiresInSeconds: z.number().int().positive().max(120),
    protocolVersion: z.literal("1.0"),
    ticket: z.string().min(1).max(256),
    websocketPath: z.string().startsWith("/").max(512),
  })
  .strict();

export class BoardHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BoardHttpError";
  }
}

export interface BoardHttpClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly origin?: string;
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

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BoardHttpError(
      "board.http.invalid-json",
      "Сервер доски вернул некорректный JSON.",
      response.status,
      response.status >= 500,
    );
  }
}

function parseDescriptor(value: unknown): ServerBoardDescriptor {
  const parsed = boardDescriptorSchema.safeParse(value);
  if (!parsed.success) {
    throw new BoardHttpError(
      "board.http.invalid-descriptor",
      "Сервер вернул несовместимое описание доски.",
      200,
      false,
    );
  }
  return {
    ...parsed.data,
    archivedAt: parsed.data.archivedAt ?? null,
    documentId: documentId(parsed.data.documentId),
  };
}

function parseEvidence(value: unknown): BoardEvidenceDescriptor {
  const parsed = evidenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new BoardHttpError(
      "board.http.invalid-evidence",
      "Сервер вернул несовместимое свидетельство занятия.",
      200,
      false,
    );
  }
  return {
    ...parsed.data,
    documentId: documentId(parsed.data.documentId),
  };
}

function parseBatch(value: unknown): ServerBoardCommandBatch {
  const parsed = commandBatchSchema.safeParse(value);
  if (!parsed.success) {
    throw new BoardHttpError(
      "board.http.invalid-command-batch",
      "Сервер вернул несовместимый пакет команд.",
      200,
      false,
    );
  }
  return {
    ...parsed.data,
    envelope: {
      ...parsed.data.envelope,
      actorId: actorId(parsed.data.envelope.actorId),
      commands: parsed.data.envelope
        .commands as unknown as readonly BoardCommand[],
      documentId: documentId(parsed.data.envelope.documentId),
    },
  };
}

function problemMessage(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.detail === "string") {
    return record.detail;
  }
  const error = record.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
}

export function createBoardHttpRepository(
  options: BoardHttpClientOptions = {},
): BoardPlatformRepository {
  const request = options.fetch ?? globalThis.fetch;
  const origin =
    options.origin ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin);
  const baseUrl = normalizedBaseUrl(options.baseUrl ?? "/api/v1", origin);

  const send = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    try {
      return await request(`${baseUrl}${path}`, {
        ...init,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...init.headers,
        },
      });
    } catch {
      throw new BoardHttpError(
        "board.http.transport",
        "Сервер доски недоступен.",
        null,
        true,
      );
    }
  };

  const requireSuccess = async (
    response: Response,
    fallback: string,
  ): Promise<unknown> => {
    const payload = await responseJson(response);
    if (!response.ok) {
      throw new BoardHttpError(
        `board.http.${response.status}`,
        problemMessage(payload, fallback),
        response.status,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }
    return payload;
  };

  return {
    async context(): Promise<BoardSessionContext> {
      const response = await send("/boards/context");
      const parsed = contextSchema.safeParse(
        await requireSuccess(response, "Не удалось получить контекст доски."),
      );
      if (!parsed.success) {
        throw new BoardHttpError(
          "board.http.invalid-context",
          "Сервер вернул несовместимый контекст доски.",
          response.status,
          false,
        );
      }
      return {
        actorId: actorId(parsed.data.userId),
        csrfToken: parsed.data.csrfToken,
        organizationId: parsed.data.organizationId,
        role: parsed.data.role,
      };
    },

    async ensureBoard(lessonId, expectedDocumentId, csrfToken) {
      const response = await send(
        `/lessons/${encodeURIComponent(lessonId)}/board`,
        {
          body: JSON.stringify({ documentId: expectedDocumentId }),
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "POST",
        },
      );
      return parseDescriptor(
        await requireSuccess(response, "Не удалось открыть доску занятия."),
      );
    },

    async listBoards(lessonId, includeArchived = true) {
      const response = await send(
        `/lessons/${encodeURIComponent(lessonId)}/boards?includeArchived=${String(includeArchived)}`,
      );
      const parsed = z
        .object({
          items: z.array(boardDescriptorSchema),
          lessonId: identifierSchema,
        })
        .strict()
        .safeParse(
          await requireSuccess(response, "Не удалось получить доски занятия."),
        );
      if (!parsed.success || parsed.data.lessonId !== lessonId) {
        throw new BoardHttpError(
          "board.http.invalid-board-list",
          "Сервер вернул несовместимый список досок.",
          response.status,
          false,
        );
      }
      return parsed.data.items.map(parseDescriptor);
    },

    async load(expectedDocumentId): Promise<BoardServerRecovery> {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}`,
      );
      const payload = await requireSuccess(
        response,
        "Не удалось загрузить доску.",
      );
      const parsed = z
        .object({
          board: boardDescriptorSchema,
          commandBatches: z.array(commandBatchSchema),
          snapshot: z
            .object({
              createdAt: z.string().min(1).max(64),
              document: z.unknown(),
              documentId: identifierSchema,
              documentSha256: sha256Schema,
              revision: z.number().int().nonnegative(),
              schemaVersion: z.literal("1.1"),
            })
            .strict()
            .nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!parsed.success) {
        throw new BoardHttpError(
          "board.http.invalid-recovery",
          "Сервер вернул несовместимый пакет восстановления.",
          response.status,
          false,
        );
      }
      const snapshot =
        parsed.data.snapshot === null
          ? null
          : (() => {
              const read = readBoardDocument(parsed.data.snapshot.document);
              if (
                read.status !== "ok" ||
                read.document.id !== expectedDocumentId
              ) {
                throw new BoardHttpError(
                  "board.http.invalid-snapshot",
                  "Серверный снимок доски несовместим.",
                  response.status,
                  false,
                );
              }
              return {
                ...parsed.data.snapshot,
                document: read.document,
                documentId: documentId(parsed.data.snapshot.documentId),
              };
            })();
      return {
        board: parseDescriptor(parsed.data.board),
        commandBatches: parsed.data.commandBatches.map(parseBatch),
        snapshot,
      };
    },

    async pull(expectedDocumentId, afterRevision): Promise<BoardCommandPage> {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/commands?afterRevision=${afterRevision}&limit=500`,
      );
      const parsed = z
        .object({
          currentRevision: z.number().int().nonnegative(),
          documentId: identifierSchema,
          hasMore: z.boolean(),
          items: z.array(commandBatchSchema),
        })
        .strict()
        .safeParse(
          await requireSuccess(response, "Не удалось получить команды доски."),
        );
      if (!parsed.success || parsed.data.documentId !== expectedDocumentId) {
        throw new BoardHttpError(
          "board.http.invalid-command-page",
          "Сервер вернул несовместимую страницу команд.",
          response.status,
          false,
        );
      }
      return {
        currentRevision: parsed.data.currentRevision,
        hasMore: parsed.data.hasMore,
        items: parsed.data.items.map(parseBatch),
      };
    },

    async saveSnapshot(
      expectedDocumentId,
      revision,
      document,
      documentSha256,
      csrfToken,
    ): Promise<void> {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/snapshots`,
        {
          body: JSON.stringify({
            createdAt: new Date().toISOString(),
            document,
            documentId: expectedDocumentId,
            documentSha256,
            revision,
            schemaVersion: "1.1",
          }),
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "POST",
        },
      );
      await requireSuccess(response, "Не удалось сохранить снимок доски.");
    },

    async push(envelope, csrfToken): Promise<PushBoardCommandsResult> {
      const response = await send(
        `/boards/${encodeURIComponent(envelope.documentId)}/commands`,
        {
          body: JSON.stringify(envelope),
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "POST",
        },
      );
      const payload = await responseJson(response);
      if (response.status === 409) {
        const conflict = z
          .object({
            error: z
              .object({
                currentRevision: z.number().int().nonnegative(),
              })
              .passthrough(),
            hasMore: z.boolean(),
            missingCommandBatches: z.array(commandBatchSchema),
          })
          .passthrough()
          .safeParse(payload);
        if (!conflict.success) {
          throw new BoardHttpError(
            "board.http.invalid-conflict",
            "Сервер вернул несовместимое описание конфликта.",
            response.status,
            false,
          );
        }
        return {
          currentRevision: conflict.data.error.currentRevision,
          hasMore: conflict.data.hasMore,
          missingCommandBatches:
            conflict.data.missingCommandBatches.map(parseBatch),
          status: "conflict",
        };
      }
      if (!response.ok) {
        throw new BoardHttpError(
          `board.http.${response.status}`,
          problemMessage(payload, "Не удалось сохранить команды доски."),
          response.status,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      const accepted = z
        .object({
          currentDocumentSha256: sha256Schema,
          revision: z.number().int().positive(),
          snapshotDue: z.boolean(),
        })
        .passthrough()
        .safeParse(payload);
      if (!accepted.success) {
        throw new BoardHttpError(
          "board.http.invalid-acceptance",
          "Сервер вернул несовместимое подтверждение команд.",
          response.status,
          false,
        );
      }
      return { ...accepted.data, status: "accepted" };
    },

    async archive(expectedDocumentId, csrfToken) {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/archive`,
        {
          headers: { "X-CSRF-Token": csrfToken },
          method: "POST",
        },
      );
      return parseDescriptor(
        await requireSuccess(response, "Не удалось архивировать доску."),
      );
    },

    async unarchive(expectedDocumentId, csrfToken) {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/unarchive`,
        {
          headers: { "X-CSRF-Token": csrfToken },
          method: "POST",
        },
      );
      return parseDescriptor(
        await requireSuccess(response, "Не удалось восстановить доску."),
      );
    },

    async listRevisions(
      expectedDocumentId,
    ): Promise<readonly BoardRevisionDescriptor[]> {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/revisions`,
      );
      const parsed = z
        .object({
          currentRevision: z.number().int().nonnegative(),
          documentId: identifierSchema,
          items: z.array(revisionSchema).max(500),
        })
        .strict()
        .safeParse(
          await requireSuccess(response, "Не удалось получить историю доски."),
        );
      if (!parsed.success || parsed.data.documentId !== expectedDocumentId) {
        throw new BoardHttpError(
          "board.http.invalid-revisions",
          "Сервер вернул несовместимую историю доски.",
          response.status,
          false,
        );
      }
      return parsed.data.items;
    },

    async collaborationTicket(
      expectedDocumentId,
      clientId,
      csrfToken,
    ): Promise<BoardCollaborationTicket> {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/collaboration-ticket`,
        {
          body: JSON.stringify({ clientId }),
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "POST",
        },
      );
      const parsed = collaborationTicketSchema.safeParse(
        await requireSuccess(
          response,
          "Не удалось подключить совместное редактирование.",
        ),
      );
      if (!parsed.success) {
        throw new BoardHttpError(
          "board.http.invalid-collaboration-ticket",
          "Сервер вернул несовместимый WebSocket ticket.",
          response.status,
          false,
        );
      }
      return parsed.data;
    },

    async recordClientEvent(event, csrfToken): Promise<void> {
      const response = await send("/boards/client-events", {
        body: JSON.stringify(event),
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        method: "POST",
      });
      if (!response.ok) {
        const payload = await responseJson(response);
        throw new BoardHttpError(
          `board.http.${response.status}`,
          problemMessage(payload, "Не удалось записать техническую метрику."),
          response.status,
          true,
        );
      }
    },

    async finalizeEvidence(
      expectedDocumentId,
      revision,
      documentSha256,
      previewSvg,
      previewPngBase64,
      transcriptLinks,
      csrfToken,
    ) {
      const response = await send(
        `/boards/${encodeURIComponent(expectedDocumentId)}/evidence`,
        {
          body: JSON.stringify({
            documentSha256,
            previewPngBase64,
            previewSvg,
            revision,
            schemaVersion: "1.0",
            transcriptLinks,
          }),
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          method: "POST",
        },
      );
      return parseEvidence(
        await requireSuccess(response, "Не удалось зафиксировать итог доски."),
      );
    },

    async listEvidence(lessonId) {
      const response = await send(
        `/lessons/${encodeURIComponent(lessonId)}/board-evidence`,
      );
      const parsed = z
        .object({
          items: z.array(evidenceSchema),
          lessonId: identifierSchema,
        })
        .strict()
        .safeParse(
          await requireSuccess(response, "Не удалось получить итоги занятия."),
        );
      if (!parsed.success || parsed.data.lessonId !== lessonId) {
        throw new BoardHttpError(
          "board.http.invalid-evidence-list",
          "Сервер вернул несовместимый список итогов.",
          response.status,
          false,
        );
      }
      return parsed.data.items.map(parseEvidence);
    },

    async publishEvidence(evidenceId, csrfToken) {
      const response = await send(
        `/board-evidence/${encodeURIComponent(evidenceId)}/publish`,
        {
          headers: { "X-CSRF-Token": csrfToken },
          method: "POST",
        },
      );
      return parseEvidence(
        await requireSuccess(response, "Не удалось опубликовать итог."),
      );
    },

    async revokeEvidence(evidenceId, csrfToken) {
      const response = await send(
        `/board-evidence/${encodeURIComponent(evidenceId)}/revoke`,
        {
          headers: { "X-CSRF-Token": csrfToken },
          method: "POST",
        },
      );
      return parseEvidence(
        await requireSuccess(response, "Не удалось отозвать итог."),
      );
    },
  };
}
