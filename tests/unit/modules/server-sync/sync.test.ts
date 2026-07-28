import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  type BoardCommand,
  type BoardCommandEnvelope,
  type BoardCommandPage,
  type BoardServerRecovery,
  type BoardSessionContext,
  type BoardSyncRepository,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandQueue,
  type PushBoardCommandsResult,
  type ServerBoardDescriptor,
} from "../../../../src/core/public";
import {
  BoardSyncEngine,
  boardDocumentSha256,
  type BoardSyncState,
} from "../../../../src/modules/server-sync/public";

const expectedDocumentId = documentId("document:lesson-1");
const initialDocument = createEmptyBoardDocument({
  createdAt: "2026-07-28T18:00:00.000Z",
  id: expectedDocumentId,
  title: "Lesson",
});
const context: BoardSessionContext = {
  actorId: actorId("user:tutor"),
  csrfToken: "csrf",
  organizationId: "organization:1",
  role: "tutor",
};

class OfflineError extends Error {
  readonly retryable = true;
}

class MemoryQueue implements PendingBoardCommandQueue {
  head: ConfirmedBoardHead | null = null;
  items: PendingBoardCommand[] = [];

  acknowledge(_documentId: DocumentId, sequence: number): Promise<void> {
    this.items = this.items.filter((item) => item.sequence !== sequence);
    return Promise.resolve();
  }

  enqueue(
    target: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
  ): Promise<PendingBoardCommand> {
    const item = {
      command,
      documentId: target,
      idempotencyKey,
      sequence: (this.items.at(-1)?.sequence ?? 0) + 1,
    };
    this.items.push(item);
    return Promise.resolve(item);
  }

  list(): Promise<readonly PendingBoardCommand[]> {
    return Promise.resolve(this.items);
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

class FakeRepository implements BoardSyncRepository {
  readonly pushed: BoardCommandEnvelope[] = [];
  descriptor: ServerBoardDescriptor = {
    currentDocumentSha256: "",
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
  pushResults: PushBoardCommandsResult[] = [];
  savedSnapshot = false;
  contextOffline = false;
  ensureCalls = 0;
  sessionContext = context;

  context(): Promise<BoardSessionContext> {
    if (this.contextOffline) {
      return Promise.reject(new OfflineError("offline"));
    }
    return Promise.resolve(this.sessionContext);
  }

  ensureBoard(): Promise<ServerBoardDescriptor> {
    this.ensureCalls += 1;
    return Promise.resolve(this.descriptor);
  }

  load(): Promise<BoardServerRecovery> {
    return Promise.resolve(this.recovery);
  }

  pull(): Promise<BoardCommandPage> {
    return Promise.resolve({
      currentRevision: this.descriptor.currentRevision,
      hasMore: false,
      items: [],
    });
  }

  push(envelope: BoardCommandEnvelope): Promise<PushBoardCommandsResult> {
    this.pushed.push(envelope);
    return Promise.resolve(
      this.pushResults.shift() ?? {
        currentDocumentSha256: envelope.expectedDocumentSha256,
        revision: envelope.baseRevision + 1,
        snapshotDue: false,
        status: "accepted",
      },
    );
  }

  saveSnapshot(): Promise<void> {
    this.savedSnapshot = true;
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function rename(
  id: string,
  timestamp: string,
  title: string,
  actor = context.actorId,
): BoardCommand {
  return {
    actorId: actor,
    id: commandId(id),
    kind: "core.document.rename",
    timestamp,
    title,
  };
}

describe("BoardSyncEngine", () => {
  it("creates a revision-zero snapshot and confirms queued commands", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const queue = new MemoryQueue();
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:one",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:00:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    await engine.bootstrap();
    const ready = states.at(-1);
    expect(ready).toMatchObject({ kind: "ready", revision: 0 });
    expect(repository.savedSnapshot).toBe(true);
    if (ready?.kind !== "ready") {
      throw new Error("Expected ready state.");
    }
    const command = rename(
      "command:local",
      "2026-07-28T18:01:00.000Z",
      "Synced lesson",
    );
    const applied = reduceBoardDocument(ready.document, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      throw new Error(applied.error.message);
    }

    await engine.queue(command, applied.document);

    expect(repository.pushed).toHaveLength(1);
    expect(queue.items).toHaveLength(0);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 1,
    });
  });

  it("rebases an offline command after a 409 and preserves its idempotency key", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const queue = new MemoryQueue();
    const initialSha = await boardDocumentSha256(initialDocument);
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: initialSha,
      },
      commandBatches: [],
      snapshot: {
        createdAt: "2026-07-28T18:00:00.000Z",
        document: initialDocument,
        documentId: expectedDocumentId,
        documentSha256: initialSha,
        revision: 0,
        schemaVersion: "1.0",
      },
    };
    const remoteCommand = rename(
      "command:remote",
      "2026-07-28T18:02:00.000Z",
      "Remote title",
      actorId("user:other"),
    );
    const remoteApplied = reduceBoardDocument(initialDocument, remoteCommand);
    expect(remoteApplied.ok).toBe(true);
    if (!remoteApplied.ok) {
      throw new Error(remoteApplied.error.message);
    }
    const remoteSha = await boardDocumentSha256(remoteApplied.document);
    repository.pushResults.push({
      currentRevision: 1,
      hasMore: false,
      missingCommandBatches: [
        {
          actorUserId: "user:other",
          baseRevision: 0,
          createdAt: "2026-07-28T18:02:00.000Z",
          envelope: {
            actorId: actorId("user:other"),
            baseRevision: 0,
            commands: [remoteCommand],
            documentId: expectedDocumentId,
            expectedDocumentSha256: remoteSha,
            idempotencyKey: "remote:one",
            schemaVersion: "1.0",
          },
          idempotencyKey: "remote:one",
          payloadSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          revision: 1,
        },
      ],
      status: "conflict",
    });
    const states: BoardSyncState[] = [];
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => "client:stable-key",
      documentId: expectedDocumentId,
      lessonId: "lesson:1",
      now: () => "2026-07-28T18:03:00.000Z",
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });
    await engine.bootstrap();
    const localCommand = rename(
      "command:local",
      "2026-07-28T18:01:00.000Z",
      "Local title",
    );
    const localApplied = reduceBoardDocument(initialDocument, localCommand);
    if (!localApplied.ok) {
      throw new Error(localApplied.error.message);
    }

