import { z } from "zod";

import type {
  BoardAccessRole,
  BoardPlatformRepository,
  DocumentId,
} from "../../core/public";

export const maximumBoardCollaborationMessageCharacters = 32_768;
export const maximumBoardCollaborationMessagesPerSecond = 30;
export const maximumBoardCollaborationParticipants = 200;

const identifierSchema = z.string().min(1).max(128);
const protocolVersionSchema = z.enum(["1.0", "1.1"]);
const pointSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();
const readySchema = z
  .object({
    clientId: identifierSchema,
    currentRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    heartbeatSeconds: z.number().int().positive().max(120),
    protocolVersion: protocolVersionSchema,
    type: z.literal("ready"),
  })
  .strict();
const revisionSchema = z
  .object({
    actorId: identifierSchema,
    baseRevision: z.number().int().nonnegative(),
    documentId: identifierSchema,
    idempotencyKey: identifierSchema,
    protocolVersion: protocolVersionSchema,
    revision: z.number().int().positive(),
    type: z.literal("board.revision"),
  })
  .strict();
const participantSchema = z
  .object({
    actorId: identifierSchema,
    clientId: identifierSchema,
    cursor: pointSchema.nullable().optional(),
    displayName: z.string().min(1).max(128).optional(),
    protocolVersion: protocolVersionSchema,
    role: z.enum(["admin", "parent", "student", "tutor"]),
    selectedObjectIds: z.array(identifierSchema).max(200).optional(),
    sequence: z.number().int().nonnegative().optional(),
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
const presenceSchema = participantSchema
  .extend({
    type: z.enum(["presence.joined", "presence.left", "presence.updated"]),
  })
  .strict();
const presenceSnapshotSchema = z
  .object({
    participants: z
      .array(participantSchema)
      .max(maximumBoardCollaborationParticipants),
    protocolVersion: protocolVersionSchema,
    type: z.literal("presence.snapshot"),
  })
  .strict();
const inkPreviewSchema = z
  .object({
    actorId: identifierSchema,
    clientId: identifierSchema,
    displayName: z.string().min(1).max(128),
    phase: z.enum(["start", "update", "end", "cancel"]),
    points: z.array(pointSchema).max(64),
    previewId: identifierSchema,
    protocolVersion: protocolVersionSchema,
    sequence: z.number().int().nonnegative(),
    style: z
      .object({
        opacity: z.number().min(0).max(1),
        stroke: z.string().min(1).max(32),
        strokeWidth: z.number().positive().max(128),
      })
      .strict()
      .optional(),
    type: z.literal("preview.ink"),
  })
  .strict();
const transformSnapshotSchema = z
  .object({
    objectId: identifierSchema,
    position: pointSchema,
    rotation: z.number().finite().min(-360_000).max(360_000),
    scale: z
      .object({
        x: z.number().positive().max(100),
        y: z.number().positive().max(100),
      })
      .strict(),
  })
  .strict();
const transformPreviewSchema = z
  .object({
    actorId: identifierSchema,
    clientId: identifierSchema,
    displayName: z.string().min(1).max(128),
    phase: z.enum(["update", "end", "cancel"]),
    previewId: identifierSchema,
    protocolVersion: protocolVersionSchema,
    sequence: z.number().int().nonnegative(),
    transforms: z.array(transformSnapshotSchema).max(200),
    type: z.literal("preview.transform"),
  })
  .strict();

export interface BoardPresence {
  readonly actorId: string;
  readonly clientId: string;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  readonly displayName: string;
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

export interface BoardInkPreview {
  readonly actorId: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly previewId: string;
  readonly style: {
    readonly opacity: number;
    readonly stroke: string;
    readonly strokeWidth: number;
  };
}

export interface LocalBoardInkPreview {
  readonly phase: "cancel" | "end" | "start" | "update";
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  readonly previewId: string;
  readonly style?: BoardInkPreview["style"];
}

export interface BoardTransformSnapshot {
  readonly objectId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly rotation: number;
  readonly scale: { readonly x: number; readonly y: number };
}

export interface BoardTransformPreview {
  readonly actorId: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly previewId: string;
  readonly transforms: readonly BoardTransformSnapshot[];
}

export interface LocalBoardTransformPreview {
  readonly phase: "cancel" | "end" | "update";
  readonly previewId: string;
  readonly transforms?: readonly BoardTransformSnapshot[];
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
  readonly onInkPreviews?: (previews: readonly BoardInkPreview[]) => void;
  readonly onRevision: (revision: number) => void;
  readonly onStatus: (status: BoardCollaborationStatus) => void;
  readonly onTransformPreviews?: (
    previews: readonly BoardTransformPreview[],
  ) => void;
  readonly origin?: string;
  readonly repository: BoardPlatformRepository;
  readonly random?: () => number;
}

export class BoardCollaborationClient {
  readonly #clientId: string;
  readonly #createWebSocket: NonNullable<
    BoardCollaborationClientOptions["createWebSocket"]
  >;
  readonly #documentId: DocumentId;
  readonly #inkPreviews = new Map<string, BoardInkPreview>();
  readonly #onInkPreviews: NonNullable<
    BoardCollaborationClientOptions["onInkPreviews"]
  >;
  readonly #onPresence: BoardCollaborationClientOptions["onPresence"];
  readonly #onRevision: BoardCollaborationClientOptions["onRevision"];
  readonly #onStatus: BoardCollaborationClientOptions["onStatus"];
  readonly #onTransformPreviews: NonNullable<
    BoardCollaborationClientOptions["onTransformPreviews"]
  >;
  readonly #origin: string;
  readonly #participants = new Map<string, BoardPresence>();
  readonly #participantSequences = new Map<string, number>();
  readonly #repository: BoardPlatformRepository;
  readonly #random: () => number;
  readonly #transformPreviews = new Map<string, BoardTransformPreview>();
  readonly #previewExpiryTimers = new Map<string, number>();
  #heartbeat: number | null = null;
  #heartbeatAckDeadline: number | null = null;
  #presence: LocalBoardPresence = {};
  #presenceTimer: number | null = null;
  #inkPreviewTimer: number | null = null;
  #pendingInkPreview: LocalBoardInkPreview | null = null;
  #pendingTransformPreview: LocalBoardTransformPreview | null = null;
  #reconnect: number | null = null;
  #reconnectAttempt = 0;
  #receivedMessageCount = 0;
  #receivedMessageWindowStartedAt = 0;
  #sequence = 0;
  #socket: WebSocket | null = null;
  #stopped = true;
  #pendingRevision = 0;
  #revisionTimer: number | null = null;
  #transformPreviewTimer: number | null = null;

  constructor(options: BoardCollaborationClientOptions) {
    this.#clientId =
      options.createClientId?.() ?? `browser:${crypto.randomUUID()}`;
    this.#createWebSocket =
      options.createWebSocket ??
      ((url, protocols) => new WebSocket(url, [...protocols]));
    this.#documentId = options.documentId;
    this.#onInkPreviews = options.onInkPreviews ?? (() => undefined);
    this.#onPresence = options.onPresence;
    this.#onRevision = options.onRevision;
    this.#onStatus = options.onStatus;
    this.#onTransformPreviews =
      options.onTransformPreviews ?? (() => undefined);
    this.#origin =
      options.origin ??
      (typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin);
    this.#repository = options.repository;
    this.#random = options.random ?? Math.random;
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
    this.#participantSequences.clear();
    this.#onPresence([]);
    this.#clearRemotePreviews();
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

  updateInkPreview(preview: LocalBoardInkPreview): void {
    if (preview.phase === "update") {
      const points = [
        ...(this.#pendingInkPreview?.previewId === preview.previewId
          ? (this.#pendingInkPreview.points ?? [])
          : []),
        ...(preview.points ?? []),
      ].slice(-64);
      this.#pendingInkPreview = { ...preview, points };
      if (this.#inkPreviewTimer === null) {
        this.#inkPreviewTimer = window.setTimeout(() => {
          this.#inkPreviewTimer = null;
          this.#flushInkPreview();
        }, 40);
      }
      return;
    }
    this.#flushInkPreview();
    this.#sendInkPreview(preview);
  }

  updateTransformPreview(preview: LocalBoardTransformPreview): void {
    if (preview.phase === "update") {
      this.#pendingTransformPreview = preview;
      if (this.#transformPreviewTimer === null) {
        this.#transformPreviewTimer = window.setTimeout(() => {
          this.#transformPreviewTimer = null;
          this.#flushTransformPreview();
        }, 40);
      }
      return;
    }
    this.#flushTransformPreview();
    this.#sendTransformPreview(preview);
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
        if (typeof event.data !== "string") {
          socket.close(1003, "Text messages required");
          return;
        }
        this.#receive(event.data);
      });
      socket.addEventListener("close", () => {
        if (this.#socket === socket) {
          this.#socket = null;
        }
        this.#clearHeartbeat();
        if (!this.#stopped) {
          this.#participants.clear();
          this.#participantSequences.clear();
          this.#onPresence([]);
          this.#clearRemotePreviews();
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
    if (raw.length > maximumBoardCollaborationMessageCharacters) {
      this.#socket?.close(1009, "Message too large");
      return;
    }
    const timestamp = Date.now();
    if (
      timestamp - this.#receivedMessageWindowStartedAt >= 1_000 ||
      timestamp < this.#receivedMessageWindowStartedAt
    ) {
      this.#receivedMessageWindowStartedAt = timestamp;
      this.#receivedMessageCount = 0;
    }
    this.#receivedMessageCount += 1;
    if (
      this.#receivedMessageCount > maximumBoardCollaborationMessagesPerSecond
    ) {
      this.#socket?.close(1008, "Message rate exceeded");
      return;
    }
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
      this.#reconnectAttempt = 0;
      this.#clearHeartbeat();
      this.#heartbeat = window.setInterval(() => {
        this.#sendHeartbeat(ready.data.heartbeatSeconds);
      }, ready.data.heartbeatSeconds * 1000);
      this.#sendPresence();
      this.#queueRevision(ready.data.currentRevision);
      return;
    }
    const revision = revisionSchema.safeParse(value);
    if (revision.success) {
      if (revision.data.documentId !== this.#documentId) {
        this.#socket?.close(1008, "Room mismatch");
        return;
      }
      this.#queueRevision(revision.data.revision);
      return;
    }
    const presence = presenceSchema.safeParse(value);
    if (presence.success) {
      if (presence.data.clientId === this.#clientId) {
        return;
      }
      const previousSequence = this.#participantSequences.get(
        presence.data.clientId,
      );
      const nextSequence = presence.data.sequence;
      if (
        presence.data.type !== "presence.left" &&
        previousSequence !== undefined &&
        (nextSequence === undefined || nextSequence <= previousSequence)
      ) {
        return;
      }
      if (
        previousSequence === undefined &&
        this.#participantSequences.size >= maximumBoardCollaborationParticipants
      ) {
        this.#socket?.close(1008, "Participant limit exceeded");
        return;
      }
      if (presence.data.type === "presence.left") {
        this.#participants.delete(presence.data.clientId);
        this.#participantSequences.delete(presence.data.clientId);
        this.#removeRemotePreviewsForClient(presence.data.clientId);
      } else {
        this.#participantSequences.set(
          presence.data.clientId,
          nextSequence ?? previousSequence ?? 0,
        );
        if (
          !this.#participants.has(presence.data.clientId) &&
          this.#participants.size >= maximumBoardCollaborationParticipants
        ) {
          this.#socket?.close(1008, "Participant limit exceeded");
          return;
        }
        const previous = this.#participants.get(presence.data.clientId);
        this.#participants.set(presence.data.clientId, {
          actorId: presence.data.actorId,
          clientId: presence.data.clientId,
          cursor: presence.data.cursor ?? previous?.cursor ?? null,
          displayName:
            presence.data.displayName ??
            previous?.displayName ??
            presence.data.actorId,
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
    const snapshot = presenceSnapshotSchema.safeParse(value);
    if (snapshot.success) {
      this.#participants.clear();
      this.#participantSequences.clear();
      for (const participant of snapshot.data.participants) {
        if (participant.clientId === this.#clientId) {
          continue;
        }
        this.#participantSequences.set(
          participant.clientId,
          participant.sequence ?? 0,
        );
        this.#participants.set(participant.clientId, {
          actorId: participant.actorId,
          clientId: participant.clientId,
          cursor: participant.cursor ?? null,
          displayName: participant.displayName ?? participant.actorId,
          role: participant.role,
          selectedObjectIds: participant.selectedObjectIds ?? [],
          viewport: participant.viewport ?? null,
        });
      }
      this.#onPresence([...this.#participants.values()]);
      return;
    }
    const inkPreview = inkPreviewSchema.safeParse(value);
    if (inkPreview.success) {
      const event = inkPreview.data;
      if (
        event.clientId === this.#clientId ||
        !this.#acceptParticipantSequence(event.clientId, event.sequence)
      ) {
        return;
      }
      const key = `ink:${event.clientId}:${event.previewId}`;
      this.#clearPreviewExpiry(key);
      if (event.phase === "cancel") {
        this.#inkPreviews.delete(key);
        this.#emitInkPreviews();
        return;
      }
      const previous = this.#inkPreviews.get(key);
      const style = event.style ?? previous?.style;
      if (style === undefined) {
        this.#socket?.close(1003, "Ink preview style missing");
        return;
      }
      this.#inkPreviews.set(key, {
        actorId: event.actorId,
        clientId: event.clientId,
        displayName: event.displayName,
        points: [
          ...(event.phase === "start" ? [] : (previous?.points ?? [])),
          ...event.points,
        ].slice(-2_048),
        previewId: event.previewId,
        style,
      });
      this.#emitInkPreviews();
      if (event.phase === "end") {
        this.#expireRemotePreview(key, "ink");
      }
      return;
    }
    const transformPreview = transformPreviewSchema.safeParse(value);
    if (transformPreview.success) {
      const event = transformPreview.data;
      if (
        event.clientId === this.#clientId ||
        !this.#acceptParticipantSequence(event.clientId, event.sequence)
      ) {
        return;
      }
      const key = `transform:${event.clientId}:${event.previewId}`;
      this.#clearPreviewExpiry(key);
      if (event.phase === "cancel") {
        this.#transformPreviews.delete(key);
        this.#emitTransformPreviews();
        return;
      }
      if (event.transforms.length > 0) {
        this.#transformPreviews.set(key, {
          actorId: event.actorId,
          clientId: event.clientId,
          displayName: event.displayName,
          previewId: event.previewId,
          transforms: event.transforms,
        });
        this.#emitTransformPreviews();
      }
      if (event.phase === "end") {
        this.#expireRemotePreview(key, "transform");
      }
      return;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      (value as { type?: unknown }).type === "heartbeat.ack"
    ) {
      this.#clearHeartbeatAckDeadline();
      return;
    }
    this.#socket?.close(1003, "Unsupported message");
  }

  #acceptParticipantSequence(clientId: string, sequence: number): boolean {
    const previous = this.#participantSequences.get(clientId);
    if (previous !== undefined && sequence <= previous) {
      return false;
    }
    this.#participantSequences.set(clientId, sequence);
    return true;
  }

  #sendInkPreview(preview: LocalBoardInkPreview): void {
    if (this.#socket?.readyState !== 1) {
      return;
    }
    this.#socket.send(
      JSON.stringify({
        phase: preview.phase,
        points: preview.points ?? [],
        previewId: preview.previewId,
        sequence: ++this.#sequence,
        ...(preview.style === undefined ? {} : { style: preview.style }),
        type: "preview.ink",
      }),
    );
  }

  #sendTransformPreview(preview: LocalBoardTransformPreview): void {
    if (this.#socket?.readyState !== 1) {
      return;
    }
    this.#socket.send(
      JSON.stringify({
        phase: preview.phase,
        previewId: preview.previewId,
        sequence: ++this.#sequence,
        transforms: preview.transforms ?? [],
        type: "preview.transform",
      }),
    );
  }

  #flushInkPreview(): void {
    if (this.#inkPreviewTimer !== null) {
      window.clearTimeout(this.#inkPreviewTimer);
      this.#inkPreviewTimer = null;
    }
    const pending = this.#pendingInkPreview;
    this.#pendingInkPreview = null;
    if (pending !== null && (pending.points?.length ?? 0) > 0) {
      this.#sendInkPreview(pending);
    }
  }

  #flushTransformPreview(): void {
    if (this.#transformPreviewTimer !== null) {
      window.clearTimeout(this.#transformPreviewTimer);
      this.#transformPreviewTimer = null;
    }
    const pending = this.#pendingTransformPreview;
    this.#pendingTransformPreview = null;
    if (pending !== null && (pending.transforms?.length ?? 0) > 0) {
      this.#sendTransformPreview(pending);
    }
  }

  #emitInkPreviews(): void {
    this.#onInkPreviews([...this.#inkPreviews.values()]);
  }

  #emitTransformPreviews(): void {
    this.#onTransformPreviews([...this.#transformPreviews.values()]);
  }

  #clearPreviewExpiry(key: string): void {
    const timer = this.#previewExpiryTimers.get(key);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.#previewExpiryTimers.delete(key);
    }
  }

  #expireRemotePreview(key: string, kind: "ink" | "transform"): void {
    this.#clearPreviewExpiry(key);
    this.#previewExpiryTimers.set(
      key,
      window.setTimeout(() => {
        this.#previewExpiryTimers.delete(key);
        if (kind === "ink") {
          this.#inkPreviews.delete(key);
          this.#emitInkPreviews();
        } else {
          this.#transformPreviews.delete(key);
          this.#emitTransformPreviews();
        }
      }, 750),
    );
  }

  #removeRemotePreviewsForClient(clientId: string): void {
    for (const [key, preview] of this.#inkPreviews) {
      if (preview.clientId === clientId) {
        this.#clearPreviewExpiry(key);
        this.#inkPreviews.delete(key);
      }
    }
    for (const [key, preview] of this.#transformPreviews) {
      if (preview.clientId === clientId) {
        this.#clearPreviewExpiry(key);
        this.#transformPreviews.delete(key);
      }
    }
    this.#emitInkPreviews();
    this.#emitTransformPreviews();
  }

  #clearRemotePreviews(): void {
    for (const timer of this.#previewExpiryTimers.values()) {
      window.clearTimeout(timer);
    }
    this.#previewExpiryTimers.clear();
    this.#inkPreviews.clear();
    this.#transformPreviews.clear();
    this.#emitInkPreviews();
    this.#emitTransformPreviews();
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
    const exponential = Math.min(30_000, 500 * 2 ** this.#reconnectAttempt);
    const delay = Math.round(exponential * (1 + this.#random() * 0.25));
    this.#reconnectAttempt = Math.min(this.#reconnectAttempt + 1, 10);
    this.#reconnect = window.setTimeout(() => {
      this.#reconnect = null;
      void this.#connect();
    }, delay);
  }

  #queueRevision(revision: number): void {
    this.#pendingRevision = Math.max(this.#pendingRevision, revision);
    if (this.#revisionTimer !== null) {
      return;
    }
    this.#revisionTimer = window.setTimeout(() => {
      this.#revisionTimer = null;
      const pending = this.#pendingRevision;
      this.#pendingRevision = 0;
      this.#onRevision(pending);
    }, 25);
  }

  #sendHeartbeat(heartbeatSeconds: number): void {
    if (this.#socket?.readyState !== 1) {
      return;
    }
    if (this.#heartbeatAckDeadline !== null) {
      this.#socket.close(4000, "Heartbeat acknowledgement timed out");
      return;
    }
    this.#socket.send('{"type":"heartbeat"}');
    this.#heartbeatAckDeadline = window.setTimeout(() => {
      this.#heartbeatAckDeadline = null;
      this.#socket?.close(4000, "Heartbeat acknowledgement timed out");
    }, heartbeatSeconds * 1000);
  }

  #clearHeartbeatAckDeadline(): void {
    if (this.#heartbeatAckDeadline !== null) {
      window.clearTimeout(this.#heartbeatAckDeadline);
      this.#heartbeatAckDeadline = null;
    }
  }

  #clearHeartbeat(): void {
    if (this.#heartbeat !== null) {
      window.clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
    this.#clearHeartbeatAckDeadline();
  }

  #clearTimers(): void {
    this.#clearHeartbeat();
    this.#pendingInkPreview = null;
    this.#pendingTransformPreview = null;
    if (this.#inkPreviewTimer !== null) {
      window.clearTimeout(this.#inkPreviewTimer);
      this.#inkPreviewTimer = null;
    }
    if (this.#transformPreviewTimer !== null) {
      window.clearTimeout(this.#transformPreviewTimer);
      this.#transformPreviewTimer = null;
    }
    if (this.#presenceTimer !== null) {
      window.clearTimeout(this.#presenceTimer);
      this.#presenceTimer = null;
    }
    if (this.#reconnect !== null) {
      window.clearTimeout(this.#reconnect);
      this.#reconnect = null;
    }
    if (this.#revisionTimer !== null) {
      window.clearTimeout(this.#revisionTimer);
      this.#revisionTimer = null;
      this.#pendingRevision = 0;
    }
  }
}
