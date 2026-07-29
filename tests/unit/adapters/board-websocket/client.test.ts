import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BoardCollaborationClient,
  type BoardPresence,
} from "../../../../src/adapters/board-websocket/public";
import {
  actorId,
  documentId,
  type BoardPlatformRepository,
} from "../../../../src/core/public";

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState = 0;

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close"));
  }

  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }

  receive(value: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    );
  }

  send(value: string): void {
    this.sent.push(value);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Board collaboration WebSocket adapter", () => {
  it("uses a one-time same-origin ticket and keeps presence out of commands", async () => {
    const context = vi.fn().mockResolvedValue({
      actorId: actorId("actor:tutor"),
      csrfToken: "csrf-token",
      organizationId: "organization:1",
      role: "tutor",
    });
    const collaborationTicket = vi.fn().mockResolvedValue({
      expiresInSeconds: 30,
      protocolVersion: "1.0",
      ticket: "opaque-ticket",
      websocketPath: "/api/v1/boards/document%3Alesson/collaboration",
    });
    const socket = new FakeSocket();
    let socketUrl = "";
    let protocols: readonly string[] = [];
    const revisions: number[] = [];
    let participants: readonly BoardPresence[] = [];
    const statuses: string[] = [];
    const client = new BoardCollaborationClient({
      createClientId: () => "browser:test",
      createWebSocket: (url, selectedProtocols) => {
        socketUrl = url;
        protocols = selectedProtocols;
        return socket as unknown as WebSocket;
      },
      documentId: documentId("document:lesson"),
      onPresence: (value) => {
        participants = value;
      },
      onRevision: (revision) => revisions.push(revision),
      onStatus: (status) => statuses.push(status),
      origin: "https://tutor.example.test",
      repository: {
        collaborationTicket,
        context,
      } as unknown as BoardPlatformRepository,
    });

    client.start();
    await vi.waitFor(() => expect(collaborationTicket).toHaveBeenCalled());
    expect(socketUrl).toBe(
      "wss://tutor.example.test/api/v1/boards/document%3Alesson/collaboration?ticket=opaque-ticket",
    );
    expect(protocols).toEqual(["tutorboard.v1"]);
    socket.open();
    socket.receive({
      clientId: "browser:test",
      currentRevision: 7,
      documentId: "document:lesson",
      heartbeatSeconds: 20,
      protocolVersion: "1.0",
      type: "ready",
    });
    client.updatePresence({
      cursor: { x: 10, y: 20 },
      selectedObjectIds: ["object:1"],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 70));
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toEqual({
      cursor: { x: 10, y: 20 },
      selectedObjectIds: ["object:1"],
      sequence: 2,
      type: "presence",
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    socket.receive({
      actorId: "actor:newcomer",
      clientId: "browser:newcomer",
      protocolVersion: "1.0",
      role: "student",
      type: "presence.joined",
    });
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toMatchObject({
      cursor: { x: 10, y: 20 },
      selectedObjectIds: ["object:1"],
      sequence: 3,
      type: "presence",
    });

    socket.receive({
      actorId: "actor:other",
      baseRevision: 7,
      documentId: "document:lesson",
      idempotencyKey: "remote:8",
      protocolVersion: "1.0",
      revision: 8,
      type: "board.revision",
    });
    socket.receive({
      actorId: "actor:other",
      clientId: "browser:other",
      cursor: { x: 50, y: 60 },
      protocolVersion: "1.0",
      role: "student",
      selectedObjectIds: [],
      sequence: 1,
      type: "presence.updated",
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(revisions).toEqual([8]);
    expect(participants).toHaveLength(2);
    expect(
      participants.find(({ clientId }) => clientId === "browser:other"),
    ).toMatchObject({
      actorId: "actor:other",
      clientId: "browser:other",
      cursor: { x: 50, y: 60 },
    });
    expect(statuses).toContain("online");
    client.stop();
  });
});
