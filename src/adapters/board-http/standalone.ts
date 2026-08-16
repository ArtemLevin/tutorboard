import { z } from "zod";

import {
  boardCapabilities,
  type BoardAccessContext,
} from "../../core/access/public";
import { actorId, documentId, type DocumentId } from "../../core/public";
import type {
  BoardPlatformRepository,
  BoardSessionContext,
} from "../../core/ports/public";
import {
  BoardHttpError,
  createBoardHttpRepository,
  type BoardHttpClientOptions,
} from "./client";

const identifierSchema = z.string().min(1).max(128);
const opaqueSecurityValueSchema = z.string().min(8).max(512);
const capabilitySchema = z.enum(boardCapabilities);
const capabilitiesSchema = z
  .array(capabilitySchema)
  .min(1)
  .max(boardCapabilities.length)
  .superRefine((capabilities, context) => {
    if (new Set(capabilities).size !== capabilities.length) {
      context.addIssue({
        code: "custom",
        message: "Capabilities must be unique.",
      });
    }
  });

const commonContextShape = {
  accessEpoch: opaqueSecurityValueSchema,
  actorId: identifierSchema,
  boardId: identifierSchema,
  cacheScopeId: opaqueSecurityValueSchema,
  capabilities: capabilitiesSchema,
  csrfToken: opaqueSecurityValueSchema,
  displayName: z.string().min(1).max(160),
  schemaVersion: z.literal("1.0"),
} as const;

const teacherContextSchema = z
  .object({
    ...commonContextShape,
    organizationId: identifierSchema,
    principalType: z.literal("teacher"),
    role: z.enum(["admin", "tutor"]),
    userId: identifierSchema,
  })
  .strict();

const guestContextSchema = z
  .object({
    ...commonContextShape,
    principalType: z.literal("guest"),
    role: z.literal("student"),
  })
  .strict();

const boardAccessContextSchema = z.discriminatedUnion("principalType", [
  teacherContextSchema,
  guestContextSchema,
]);

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

function runtimeOrigin(options: BoardHttpClientOptions): string {
  return (
    options.origin ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  );
}

function standaloneSessionContext(
  context: BoardAccessContext,
): BoardSessionContext {
  return {
    actorId: context.actorId,
    csrfToken: context.csrfToken,
    organizationId:
      context.principalType === "teacher"
        ? context.organizationId
        : "guest:standalone",
    role: context.role,
  };
}

export async function fetchStandaloneBoardAccessContext(
  expectedBoardId: DocumentId,
  options: BoardHttpClientOptions = {},
): Promise<BoardAccessContext> {
  const request = options.fetch ?? globalThis.fetch;
  const origin = runtimeOrigin(options);
  const baseUrl = normalizedBaseUrl(options.baseUrl ?? "/api/v1", origin);
  const url = new URL(`${baseUrl}/boards/context`);
  url.searchParams.set("boardId", expectedBoardId);

  let response: Response;
  try {
    response = await request(url.href, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new BoardHttpError(
      "board.http.transport",
      "Доступ к доске недоступен.",
      null,
      true,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BoardHttpError(
      "board.http.invalid-json",
      "Доступ к доске недоступен.",
      response.status,
      response.status >= 500,
    );
  }

  if (!response.ok) {
    throw new BoardHttpError(
      `board.http.${response.status}`,
      "Доступ к доске недоступен.",
      response.status,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }

  const parsed = boardAccessContextSchema.safeParse(payload);
  if (!parsed.success || parsed.data.boardId !== expectedBoardId) {
    throw new BoardHttpError(
      "board.http.invalid-context",
      "Доступ к доске недоступен.",
      response.status,
      false,
    );
  }

  const common = {
    ...parsed.data,
    actorId: actorId(parsed.data.actorId),
    boardId: documentId(parsed.data.boardId),
    capabilities: [...parsed.data.capabilities],
  };
  return parsed.data.principalType === "teacher"
    ? { ...common, principalType: "teacher" }
    : { ...common, principalType: "guest" };
}

function unsafeMethod(init: RequestInit | undefined): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export function createStandaloneBoardHttpRepository(
  accessContext: BoardAccessContext,
  options: BoardHttpClientOptions = {},
): BoardPlatformRepository {
  const transport = options.fetch ?? globalThis.fetch;
  const scopedFetch: typeof globalThis.fetch = (input, init) => {
    if (accessContext.principalType !== "guest" || !unsafeMethod(init)) {
      return transport(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set("X-Board-Access-Epoch", accessContext.accessEpoch);
    return transport(input, { ...init, headers });
  };
  const repository = createBoardHttpRepository({
    ...options,
    fetch: scopedFetch,
  });
  const session = standaloneSessionContext(accessContext);
  return {
    ...repository,
    context: () => Promise.resolve(session),
  };
}
