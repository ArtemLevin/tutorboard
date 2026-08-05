import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  type BoardCommand,
  type BoardCommandPage,
  type BoardDocument,
  type BoardServerRecovery,
  type BoardSessionContext,
  type ConfirmedBoardHead,
  type DocumentId,
  type OrderedBoardCommandEnvelope,
  type PendingBoardCommand,
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

function rename(
  id: string,
  timestamp: string,
  title: string,
): BoardCommand {
  return {
    actorId: expectedActorId,
    id: commandId(id),
    kind: "core.document.rename",
    timestamp,
    title,
  };
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
      expectedDocumentSha256: "a".repeat(64),
      idempotencyKey,
      schemaVersion: "1.2",
    },
    idempotencyKey,
    payloadSha256: "b".repeat(64),
    revision,
  };
}

class MemoryQueue implements PendingBoardCommandQueue {
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

  replace(
    _documentId: DocumentId,
    commands: readonly PendingBoardCommand[],
  ): Promise<void> {
    this.items = [...commands];
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
  readonly pushed: OrderedBoardCommandEnvelope[] = [];
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
        currentRevision: this.descriptor.currentRevision,
        hasMore: false,
        items: [],
      },
    );
  }

  push(
    envelope: OrderedBoardCommandEnvelope,
  ): Promise<PushBoardCommandsResult> {
    this.pushed.push(envelope);
    const result = this.pushResults.shift();
    return Promise.resolve(
      result ?? {
        currentDocumentSha256: "c".repeat(64),
        revision: this.pushed.length,
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
      schemaVersion: "1.3",
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
    const remote = rename(
      "command:remote",
      "2026-07-28T18:02:00.000Z",
      "Remote",
    );
    repository.pushResults.push({
      currentRevision: 1,
      hasMore: false,
      missingCommandBatches: [batch(1, 0, [remote])],
      status: "conflict",
    });
    const queue = new MemoryQueue();
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:stable-key",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:03:00.000Z",
      queue,
      repository,
    });
    await engine.bootstrap();

    await engine.apply([
      rename("command:local", "2026-07-28T18:01:00.000Z", "Local"),
    ]);

    expect(repository.pushed).toHaveLength(2);
    expect(repository.pushed.map(({ idempotencyKey }) => idempotencyKey)).toEqual(
      ["client:stable-key", "client:stable-key"],
    );
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
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      queue,
      repository,
    });

    const offline = await engine.bootstrap();
    expect(offline).toMatchObject({
      document: { title: "Offline" },
      kind: "offline",
      pendingCount: 1,
      revision: 3,
    });

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const synced = await engine.sync();
    expect(synced).toMatchObject({
      document: { title: "Offline" },
      kind: "ready",
      pendingCount: 0,
      revision: 1,
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
        currentRevision: 1,
      },
      commandBatches: [batch(1, 0, [command], "client:uncertain")],
      snapshot: {
        createdAt: initialDocument().createdAt,
        document: initialDocument(),
        documentId: expectedDocumentId,
        documentSha256: await boardDocumentSha256(initialDocument()),
        revision: 0,
        schemaVersion: "1.2",
      },
    };
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      queue,
      repository,
    });

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const state = await engine.bootstrap();

    expect(state).toMatchObject({
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
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "unused",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:02:00.000Z",
      queue: new MemoryQueue(),
      repository,
    });

    const state = await engine.bootstrap();

    expect(ensureBoard).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      document: { title: "Lesson" },
      kind: "ready",
      readOnly: true,
      revision: 0,
    });
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
