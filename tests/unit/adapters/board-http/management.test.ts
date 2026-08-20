import { describe, expect, it, vi } from "vitest";

import {
  createTeacherBoardManagementRepository,
  fetchTeacherManagementContext,
} from "../../../../src/adapters/board-http/public";
import { documentId } from "../../../../src/core/public";

const boardId = documentId("board:t2-unit-01");
const contextPayload = {
  csrfToken: "csrf-teacher-management-01",
  organizationId: "organization:t2",
  role: "tutor",
  userId: "user:teacher-t2",
} as const;
const boardPayload = {
  archivedAt: null,
  boardId,
  createdAt: "2026-08-16T12:00:00+00:00",
  currentRevision: 3,
  deletedAt: null,
  guestWritesEnabled: true,
  schemaVersion: "1.0",
  title: "Алгебра",
  updatedAt: "2026-08-16T13:00:00+00:00",
} as const;
const invitationPayload = {
  boardId,
  createdAt: "2026-08-16T12:30:00+00:00",
  displayName: "Ксения",
  expiresAt: "2026-08-17T12:30:00+00:00",
  invitationId: "invite:t2-unit-01",
  lastUsedAt: null,
  revokedAt: null,
  schemaVersion: "1.0",
  useCount: 0,
  writeEnabled: true,
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

describe("teacher standalone board management HTTP adapter", () => {
  it("accepts only the strict authenticated teacher management context", async () => {
    const request = vi.fn<typeof fetch>((input) => {
      expect(requestUrl(input).pathname).toBe("/api/v1/boards/context");
      return Promise.resolve(jsonResponse(contextPayload));
    });

    await expect(
      fetchTeacherManagementContext({
        fetch: request,
        origin: "https://board.example.test",
      }),
    ).resolves.toEqual(contextPayload);

    const guestRequest = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          accessEpoch: "guest_epoch_value",
          actorId: "guest:01",
          boardId,
          cacheScopeId: "guest_cache_value",
          capabilities: ["board.read"],
          csrfToken: "guest_csrf_value",
          displayName: "Ученик",
          principalType: "guest",
          role: "student",
          schemaVersion: "1.0",
        }),
      ),
    );

    await expect(
      fetchTeacherManagementContext({
        fetch: guestRequest,
        origin: "https://board.example.test",
      }),
    ).rejects.toMatchObject({ code: "board.management.invalid-context" });
  });

  it("adds teacher CSRF to unsafe management requests and never expects it from list calls", async () => {
    const seen: Array<{ method: string; csrf: string | null }> = [];
    const request = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      const method = (init?.method ?? "GET").toUpperCase();
      seen.push({
        csrf: new Headers(init?.headers).get("X-CSRF-Token"),
        method,
      });
      if (url.pathname === "/api/v1/boards" && method === "GET") {
        return Promise.resolve(jsonResponse({ items: [boardPayload] }));
      }
      if (url.pathname === "/api/v1/boards" && method === "POST") {
        return Promise.resolve(jsonResponse(boardPayload, 201));
      }
      if (url.pathname.endsWith("/invitations") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              invitation: invitationPayload,
              joinUrl: "https://board.example.test/j/raw-secret-create",
            },
            201,
          ),
        );
      }
      throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
    });
    const repository = createTeacherBoardManagementRepository(contextPayload, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await repository.listBoards();
    await repository.createBoard("Алгебра");
    const result = await repository.createInvitation(boardId, {
      displayName: "Ксения",
      expiresAt: invitationPayload.expiresAt,
      writeEnabled: true,
    });

    expect(result.joinUrl).toBe(
      "https://board.example.test/j/raw-secret-create",
    );
    expect(seen).toEqual([
      { csrf: null, method: "GET" },
      { csrf: contextPayload.csrfToken, method: "POST" },
      { csrf: contextPayload.csrfToken, method: "POST" },
    ]);
  });

  it("rejects any raw invitation link leaked by the list endpoint", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            {
              ...invitationPayload,
              joinUrl: "https://board.example.test/j/must-not-be-listed",
            },
          ],
        }),
      ),
    );
    const repository = createTeacherBoardManagementRepository(contextPayload, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await expect(repository.listInvitations(boardId)).rejects.toMatchObject({
      code: "board.management.invalid-invitation-list",
    });
  });

  it("rejects cross-origin invitation URLs even when the response shape is otherwise valid", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          invitation: invitationPayload,
          joinUrl: "https://evil.example/j/raw-secret",
        }),
      ),
    );
    const repository = createTeacherBoardManagementRepository(contextPayload, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await expect(
      repository.rotateInvitation(boardId, invitationPayload.invitationId),
    ).rejects.toMatchObject({ code: "board.management.invalid-join-url" });
  });

  it.each([
    [403, false],
    [408, true],
    [429, true],
    [500, true],
  ])(
    "classifies HTTP %i management failures with retryable=%s",
    async (status, retryable) => {
      const request = vi.fn<typeof fetch>(() =>
        Promise.resolve(jsonResponse({ error: "denied" }, status)),
      );
      const repository = createTeacherBoardManagementRepository(
        contextPayload,
        {
          fetch: request,
          origin: "https://board.example.test",
        },
      );

      await expect(repository.listBoards()).rejects.toMatchObject({
        code: `board.management.${status}`,
        retryable,
        status,
      });
    },
  );

  it("normalizes transport failures as retryable without leaking the low-level error", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.reject(new Error("socket contained private upstream details")),
    );
    const repository = createTeacherBoardManagementRepository(contextPayload, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await expect(repository.listBoards()).rejects.toMatchObject({
      code: "board.management.transport",
      message: "Не удалось выполнить операцию с доской.",
      retryable: true,
      status: null,
    });
  });

  it("accepts an empty 204 delete response without attempting JSON parsing", async () => {
    const request = vi.fn<typeof fetch>((_input, init) => {
      expect((init?.method ?? "GET").toUpperCase()).toBe("DELETE");
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
        contextPayload.csrfToken,
      );
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const repository = createTeacherBoardManagementRepository(contextPayload, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await expect(repository.deleteBoard(boardId)).resolves.toBeUndefined();
  });
});
