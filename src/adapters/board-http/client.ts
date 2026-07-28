import { z } from "zod";

import {
  actorId,
  documentId,
  readBoardDocument,
  type BoardCommand,
  type BoardCommandPage,
  type BoardServerRecovery,
  type BoardSessionContext,
  type BoardSyncRepository,
  type PushBoardCommandsResult,
  type ServerBoardCommandBatch,
  type ServerBoardDescriptor,
} from "../../core/public";

const identifierSchema = z.string().min(1).max(128);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boardDescriptorSchema = z
  .object({
    currentDocumentSha256: z.string(),
    currentRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    lastSnapshotRevision: z.number().int().nonnegative(),
    lessonId: identifierSchema,
    snapshotDue: z.boolean(),
    studentId: identifierSchema,
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
    schemaVersion: z.literal("1.0"),
  })
  .strict();
const commandBatchSchema = z
  .object({
    actorUserId: identifierSchema,
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
): BoardSyncRepository {
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
              schemaVersion: z.literal("1.0"),
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
            schemaVersion: "1.0",
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
  };
}
