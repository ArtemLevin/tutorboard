import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  reduceBoardDocument,
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
  type ServerBoardCommandBatch,
} from "../../../../src/core/public";
import {
  BoardSyncEngine,
  boardDocumentSha256,
  type BoardSyncState,
} from "../../../../src/modules/server-sync/public";

const expectedDocumentId = documentId("document:lesson-1");
const expectedActorId = actorId("user:tutor");

function initialDocument(): BoardDocument {
  return createEmptyBoardDocument({
    createdAt: "2026-07-28T18:00:00.000Z",
    id: expectedDocumentId,
    title: "Lesson",
  });
}

function rename(id: string, timestamp: string, title: string): BoardCommand {
  return {
    actorId: expectedActorId,
    id: commandId(id),
    kind: "core.document.rename",
    timestamp,
    title,
  };
}

function applied(
  document: BoardDocument,
  command: BoardCommand,
): BoardDocument {
  const result = reduceBoardDocument(document, command);
  if (!result.ok) {
    throw new Error("Test command could not be applied");
  }
  return result.document;
}

async function confirmed(
  document: BoardDocument,
  revision: number,
): Promise<ConfirmedBoardHead> {
  return {
    document,
    documentId: expectedDocumentId,
    revision,
    session: {
      actorId: expectedActorId,
      organizationId: "organization:1",
      role: "tutor",
    },
    sha256: await boardDocumentSha256(document),
  };
}

function batch(
  revision: number,
  baseRevision: number,
  commands: readonly BoardCommand[],
  idempotencyKey = `remote:${revision}`,
  expectedDocumentSha256 = "a".repeat(64),
): ServerBoardCommandBatch {
  return {
    actorUserId: "user:other",
    baseRevision,
    createdAt: commands[0]?.timestamp ?? "2026-07-28T18:00:00.000Z",
    envelope: {
      actorId: actorId("user:other"),
      baseRevision,
      commands,
      documentId: expectedDocumentId,
      expectedDocumentSha256,
      idempotencyKey,
      schemaVersion: "1.2",
    },
    idempotencyKey,
    payloadSha256: "b".repeat(64),
    revision,
  };
}

class MemoryQueue implements PendingBoardCommandQueue {
  conflicts: PendingBoardCommandConflict[] = [];
  head: ConfirmedBoardHead | null = null;
  items: PendingBoardCommand[] = [];

  acknowledge(_documentId: DocumentId, sequence: number): Promise<void> {
    this.items = this.items.filter((item) => item.sequence !== sequence);
    return Promise.resolve();
  }

