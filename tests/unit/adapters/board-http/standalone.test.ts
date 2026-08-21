import { describe, expect, it, vi } from "vitest";

import {
  createStandaloneBoardHttpRepository,
  fetchStandaloneBoardAccessContext,
} from "../../../../src/adapters/board-http/public";
import { actorId, documentId } from "../../../../src/core/public";

const expectedBoardId = documentId("board:standalone-01");
const guestPayload = {
  accessEpoch: "epoch:guest:standalone-01",
  actorId: "guest:standalone-01",
  boardId: expectedBoardId,
  cacheScopeId: "scope:guest:standalone-01",
  capabilities: [
    "board.read",
    "board.write",
    "board.snapshot.write",
    "collaboration.connect",
  ],
  csrfToken: "csrf-guest-standalone-01",
  displayName: "Ксения",
  principalType: "guest",
  role: "student",
  schemaVersion: "1.0",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

describe("standalone board HTTP access", () => {
  it("fetches a strict board-scoped guest context", async () => {
    const request = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      expect(url.pathname).toBe("/api/v1/boards/context");
      expect(url.searchParams.get("boardId")).toBe(expectedBoardId);
      return Promise.resolve(jsonResponse(guestPayload));
    });

    const context = await fetchStandaloneBoardAccessContext(expectedBoardId, {
      baseUrl: "/api/v1",
      fetch: request,
      origin: "https://board.example.test",
    });

    expect(context.principalType).toBe("guest");
    expect(context.boardId).toBe(expectedBoardId);
    expect(context.actorId).toBe(guestPayload.actorId);
    expect("organizationId" in context).toBe(false);
    expect("userId" in context).toBe(false);
  });

  it("rejects guest contexts with teacher-only fields without exposing details", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          ...guestPayload,
          organizationId: "organization:must-not-leak",
        }),
      ),
    );

    await expect(
      fetchStandaloneBoardAccessContext(expectedBoardId, {
        fetch: request,
        origin: "https://board.example.test",
      }),
    ).rejects.toMatchObject({
      code: "board.http.invalid-context",
      message: "Доступ к доске недоступен.",
    });
  });

  it("rejects a context scoped to another board", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          ...guestPayload,
          boardId: "board:standalone-other",
        }),
      ),
    );

    await expect(
      fetchStandaloneBoardAccessContext(expectedBoardId, {
        fetch: request,
        origin: "https://board.example.test",
      }),
    ).rejects.toMatchObject({
      code: "board.http.invalid-context",
      message: "Доступ к доске недоступен.",
    });
  });

  it.each([
    ["missing board.read", ["collaboration.connect"]],
    ["snapshot without write", ["board.read", "board.snapshot.write"]],
    ["export", ["board.read", "board.export"]],
    ["history", ["board.read", "board.history.read"]],
    ["invitation management", ["board.read", "board.invites.manage"]],
    ["archive", ["board.read", "board.archive"]],
    ["delete", ["board.read", "board.delete"]],
  ])(
    "rejects guest capability policy violation: %s",
    async (_label, capabilities) => {
      const request = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse({
            ...guestPayload,
            capabilities,
          }),
        ),
      );

      await expect(
        fetchStandaloneBoardAccessContext(expectedBoardId, {
          fetch: request,
          origin: "https://board.example.test",
        }),
      ).rejects.toMatchObject({
        code: "board.http.invalid-context",
        message: "Доступ к доске недоступен.",
      });
    },
  );

  it("uses the resolved context locally and adds the guest access epoch to unsafe requests", async () => {
    let expectedAccessEpoch: string = guestPayload.accessEpoch;
    const request = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/v1/boards/context") {
        return Promise.resolve(jsonResponse(guestPayload));
      }
      expect(url.pathname).toBe(
        `/api/v1/boards/${encodeURIComponent(expectedBoardId)}/collaboration-ticket`,
      );
      expect(new Headers(init?.headers).get("X-Board-Access-Epoch")).toBe(
        expectedAccessEpoch,
      );
      return Promise.resolve(
        jsonResponse({
          expiresInSeconds: 30,
          protocolVersion: "1.1",
          ticket: "ticket-ephemeral-standalone",
          websocketPath: `/api/v1/boards/${expectedBoardId}/collaboration`,
        }),
      );
    });
    const context = await fetchStandaloneBoardAccessContext(expectedBoardId, {
      fetch: request,
      origin: "https://board.example.test",
    });
    const repository = createStandaloneBoardHttpRepository(context, {
      fetch: request,
      origin: "https://board.example.test",
    });

    const callsBeforeContext = request.mock.calls.length;
    const session = await repository.context();
    expect(request).toHaveBeenCalledTimes(callsBeforeContext);
    expect(session.actorId).toBe(context.actorId);
    expect(session.csrfToken).toBe(context.csrfToken);

    await repository.collaborationTicket(
      expectedBoardId,
      "client:standalone-test",
      context.csrfToken,
    );
    expect(request).toHaveBeenCalledTimes(callsBeforeContext + 1);

    expectedAccessEpoch = "epoch:guest:standalone-02";
    repository.updateAccessContext({
      ...context,
      accessEpoch: "epoch:guest:standalone-02",
      capabilities: ["board.read", "collaboration.connect"],
      csrfToken: "csrf-guest-standalone-02",
    });
    const refreshedSession = await repository.context();
    await repository.collaborationTicket(
      expectedBoardId,
      "client:standalone-refreshed",
      refreshedSession.csrfToken,
    );
    const refreshedRequest = request.mock.calls.at(-1);
    expect(
      new Headers(refreshedRequest?.[1]?.headers).get("X-Board-Access-Epoch"),
    ).toBe("epoch:guest:standalone-02");
    expect(refreshedSession.csrfToken).toBe("csrf-guest-standalone-02");
  });

  it("rejects refreshed contexts that change the durable principal scope", () => {
    const repository = createStandaloneBoardHttpRepository(
      { ...guestPayload, actorId: actorId(guestPayload.actorId) },
      {
        fetch: vi.fn<typeof fetch>(),
        origin: "https://board.example.test",
      },
    );

    expect(() =>
      repository.updateAccessContext({
        ...guestPayload,
        actorId: actorId("user:unexpected-teacher"),
        cacheScopeId: guestPayload.cacheScopeId,
        capabilities: [
          "board.read",
          "board.write",
          "board.snapshot.write",
          "collaboration.connect",
          "board.export",
          "board.history.read",
          "board.invites.manage",
          "board.archive",
          "board.delete",
        ],
        displayName: "Unexpected teacher",
        organizationId: "organization:unexpected",
        principalType: "teacher",
        role: "tutor",
        userId: "user:unexpected-teacher",
      }),
    ).toThrow("changed principal type");
  });

  it("does not add guest epoch headers to teacher requests", async () => {
    const teacherContext = {
      ...guestPayload,
      actorId: actorId("user:teacher-01"),
      cacheScopeId: "scope:teacher:standalone-01",
      capabilities: [
        "board.read",
        "board.write",
        "board.snapshot.write",
        "collaboration.connect",
        "board.export",
        "board.history.read",
        "board.invites.manage",
        "board.archive",
        "board.delete",
      ],
      displayName: "Артём Александрович",
      organizationId: "organization:01",
      principalType: "teacher",
      role: "tutor",
      userId: "user:teacher-01",
    } as const;
    const request = vi.fn<typeof fetch>((_input, init) => {
      expect(new Headers(init?.headers).has("X-Board-Access-Epoch")).toBe(
        false,
      );
      return Promise.resolve(
        jsonResponse({
          expiresInSeconds: 30,
          protocolVersion: "1.1",
          ticket: "ticket-teacher",
          websocketPath: `/api/v1/boards/${expectedBoardId}/collaboration`,
        }),
      );
    });
    const repository = createStandaloneBoardHttpRepository(teacherContext, {
      fetch: request,
      origin: "https://board.example.test",
    });

    await repository.collaborationTicket(
      expectedBoardId,
      "client:teacher-test",
      teacherContext.csrfToken,
    );
  });
});