    await engine.queue(localCommand, localApplied.document);

    expect(repository.pushed).toHaveLength(2);
    expect(repository.pushed[0]?.idempotencyKey).toBe("client:stable-key");
    expect(repository.pushed[1]?.idempotencyKey).toBe("client:stable-key");
    expect(repository.pushed[1]?.baseRevision).toBe(1);
    expect(repository.pushed[1]?.commands[0]?.timestamp).toBe(
      "2026-07-28T18:03:00.000Z",
    );
    expect(states.at(-1)).toMatchObject({
      document: { title: "Local title" },
      kind: "ready",
      pendingCount: 0,
      revision: 2,
    });
  });

  it("boots from the durable cache offline and drains the queue after reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const repository = new FakeRepository();
    repository.contextOffline = true;
    const queue = new MemoryQueue();
    const initialSha = await boardDocumentSha256(initialDocument);
    queue.head = {
      document: initialDocument,
      documentId: expectedDocumentId,
      revision: 0,
      session: {
        actorId: context.actorId,
        organizationId: context.organizationId,
        role: context.role,
      },
      sha256: initialSha,
    };
    const command = rename(
      "command:offline",
      "2026-07-28T18:01:00.000Z",
      "Offline title",
    );
    await queue.enqueue(expectedDocumentId, "client:offline", command);
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: initialSha,
      },
      commandBatches: [],
      snapshot: {
        createdAt: "2026-07-28T18:00:00.000Z",
        document: initialDocument,
        documentId: expectedDocumentId,
        documentSha256: initialSha,
        revision: 0,
        schemaVersion: "1.0",
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
      document: { title: "Offline title" },
      kind: "ready",
      network: "offline",
      pendingCount: 1,
    });

    repository.contextOffline = false;
    online.mockReturnValue(true);
    await engine.synchronize();

    expect(repository.pushed[0]?.idempotencyKey).toBe("client:offline");
    expect(queue.items).toHaveLength(0);
    expect(states.at(-1)).toMatchObject({
      document: { title: "Offline title" },
      kind: "ready",
      network: "online",
      pendingCount: 0,
      revision: 1,
    });
  });

  it("acknowledges an uncertain retry already present in the server journal", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    const queue = new MemoryQueue();
    const initialSha = await boardDocumentSha256(initialDocument);
    const command = rename(
      "command:uncertain",
      "2026-07-28T18:01:00.000Z",
      "Already accepted",
    );
    const applied = reduceBoardDocument(initialDocument, command);
    if (!applied.ok) {
      throw new Error(applied.error.message);
    }
    const acceptedSha = await boardDocumentSha256(applied.document);
    await queue.enqueue(expectedDocumentId, "client:uncertain", command);
    repository.descriptor = {
      ...repository.descriptor,
      currentDocumentSha256: acceptedSha,
      currentRevision: 1,
    };
    repository.recovery = {
      board: repository.descriptor,
      commandBatches: [
        {
          actorUserId: context.actorId,
          baseRevision: 0,
          createdAt: "2026-07-28T18:01:00.000Z",
          envelope: {
            actorId: context.actorId,
            baseRevision: 0,
            commands: [command],
            documentId: expectedDocumentId,
            expectedDocumentSha256: acceptedSha,
            idempotencyKey: "client:uncertain",
            schemaVersion: "1.0",
          },
          idempotencyKey: "client:uncertain",
          payloadSha256:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          revision: 1,
        },
      ],
      snapshot: {
        createdAt: "2026-07-28T18:00:00.000Z",
        document: initialDocument,
        documentId: expectedDocumentId,
        documentSha256: initialSha,
        revision: 0,
        schemaVersion: "1.0",
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

    expect(repository.pushed).toHaveLength(0);
    expect(queue.items).toHaveLength(0);
    expect(states.at(-1)).toMatchObject({
      document: { title: "Already accepted" },
      kind: "ready",
      pendingCount: 0,
      revision: 1,
    });
  });

  it("loads an assigned parent board without attempting to create it", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const repository = new FakeRepository();
    repository.sessionContext = {
      ...context,
      actorId: actorId("user:parent"),
      role: "parent",
    };
    const initialSha = await boardDocumentSha256(initialDocument);
    repository.recovery = {
      board: {
        ...repository.descriptor,
        currentDocumentSha256: initialSha,
      },
      commandBatches: [],
      snapshot: {
        createdAt: "2026-07-28T18:00:00.000Z",
        document: initialDocument,
        documentId: expectedDocumentId,
        documentSha256: initialSha,
        revision: 0,
        schemaVersion: "1.0",
      },
    };
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

    expect(repository.ensureCalls).toBe(0);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      role: "parent",
    });
  });
});