  enqueue(
    documentIdValue: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
    ordering: PendingBoardCommandOrderingInput = {},
  ): Promise<PendingBoardCommand> {
    const item: PendingBoardCommand = {
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("BoardSyncEngine", () => {
  it("creates a revision-zero snapshot and confirms queued commands", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const queue = new MemoryQueue();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:rename",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:01:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();
    await engine.apply([
      rename("command:rename", "2026-07-28T18:01:00.000Z", "Renamed"),
    ]);

    expect(repository.snapshots).toHaveLength(1);
    expect(repository.pushed).toHaveLength(1);
    expect(repository.pushed[0]).toMatchObject({
      baseRevision: 0,
      commands: [
        {
          command: { kind: "core.document.rename", title: "Renamed" },
          order: { baseRevisionAtCreation: 0, lamport: 1 },
        },
      ],
      originId: "origin:legacy-client",
      schemaVersion: "1.5",
    });
    expect(queue.items).toEqual([]);
    expect(queue.head).toMatchObject({
      document: { title: "Renamed" },
      revision: 1,
    });
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 1,
    });
  });

  it("rebases an offline command after a 409 and preserves its idempotency key", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const base = initialDocument();
    const baseSha256 = await boardDocumentSha256(base);
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: baseSha256,
        currentRevision: 0,
      },
      commandBatches: [],
      snapshot: {
        createdAt: base.createdAt,
        document: base,
        documentId: expectedDocumentId,
        documentSha256: baseSha256,
        revision: 0,
        schemaVersion: "1.2",
      },
    };
    const remote = rename(
      "command:remote",
      "2026-07-28T18:02:00.000Z",
      "Remote",
    );
    repository.pushResults.push({
      currentRevision: 1,
      hasMore: false,
      missingCommandBatches: [
        batch(
          1,
          0,
          [remote],
          "remote:1",
          await boardDocumentSha256(applied(base, remote)),
        ),
      ],
      status: "conflict",
    });
    const queue = new MemoryQueue();
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:stable-key",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:03:00.000Z",
      onStateChange: () => undefined,
      queue,
      repository,
    });
    await engine.bootstrap();

    await engine.apply([
      rename("command:local", "2026-07-28T18:01:00.000Z", "Local"),
    ]);

    expect(repository.pushed).toHaveLength(2);
    expect(
      repository.pushed.map(({ idempotencyKey }) => idempotencyKey),
    ).toEqual(["client:stable-key", "client:stable-key"]);
    expect(repository.pushed.map(({ baseRevision }) => baseRevision)).toEqual([
      0, 1,
    ]);
    expect(repository.pushed[1]?.commands[0]?.command.timestamp).toBe(
      "2026-07-28T18:01:00.000Z",
    );
    expect(queue.head).toMatchObject({
      document: { title: "Local" },
      revision: 2,
    });
  });

  it("quarantines an irreconcilable offline command and continues with independent work", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const queue = new MemoryQueue();
    queue.items = [
      {
        command: {
          actorId: expectedActorId,
          id: commandId("command:delete-already-removed"),
          kind: "core.objects.delete",
          objectIds: [boardObjectId("object:already-removed")],
          timestamp: "2026-07-28T18:01:00.000Z",
        },
        documentId: expectedDocumentId,
        idempotencyKey: "client:conflict",
        order: { baseRevisionAtCreation: 0, lamport: 1 },
        sequence: 1,
      },
      {
        command: rename(
          "command:independent-rename",
          "2026-07-28T18:02:00.000Z",
          "Independent work",
        ),
        documentId: expectedDocumentId,
        idempotencyKey: "client:independent",
        order: { baseRevisionAtCreation: 0, lamport: 2 },
        sequence: 2,
      },
    ];
    const repository = new FakeRepository();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:03:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();

    expect(queue.conflicts).toHaveLength(1);
    expect(queue.conflicts[0]).toMatchObject({
      item: { idempotencyKey: "client:conflict", sequence: 1 },
    });
    expect(queue.conflicts[0]?.message).toContain("конфликтует");
    expect(queue.items).toEqual([]);
    expect(repository.pushed).toHaveLength(1);
    expect(repository.pushed[0]).toMatchObject({
      idempotencyKey: "client:independent",
      schemaVersion: "1.5",
    });
    expect(states.at(-1)).toMatchObject({
      document: { title: "Independent work" },
      kind: "ready",
      pendingCount: 0,
      quarantinedCount: 1,
      revision: 1,
    });
  });

  it("persists a second edit while the first network push is still pending", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const queue = new MemoryQueue();
    const states: BoardSyncState[] = [];
    let key = 0;
    let releaseFirstPush: (result: PushBoardCommandsResult) => void = () => {
      throw new Error("First push was not pending.");
    };
    vi.spyOn(repository, "push").mockImplementationOnce((envelope) => {
      repository.pushed.push(envelope);
      return new Promise<PushBoardCommandsResult>((resolve) => {
        releaseFirstPush = resolve;
      });
    });
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => `client:durable:${++key}`,
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:01:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();
    const ready = states.at(-1);
    if (ready?.kind !== "ready") throw new Error("Expected ready sync state");
    const firstCommand = rename(
      "command:first",
      "2026-07-28T18:01:00.000Z",
      "First",
    );
    const firstDocument = applied(ready.document, firstCommand);
    const first = engine.queue(firstCommand, firstDocument);
    await vi.waitFor(() => expect(repository.pushed).toHaveLength(1));

    const secondCommand = rename(
      "command:second",
      "2026-07-28T18:02:00.000Z",
      "Second",
    );
    const secondDocument = applied(firstDocument, secondCommand);
    const second = engine.queue(secondCommand, secondDocument);

    await vi.waitFor(() => expect(queue.items).toHaveLength(2));
    const firstEnvelope = repository.pushed[0]!;
    releaseFirstPush({
      currentDocumentSha256: firstEnvelope.expectedDocumentSha256,
      revision: firstEnvelope.baseRevision + 1,
      snapshotDue: false,
      status: "accepted",
    });
    await Promise.all([first, second]);

    expect(queue.items).toEqual([]);
    expect(states.at(-1)).toMatchObject({
      document: { title: "Second" },
      kind: "ready",
      pendingCount: 0,
      revision: 2,
    });
  });

  it("boots from the durable cache offline and drains the queue after reconnect", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const queue = new MemoryQueue();
    const cachedDocument = initialDocument();
    queue.head = await confirmed(cachedDocument, 3);
    queue.items = [
      {
        command: rename(
          "command:cached",
          "2026-07-28T18:01:00.000Z",
          "Offline",
        ),
        documentId: expectedDocumentId,
        idempotencyKey: "client:cached",
        order: { baseRevisionAtCreation: 3, lamport: 4 },
        sequence: 1,
      },
    ];
    const repository = new FakeRepository();
    const contextRequest = vi
      .spyOn(repository, "context")
      .mockRejectedValue({ retryable: true });
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();
    contextRequest.mockRestore();
    expect(states.at(-1)).toMatchObject({
      document: { title: "Offline" },
      kind: "ready",
      network: "offline",
      pendingCount: 1,
      revision: 3,
    });

    const cachedSha256 = await boardDocumentSha256(cachedDocument);
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: cachedSha256,
        currentRevision: 3,
        lastSnapshotRevision: 3,
      },
      commandBatches: [],
      snapshot: {
        createdAt: cachedDocument.createdAt,
        document: cachedDocument,
        documentId: expectedDocumentId,
        documentSha256: cachedSha256,
        revision: 3,
        schemaVersion: "1.4",
      },
    };
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await engine.synchronize();
    expect(states.at(-1)).toMatchObject({
      document: { title: "Offline" },
      kind: "ready",
      pendingCount: 0,
      revision: 4,
    });
  });

  it("fails closed when the server rolls behind the durable head", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const queue = new MemoryQueue();
    queue.head = await confirmed(initialDocument(), 3);
    const repository = new FakeRepository();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();

    expect(states.at(-1)).toMatchObject({
      code: "board.sync.server-rollback",
      kind: "recovery-required",
    });
    expect(queue.head?.revision).toBe(3);
  });

  it("fails closed on different documents at the same confirmed revision", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const queue = new MemoryQueue();
    const local = initialDocument();
    queue.head = await confirmed(local, 3);
    const server = { ...local, title: "Different server head" };
    const serverSha256 = await boardDocumentSha256(server);
    const repository = new FakeRepository();
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: serverSha256,
        currentRevision: 3,
        lastSnapshotRevision: 3,
      },
      commandBatches: [],
      snapshot: {
        createdAt: server.createdAt,
        document: server,
        documentId: expectedDocumentId,
        documentSha256: serverSha256,
        revision: 3,
        schemaVersion: "1.4",
      },
    };
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();

    expect(states.at(-1)).toMatchObject({
      code: "board.sync.split-brain",
      kind: "recovery-required",
    });
  });

  it("acknowledges an uncertain retry already present in the server journal", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const command = rename(
      "command:uncertain",
      "2026-07-28T18:01:00.000Z",
      "Confirmed elsewhere",
    );
    const queue = new MemoryQueue();
    queue.head = await confirmed(initialDocument(), 0);
    queue.items = [
      {
        command,
        documentId: expectedDocumentId,
        idempotencyKey: "client:uncertain",
        order: { baseRevisionAtCreation: 0, lamport: 1 },
        sequence: 1,
      },
    ];
    const repository = new FakeRepository();
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: await boardDocumentSha256(
          applied(initialDocument(), command),
        ),
        currentRevision: 1,
      },
      commandBatches: [
        batch(
          1,
          0,
          [command],
          "client:uncertain",
          await boardDocumentSha256(applied(initialDocument(), command)),
        ),
      ],
      snapshot: {
        createdAt: initialDocument().createdAt,
        document: initialDocument(),
        documentId: expectedDocumentId,
        documentSha256: await boardDocumentSha256(initialDocument()),
        revision: 0,
        schemaVersion: "1.2",
      },
    };
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await engine.bootstrap();

    expect(states.at(-1)).toMatchObject({
      document: { title: "Confirmed elsewhere" },
      kind: "ready",
      pendingCount: 0,
      revision: 1,
    });
    expect(repository.pushed).toEqual([]);
  });

  it("loads an assigned parent board without attempting to create it", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    repository.contextValue = {
      ...repository.contextValue,
      role: "parent",
    };
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: await boardDocumentSha256(initialDocument()),
        currentRevision: 0,
      },
      commandBatches: [],
      snapshot: {
        createdAt: initialDocument().createdAt,
        document: initialDocument(),
        documentId: expectedDocumentId,
        documentSha256: await boardDocumentSha256(initialDocument()),
        revision: 0,
        schemaVersion: "1.2",
      },
    };
    const ensureBoard = vi.spyOn(repository, "ensureBoard");
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue: new MemoryQueue(),
      repository,
    });

    await engine.bootstrap();

    expect(ensureBoard).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      document: { title: "Lesson" },
      kind: "ready",
      role: "parent",
      revision: 0,
    });
  });

  it("stops durable and UI side effects after disposal during bootstrap", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    let releaseLoad: ((value: BoardServerRecovery) => void) | undefined;
    vi.spyOn(repository, "load").mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseLoad = resolve;
        }),
    );
    const queue = new MemoryQueue();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    const bootstrapping = engine.bootstrap();
    await vi.waitFor(() => expect(releaseLoad).toBeTypeOf("function"));
    engine.dispose();
    releaseLoad?.(repository.recovery);
    await bootstrapping;

    expect(repository.snapshots).toEqual([]);
    expect(queue.head).toBeNull();
    expect(states).toEqual([{ kind: "bootstrapping" }]);
  });

  it("queues collaborative undo as an ordinary confirmed command", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:undo",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:03:00.000Z",
      onStateChange: (state) => states.push(state),
      queue: new MemoryQueue(),
      repository,
    });
    await engine.bootstrap();

    await engine.apply([
      rename("command:undo", "2026-07-28T18:02:00.000Z", "Restored title"),
    ]);

    expect(repository.pushed).toHaveLength(1);
    expect(repository.pushed[0]?.commands[0]?.command).toMatchObject({
      kind: "core.document.rename",
      title: "Restored title",
    });
    expect(states.at(-1)).toMatchObject({
      document: { title: "Restored title" },
      kind: "ready",
      pendingCount: 0,
      revision: 1,
    });
  });
});
