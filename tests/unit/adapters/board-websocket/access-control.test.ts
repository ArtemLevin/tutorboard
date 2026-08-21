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
      onAccessEvent: (event) => accessEvents.push(event),
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

  it("surfaces capability changes without closing the connection", async () => {
    const socket = new FakeSocket();
    const events: BoardAccessControlEvent[] = [];
    const createWebSocket = vi.fn(() => socket as unknown as WebSocket);
    const client = new BoardCollaborationClient({
      createWebSocket,
      documentId: documentId("document:lesson"),
      onAccessEvent: (event) => events.push(event),
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
    socket.receive({
      accessEpoch: "access-epoch-next",
      boardId: "document:lesson",
      refreshRequired: true,
      schemaVersion: "1.0",
      type: "access.capabilities.changed",
    });

    expect(events).toMatchObject([
      {
        accessEpoch: "access-epoch-next",
        type: "access.capabilities.changed",
      },
    ]);
    expect(socket.closeCode).toBeNull();
    client.stop();
  });
});
