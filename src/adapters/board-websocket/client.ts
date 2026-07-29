import { z } from "zod";

import type {
  BoardAccessRole,
  BoardPlatformRepository,
  DocumentId,
} from "../../core/public";

const identifierSchema = z.string().min(1).max(128);
const readySchema = z
  .object({
    clientId: identifierSchema,
    currentRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    heartbeatSeconds: z.number().int().positive().max(120),
    protocolVersion: z.literal("1.0"),
    type: z.literal("ready"),
  })
  .strict();
const revisionSchema = z
  .object({
    actorId: identifierSchema,
    baseRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    idempotencyKey: identifierSchema,
    protocolVersion: z.literal("1.0"),
    revision: z.number().int().positive(),
    type: z.literal("board.revision"),
  })
  .strict();
const presenceSchema = z
  .object({
    actorId: identifierSchema,
    clientId: identifierSchema,
    cursor: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .strict()
      .nullable()
      .optional(),
    protocolVersion: z.literal("1.0"),
    role: z.enum(["admin", "parent", "student", "tutor"]),
    selectedObjectIds: z.array(identifierSchema).max(200).optional(),
    sequence: z.number().int().nonnegative().optional(),
    type: z.enum(["presence.joined", "presence.left", "presence.updated"]),
    viewport: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        zoom: z.number().positive().max(64),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export interface BoardPresence {
  readonly actorId: string;
  readonly clientId: string;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly role: BoardAccessRole;
  readonly selectedObjectIds: readonly string[];
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  } | null;
}

export interface LocalBoardPresence {
  readonly cursor?: { readonly x: number; readonly y: number } | null;
  readonly selectedObjectIds?: readonly string[];
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  } | null;
}

export type BoardCollaborationStatus = "connecting" | "offline" | "online";

export interface BoardCollaborationClientOptions {
  readonly createClientId?: () => string;
  readonly createWebSocket?: (
    url: string,
    protocols: readonly string[],
  ) => WebSocket;
  readonly documentId: DocumentId;
  readonly onPresence: (participants: readonly BoardPresence[]) => void;
  readonly onRevision: (revision: number) => void;
  readonly onStatus: (status: BoardCollaborationStatus) => void;
  readonly origin?: string;
  readonly repository: BoardPlatformRepository;
}

export class BoardCollaborationClient {
  readonly #clientId: string;
  readonly #createWebSocket: NonNullable<
    BoardCollaborationClientOptions["createWebSocket"]
  >;
  readonly #documentId: DocumentId;
  readonly #onPresence: BoardCollaborationClientOptions["onPresence"];
  readonly #onRevision: BoardCollaborationClientOptions["onRevision"];
  readonly #onStatus: BoardCollaborationClientOptions["onStatus"];
  readonly #origin: string;
  readonly #participants = new Map<string, BoardPresence>();
  readonly #repository: BoardPlatformRepository;
  #heartbeat: number | null = null;
  #presence: LocalBoardPresence = {};
  #presenceTimer: number | null = null;
  #reconnect: number | null = null;
  #sequence = 0;
  #socket: WebSocket | null = null;
  #stopped = true;

  constructor(options: BoardCollaborationClientOptions) {
    this.#clientId =
      options.createClientId?.() ?? `browser:${crypto.randomUUID()}`;
    this.#createWebSocket =
      options.createWebSocket ??
      ((url, protocols) => new WebSocket(url, [...protocols]));
    this.#documentId = options.documentId;
    this.#onPresence = options.onPresence;
    this.#onRevision = options.onRevision;
    this.#onStatus = options.onStatus;
    this.#origin =
      options.origin ??
      (typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin);
    this.#repository = options.repository;
  }

  start(): void {
    if (!this.#stopped) {
      return;
    }
    this.#stopped = false;
    void this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
    this.#socket?.close(1000, "Client closed");
    this.#socket = null;
    this.#participants.clear();
    this.#onPresence([]);
  }

