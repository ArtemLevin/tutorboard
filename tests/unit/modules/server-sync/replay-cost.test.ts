import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  documentId,
  type BoardCommand,
  type BoardCommandPage,
  type BoardDocument,
  type BoardServerRecovery,
  type BoardSessionContext,
  type ConfirmedBoardHead,
  type DocumentId,
  type CurrentOrderedBoardCommandEnvelope,
  type PendingBoardCommand,
  type PendingBoardCommandConflict,
  type PendingBoardCommandOrderingInput,
  type PendingBoardCommandQueue,
  type PushBoardCommandsResult,
  type ServerBoardDescriptor,
} from "../../../../src/core/public";
import {
  BoardSyncEngine,
  boardDocumentSha256,
  type BoardSyncState,
} from "../../../../src/modules/server-sync/public";

class MemoryQueue implements PendingBoardCommandQueue {
  conflicts: PendingBoardCommandConflict[] = [];
  head: ConfirmedBoardHead | null = null;
  items: PendingBoardCommand[] = [];

  acknowledge(_documentId: DocumentId, sequence: number): Promise<void> {
    this.items = this.items.filter((item) => item.sequence !== sequence);
    return Promise.resolve();
  }

  acknowledgeBatch(
    _documentId: DocumentId,
    sequences: readonly number[],
  ): Promise<void> {
    this.items = this.items.filter(
      (item) => !sequences.includes(item.sequence),
    );
    return Promise.resolve();
  }

  enqueueBatch(
    documentId: DocumentId,
    entries: readonly { command: BoardCommand; idempotencyKey: string }[],
    ordering: PendingBoardCommandOrderingInput = {},
  ): Promise<readonly PendingBoardCommand[]> {
    return Promise.all(
      entries.map(({ command, idempotencyKey }) =>
        this.enqueue(documentId, idempotencyKey, command, ordering),
      ),
    );
  }

  enqueue(
    documentIdValue: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
    ordering: PendingBoardCommandOrderingInput = {},
  ): Promise<PendingBoardCommand> {
    const item: PendingBoardCommand = {
      ...(ordering.batchId === undefined ? {} : { batchId: ordering.batchId }),
      ...(ordering.accessEpochAtCreation === undefined
        ? {}
        : { accessEpochAtCreation: ordering.accessEpochAtCreation }),
      command,
      documentId: documentIdValue,
      idempotencyKey,
      order: {
        baseRevisionAtCreation: ordering.baseRevisionAtCreation ?? 0,
        lamport:
          Math.max(
            ordering.observedLamport ?? 0,
            ordering.baseRevisionAtCreation ?? 0,
            this.items.at(-1)?.order.lamport ?? 0,
          ) + 1,
      },
      sequence: (this.items.at(-1)?.sequence ?? 0) + 1,
    };
    this.items.push(item);
    return Promise.resolve(item);
  }

  list(): Promise<readonly PendingBoardCommand[]> {
    return Promise.resolve([...this.items]);
  }

  loadHead(): Promise<ConfirmedBoardHead | null> {
    return Promise.resolve(this.head);
  }

  reconcile(
    _documentId: DocumentId,
    commands: readonly PendingBoardCommand[],
    knownSequences: readonly number[],
  ): Promise<void> {
    const known = new Set(knownSequences);
    this.items = [
      ...this.items.filter(({ sequence }) => !known.has(sequence)),
      ...commands,
    ].sort((left, right) => left.sequence - right.sequence);
    return Promise.resolve();
  }

  quarantineConflicts(
    _documentId: DocumentId,
    conflicts: readonly PendingBoardCommandConflict[],
  ): Promise<void> {
    this.conflicts.push(...conflicts);
    const sequences = new Set(conflicts.map(({ item }) => item.sequence));
    this.items = this.items.filter(({ sequence }) => !sequences.has(sequence));
    return Promise.resolve();
  }

  saveHead(head: ConfirmedBoardHead): Promise<void> {
    this.head = head;
    return Promise.resolve();
  }
}

class FakeRepository {
  contextValue: BoardSessionContext = {
    actorId: expectedActorId,
    csrfToken: "csrf-token",
    organizationId: "organization:1",
    role: "tutor",
  };
  descriptor: ServerBoardDescriptor = {
    archivedAt: null,
    currentDocumentSha256: "0".repeat(64),
    currentRevision: 0,
    documentId: expectedDocumentId,
    lastSnapshotRevision: 0,
    lessonId: "lesson:1",
    snapshotDue: false,
    studentId: "student:1",
  };
  recovery: BoardServerRecovery = {
    board: this.descriptor,
    commandBatches: [],
    snapshot: null,
  };
  pullPages: BoardCommandPage[] = [];
  pushResults: PushBoardCommandsResult[] = [];
  readonly pushed: CurrentOrderedBoardCommandEnvelope[] = [];
  readonly snapshots: {
    document: BoardDocument;
    revision: number;
    sha256: string;
  }[] = [];

