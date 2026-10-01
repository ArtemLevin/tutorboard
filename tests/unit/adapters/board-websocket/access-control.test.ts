import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BoardCollaborationClient,
  type BoardAccessControlEvent,
  type BoardCollaborationStatus,
} from "../../../../src/adapters/board-websocket/public";
import { actorId, documentId } from "../../../../src/core/public";
import type { BoardCollaborationRepository } from "../../../../src/core/ports/public";

class FakeSocket extends EventTarget {
  closeCode: number | null = null;
  readyState = 0;

  close(code = 1000): void {
    this.closeCode = code;
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }

  receive(value: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    );
  }

  send(): void {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("collaboration access control", () => {
  it("treats access.revoked as terminal and never reconnects", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const statuses: BoardCollaborationStatus[] = [];
    const accessEvents: BoardAccessControlEvent[] = [];
    const repository: BoardCollaborationRepository = {
      collaborationTicket: vi.fn().mockResolvedValue({
        expiresInSeconds: 30,
        protocolVersion: "1.1",
        ticket: "one-time-ticket",
        websocketPath: "/collaboration",
      }),
      context: vi.fn().mockResolvedValue({
        actorId: actorId("actor:tutor"),
        csrfToken: "csrf-token",
        organizationId: "organization:1",
        role: "tutor",
      }),
    };
    const client = new BoardCollaborationClient({
      createClientId: () => "browser:test",
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      documentId: documentId("document:lesson"),
      onAccessEvent: (event) => {
        accessEvents.push(event);
      },
      onPresence: () => undefined,
      onRevision: () => undefined,
      onStatus: (status) => statuses.push(status),
      origin: "https://tutor.example.test",
      repository,
    });

    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const socket = sockets[0]!;
    socket.receive({
      boardId: "document:lesson",
      schemaVersion: "1.0",
      terminal: true,
      type: "access.revoked",
    });

    await vi.waitFor(() => expect(accessEvents).toHaveLength(1));
    expect(accessEvents).toEqual([
      {
        boardId: "document:lesson",
        schemaVersion: "1.0",
        terminal: true,
        type: "access.revoked",
      },
    ]);
    expect(statuses.at(-1)).toBe("revoked");
    expect(socket.closeCode).toBe(4403);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    client.start();
    expect(statuses.at(-1)).toBe("revoked");
    expect(sockets).toHaveLength(1);
  });

  it("refreshes access before reconnecting with a new ticket", async () => {
    const sockets: FakeSocket[] = [];
    const events: BoardAccessControlEvent[] = [];
    let finishRefresh: () => void = () => undefined;
    const createWebSocket = vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });
    const client = new BoardCollaborationClient({
      createWebSocket,
      documentId: documentId("document:lesson"),
      onAccessEvent: (event) => {
        events.push(event);
        return new Promise<void>((resolve) => {
          finishRefresh = resolve;
        });
      },
      onPresence: () => undefined,
      onRevision: () => undefined,
      onStatus: () => undefined,
      origin: "https://tutor.example.test",
      repository: {
        collaborationTicket: vi.fn().mockResolvedValue({
          expiresInSeconds: 30,
          protocolVersion: "1.1",
          ticket: "ticket",
          websocketPath: "/collaboration",
        }),
        context: vi.fn().mockResolvedValue({
          actorId: actorId("actor:tutor"),
          csrfToken: "csrf-token",
          organizationId: "organization:1",
          role: "tutor",
        }),
      },
    });

    client.start();
    await vi.waitFor(() => expect(createWebSocket).toHaveBeenCalledTimes(1));
    const firstSocket = sockets[0]!;
    firstSocket.receive({
      accessEpoch: "access-epoch-next",
      boardId: "document:lesson",
      refreshRequired: true,
      schemaVersion: "1.0",
      type: "access.capabilities.changed",
    });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events).toMatchObject([
      {
        accessEpoch: "access-epoch-next",
        type: "access.capabilities.changed",
      },
    ]);
    expect(firstSocket.closeCode).toBeNull();
    expect(createWebSocket).toHaveBeenCalledTimes(1);

    finishRefresh();
    await vi.waitFor(() => expect(createWebSocket).toHaveBeenCalledTimes(2));
    expect(firstSocket.closeCode).toBe(1000);
    client.stop();
  });

  it("stays stopped when refreshed access removes collaboration", async () => {
    const sockets: FakeSocket[] = [];
    const client = new BoardCollaborationClient({
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      documentId: documentId("document:lesson"),
      onAccessEvent: () => false,
      onPresence: () => undefined,
      onRevision: () => undefined,
      onStatus: () => undefined,
      origin: "https://tutor.example.test",
      repository: {
        collaborationTicket: vi.fn().mockResolvedValue({
          expiresInSeconds: 30,
          protocolVersion: "1.1",
          ticket: "ticket",
          websocketPath: "/collaboration",
        }),
        context: vi.fn().mockResolvedValue({
          actorId: actorId("actor:tutor"),
          csrfToken: "csrf-token",
          organizationId: "organization:1",
          role: "tutor",
        }),
      },
    });

    client.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.receive({
      accessEpoch: "access-epoch-next",
      boardId: "document:lesson",
      refreshRequired: true,
      schemaVersion: "1.0",
      type: "access.capabilities.changed",
    });

    await vi.waitFor(() => expect(sockets[0]!.closeCode).toBe(1000));
    expect(sockets).toHaveLength(1);
  });
});