  updatePresence(presence: LocalBoardPresence): void {
    this.#presence = { ...this.#presence, ...presence };
    if (this.#presenceTimer !== null) {
      return;
    }
    this.#presenceTimer = window.setTimeout(() => {
      this.#presenceTimer = null;
      this.#sendPresence();
    }, 50);
  }

  async #connect(): Promise<void> {
    if (this.#stopped) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.#onStatus("offline");
      this.#scheduleReconnect();
      return;
    }
    this.#onStatus("connecting");
    try {
      const context = await this.#repository.context();
      const ticket = await this.#repository.collaborationTicket(
        this.#documentId,
        this.#clientId,
        context.csrfToken,
      );
      if (this.#stopped) {
        return;
      }
      const url = new URL(ticket.websocketPath, this.#origin);
      if (url.origin !== new URL(this.#origin).origin) {
        throw new Error("Collaboration WebSocket must be same-origin.");
      }
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", ticket.ticket);
      const socket = this.#createWebSocket(url.href, ["tutorboard.v1"]);
      this.#socket = socket;
      socket.addEventListener("message", (event) => {
        this.#receive(String(event.data));
      });
      socket.addEventListener("close", () => {
        if (this.#socket === socket) {
          this.#socket = null;
        }
        this.#clearHeartbeat();
        if (!this.#stopped) {
          this.#onStatus("offline");
          this.#scheduleReconnect();
        }
      });
      socket.addEventListener("error", () => socket.close());
    } catch {
      this.#onStatus("offline");
      this.#scheduleReconnect();
    }
  }

  #receive(raw: string): void {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.#socket?.close(1003, "Invalid JSON");
      return;
    }
    const ready = readySchema.safeParse(value);
    if (ready.success) {
      if (
        ready.data.documentId !== this.#documentId ||
        ready.data.clientId !== this.#clientId
      ) {
        this.#socket?.close(1008, "Room mismatch");
        return;
      }
      this.#onStatus("online");
      this.#heartbeat = window.setInterval(() => {
        if (this.#socket?.readyState === 1) {
          this.#socket.send('{"type":"heartbeat"}');
        }
      }, ready.data.heartbeatSeconds * 1000);
      this.#sendPresence();
      return;
    }
    const revision = revisionSchema.safeParse(value);
    if (revision.success) {
      if (revision.data.documentId !== this.#documentId) {
        this.#socket?.close(1008, "Room mismatch");
        return;
      }
      this.#onRevision(revision.data.revision);
      return;
    }
    const presence = presenceSchema.safeParse(value);
    if (presence.success) {
      if (presence.data.clientId === this.#clientId) {
        return;
      }
      if (presence.data.type === "presence.left") {
        this.#participants.delete(presence.data.clientId);
      } else {
        const previous = this.#participants.get(presence.data.clientId);
        this.#participants.set(presence.data.clientId, {
          actorId: presence.data.actorId,
          clientId: presence.data.clientId,
          cursor: presence.data.cursor ?? previous?.cursor ?? null,
          role: presence.data.role,
          selectedObjectIds:
            presence.data.selectedObjectIds ??
            previous?.selectedObjectIds ??
            [],
          viewport: presence.data.viewport ?? previous?.viewport ?? null,
        });
      }
      this.#onPresence([...this.#participants.values()]);
      if (presence.data.type === "presence.joined") {
        // Reply with our current ephemeral state so a newly joined client can
        // discover participants that were already in the room.
        this.#sendPresence();
      }
      return;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      (value as { type?: unknown }).type === "heartbeat.ack"
    ) {
      return;
    }
    this.#socket?.close(1003, "Unsupported message");
  }

  #sendPresence(): void {
    if (this.#socket?.readyState !== 1) {
      return;
    }
    this.#socket.send(
      JSON.stringify({
        ...this.#presence,
        selectedObjectIds: this.#presence.selectedObjectIds ?? [],
        sequence: ++this.#sequence,
        type: "presence",
      }),
    );
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnect !== null) {
      return;
    }
    this.#reconnect = window.setTimeout(() => {
      this.#reconnect = null;
      void this.#connect();
    }, 2_000);
  }

  #clearHeartbeat(): void {
    if (this.#heartbeat !== null) {
      window.clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
  }

  #clearTimers(): void {
    this.#clearHeartbeat();
    if (this.#presenceTimer !== null) {
      window.clearTimeout(this.#presenceTimer);
      this.#presenceTimer = null;
    }
    if (this.#reconnect !== null) {
      window.clearTimeout(this.#reconnect);
      this.#reconnect = null;
    }
  }
}