  context(): Promise<BoardSessionContext> {
    return Promise.resolve(this.contextValue);
  }

  ensureBoard(): Promise<ServerBoardDescriptor> {
    return Promise.resolve(this.descriptor);
  }

  load(): Promise<BoardServerRecovery> {
    return Promise.resolve(this.recovery);
  }

  pull(): Promise<BoardCommandPage> {
    const page = this.pullPages.shift();
    return Promise.resolve(
      page ?? {
        currentRevision: this.recovery.board.currentRevision,
        hasMore: false,
        items: [],
      },
    );
  }

  push(
    envelope: CurrentOrderedBoardCommandEnvelope,
  ): Promise<PushBoardCommandsResult> {
    this.pushed.push(envelope);
    const result = this.pushResults.shift();
    return Promise.resolve(
      result ?? {
        currentDocumentSha256: envelope.expectedDocumentSha256,
        revision: envelope.baseRevision + 1,
        snapshotDue: false,
        status: "accepted",
      },
    );
  }

  saveSnapshot(
    _documentId: DocumentId,
    revision: number,
    document: BoardDocument,
    sha256: string,
  ): Promise<void> {
    this.snapshots.push({ document, revision, sha256 });
    return Promise.resolve();
  }
}

import { createDenseBoardDocument } from "../../../fixtures/dense-board";
import { DexiePendingBoardCommandQueue } from "../../../../src/adapters/persistence-dexie/public";
import * as core from "../../../../src/core/public";
vi.mock("../../../../src/core/public", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/core/public")>();
  return { ...actual, reduceBoardDocument: vi.fn(actual.reduceBoardDocument) };
});
const expectedDocumentId = documentId("document:audit-offline");
const expectedActorId = actorId("user:audit-teacher");
it.each([
  { count: 10, batch: false },
  { count: 20, batch: false },
  { count: 40, batch: false },
  { count: 40, batch: true },
])(
  "counts real offline replay at $count commands; batch=$batch",
  async ({ count, batch }) => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const read = core.validateBoardDocument(
      createDenseBoardDocument({
        strokeCount: 1000,
        strokeGeometry: "varied",
        staticCount: 0,
      }),
    );
    if (!read.valid) throw new Error("Invalid fixture");
    const initial = { ...read.document, id: expectedDocumentId };
    const queue = new MemoryQueue();
    queue.head = {
      document: initial,
      documentId: initial.id,
      revision: 0,
      session: {
        actorId: expectedActorId,
        organizationId: "organization:audit",
        role: "tutor",
      },
      sha256: await boardDocumentSha256(initial),
    };
    const repository = new FakeRepository();
    repository.load = () =>
      Promise.reject(Object.assign(new Error("Offline"), { retryable: true }));
    const observed: { state: BoardSyncState } = {
      state: { kind: "bootstrapping" },
    };
    let id = 0;
    const engine = new BoardSyncEngine({
      documentId: initial.id,
      queue,
      repository,
      createIdempotencyKey: () => `audit:${++id}`,
      now: () => "2026-10-13T12:00:00.000Z",
      onStateChange: (next) => {
        observed.state = next;
      },
      accessContext: {
        schemaVersion: "1.0",
        accessEpoch: "epoch:audit",
        actorId: expectedActorId,
        boardId: initial.id,
        cacheScopeId: "scope:audit",
        capabilities: ["board.read", "board.write"],
        csrfToken: "audit",
        displayName: "Audit",
        principalType: "teacher",
        role: "tutor",
        organizationId: "organization:audit",
        userId: "user:audit-teacher",
      },
    });
    try {
      await engine.bootstrap();
      expect(observed.state.kind).toBe("ready");
      const commands: BoardCommand[] = Array.from(
        { length: count },
        (_, i) => ({
          kind: "core.viewport.set",
          actorId: expectedActorId,
          id: commandId(`command:offline:${i}`),
          timestamp: "2026-10-13T12:00:00.000Z",
          viewport: { offset: { x: i + 1, y: 0 }, zoom: 1 },
        }),
      );
      let preview = initial;
      const documents = commands.map((command) => {
        const result = core.reduceBoardDocument(preview, command);
        if (!result.ok) throw new Error(result.error.message);
        return (preview = result.document);
      });
      const reducer = vi.mocked(core.reduceBoardDocument);
      reducer.mockClear();
      const reconcile = vi.spyOn(queue, "reconcile");
      const started = performance.now();
      if (batch) await engine.queueBatch(commands, documents.at(-1)!);
      else
        for (let index = 0; index < count; index++)
          await engine.queue(commands[index]!, documents[index]!);
      const durationMs = performance.now() - started;
      const expectedReplays = count;
      expect(reducer).toHaveBeenCalledTimes(expectedReplays);
      expect(reconcile).not.toHaveBeenCalled();
      expect(queue.items).toHaveLength(count);
      expect(observed.state.kind).toBe("ready");
      if (observed.state.kind === "ready")
        expect(observed.state.document.viewport.offset.x).toBe(count);
      online.mockReturnValue(true);
      await engine.setNetworkAvailable(true);
      expect(queue.items).toHaveLength(0);
      expect(reducer).toHaveBeenCalledTimes(count * 2);
      expect(reconcile).not.toHaveBeenCalled();
      expect(observed.state.kind).toBe("ready");
      if (observed.state.kind === "ready")
        expect(observed.state.document.viewport.offset.x).toBe(count);
      console.info(
        "FIXED_OFFLINE_REPLAY",
        JSON.stringify({
          strokes: 1000,
          count,
          batch,
          offlineReducerCalls: expectedReplays,
          offlineAndReconnectReducerCalls: reducer.mock.calls.length,
          durationMs,
        }),
      );
    } finally {
      engine.dispose();
      online.mockRestore();
    }
  },
  120_000,
);

