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