describe("ticket denial recovery", () => {
  function setup() {
    vi.useFakeTimers();
    const context = {
      actorId: actorId("actor:tutor"),
      csrfToken: "old-csrf",
      organizationId: "organization:1",
      role: "tutor" as const,
    };
    const repository = {
      context: vi.fn(() => Promise.resolve(context)),
      collaborationTicket: vi.fn(() =>
        Promise.resolve({
          expiresInSeconds: 30,
          protocolVersion: "1.1" as const,
          ticket: "ticket",
          websocketPath: "/collaboration",
        }),
      ),
    };
    const sockets: FakeSocket[] = [];
    const onStatus = vi.fn();
    const onAccessEvent = vi.fn();
    const client = new BoardCollaborationClient({
      documentId: documentId("document:lesson"),
      repository,
      onStatus,
      onAccessEvent,
      onPresence: () => undefined,
      onRevision: () => undefined,
      random: () => 0,
      origin: "https://tutor.example.test",
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });
    return { client, repository, sockets, onStatus, onAccessEvent, context };
  }

  it.each([401, 403, 404, 410])(
    "stops on HTTP %s without a refresh handler",
    async (status) => {
      const { client, repository, onStatus, onAccessEvent, sockets } = setup();
      repository.collaborationTicket.mockRejectedValue({
        status,
        retryable: false,
      });
      client.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(repository.collaborationTicket).toHaveBeenCalledTimes(1);
      expect(onStatus).toHaveBeenLastCalledWith("revoked");
      expect(onAccessEvent).toHaveBeenCalledTimes(1);
      expect(onAccessEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "access.revoked" }),
      );
      client.stop();
      client.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(repository.collaborationTicket).toHaveBeenCalledTimes(1);
      expect(sockets).toHaveLength(0);
    },
  );

  it("refreshes a stale CSRF context before the second ticket request", async () => {
    const { client, repository, context, sockets } = setup();
    repository.collaborationTicket.mockRejectedValueOnce({ status: 403 });
    const refresh = vi.fn(() => {
      context.csrfToken = "new-csrf";
      return Promise.resolve(true);
    });
    client.setAccessRefreshHandler(refresh);
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.collaborationTicket).toHaveBeenLastCalledWith(
      "document:lesson",
      expect.any(String),
      "new-csrf",
    );
    expect(sockets).toHaveLength(1);
    client.stop();
  });

  it("bounds repeated denial to one refresh and two ticket requests", async () => {
    const { client, repository, onStatus } = setup();
    repository.collaborationTicket.mockRejectedValue({ status: 403 });
    const refresh = vi.fn(() => Promise.resolve(true));
    client.setAccessRefreshHandler(refresh);
    client.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.collaborationTicket).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith("revoked");
    client.stop();
  });

  it("keeps backoff for temporary ticket and refresh failures", async () => {
    const { client, repository, sockets, onAccessEvent } = setup();
    repository.collaborationTicket
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 403 });
    client.setAccessRefreshHandler(
      vi.fn().mockRejectedValueOnce(new TypeError("Network unavailable")),
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.collaborationTicket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.collaborationTicket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(1);
    expect(onAccessEvent).not.toHaveBeenCalled();
    client.stop();
  });

  it("does not reconnect after refresh removes collaboration capability", async () => {
    const { client, repository, sockets } = setup();
    repository.collaborationTicket.mockRejectedValue({ status: 403 });
    client.setAccessRefreshHandler(() => Promise.resolve(false));
    client.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.collaborationTicket).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(0);
  });

  it("ignores a denial from an obsolete connection generation", async () => {
    const { client, repository, sockets, onAccessEvent } = setup();
    let rejectTicket: (error: unknown) => void = () => undefined;
    repository.collaborationTicket.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectTicket = reject;
        }),
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    rejectTicket({ status: 403 });
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    expect(onAccessEvent).not.toHaveBeenCalled();
    client.stop();
  });

  it("notifies the engine owner on terminal close 4403", async () => {
    const { client, sockets, repository, onAccessEvent } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.close(4403);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onAccessEvent).toHaveBeenCalledTimes(1);
    expect(repository.collaborationTicket).toHaveBeenCalledTimes(1);
    client.stop();
  });
});

it("does not repeatedly refresh an invalid access context after ticket denial", async () => {
  vi.useFakeTimers();
  const ticket = vi.fn().mockRejectedValue({ status: 403 });
  const refresh = vi.fn().mockRejectedValue(new Error("Invalid access epoch"));
  const client = new BoardCollaborationClient({
    documentId: documentId("document:lesson"),
    repository: {
      context: () =>
        Promise.resolve({
          actorId: actorId("actor:tutor"),
          csrfToken: "csrf",
          organizationId: "org",
          role: "tutor",
        }),
      collaborationTicket: ticket,
    },
    onPresence: () => undefined,
    onRevision: () => undefined,
    onStatus: () => undefined,
  });
  client.setAccessRefreshHandler(refresh);
  client.start();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ticket).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  client.stop();
});