it.each([false, true])(
  "retains the checked IndexedDB prefix across a conflicting new batch; storageFailure=%s",
  async (storageFailure) => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const queue = new DexiePendingBoardCommandQueue(
      `incremental-${crypto.randomUUID()}`,
    );
    const repository = new FakeRepository();
    const states: BoardSyncState[] = [];
    let key = 0;
    const engine = new BoardSyncEngine({
      documentId: expectedDocumentId,
      queue,
      repository,
      createIdempotencyKey: () => `incremental:${++key}`,
      now: () => "2026-10-13T12:00:00.000Z",
      onStateChange: (state) => states.push(state),
    });
    try {
      await engine.bootstrap();
      await engine.setNetworkAvailable(false);
      const reconcile = vi.spyOn(queue, "reconcile");
      const commands: BoardCommand[] = Array.from(
        { length: 40 },
        (_, index) => ({
          kind: "core.document.rename",
          actorId: expectedActorId,
          id: commandId(`command:durable:${index}`),
          timestamp: "2026-10-13T12:00:00.000Z",
          title: `Local ${index}`,
        }),
      );
      for (const command of commands) await engine.apply([command]);
      expect(reconcile).not.toHaveBeenCalled();
      const prefix = await queue.list(expectedDocumentId);
      expect(prefix.map((item) => item.command)).toEqual(commands);
      const invalidBatch: BoardCommand[] = [
        {
          ...commands[0]!,
          id: commandId("command:half"),
          kind: "core.document.rename",
          title: "Half batch",
        },
        {
          actorId: expectedActorId,
          id: commandId("command:missing"),
          kind: "core.objects.delete",
          timestamp: "2026-10-13T12:00:00.000Z",
          objectIds: [core.boardObjectId("object:missing")],
        },
      ];
      const state = states.at(-1);
      if (state?.kind !== "ready") throw new Error("Not ready");
      if (storageFailure)
        vi.spyOn(queue, "quarantineConflicts").mockRejectedValueOnce(
          new Error("Conflict write failed"),
        );
      await engine.queueBatch(invalidBatch, state.document);
      let title = "Local 39";
      if (storageFailure) {
        expect(states.at(-1)).toMatchObject({
          kind: "recovery-required",
          document: { title },
        });
        expect(await queue.list(expectedDocumentId)).toHaveLength(42);
        title = "Recovered after storage failure";
        await engine.apply([
          {
            ...commands[0]!,
            id: commandId("command:recovered"),
            kind: "core.document.rename",
            title,
          },
        ]);
        const recovered = await queue.list(expectedDocumentId);
        expect(recovered.slice(0, 40)).toEqual(prefix);
        expect(recovered).toHaveLength(41);
      } else expect(await queue.list(expectedDocumentId)).toEqual(prefix);
      expect(states.at(-1)).toMatchObject({
        kind: "ready",
        pendingCount: storageFailure ? 41 : 40,
        quarantinedCount: 2,
        document: { title },
      });
      expect(reconcile).toHaveBeenCalledTimes(1);
      if (!storageFailure) {
        expect(reconcile.mock.calls[0]?.[1]).toEqual([]);
        expect(reconcile.mock.calls[0]?.[2]).toEqual([41, 42]);
      }
      await engine.setNetworkAvailable(true);
      expect(await queue.list(expectedDocumentId)).toEqual([]);
      expect(states.at(-1)).toMatchObject({
        kind: "ready",
        pendingCount: 0,
        document: { title },
      });
    } finally {
      engine.dispose();
      online.mockRestore();
      await queue.deleteDatabase();
    }
  },
);
