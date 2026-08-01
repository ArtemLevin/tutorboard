import { afterEach, describe, expect, it } from "vitest";

import {
  actorId,
  boardDocumentSha256,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  type BoardCommand,
  type BoardCommandEnvelope,
  type BoardCommandPage,
  type BoardDocument,
  type BoardServerRecovery,
  type BoardSessionContext,
  type BoardSyncRepository,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandQueue,
  type PushBoardCommandsResult,
  type ServerBoardCommandBatch,
  type ServerBoardDescriptor,
} from "../../src/core/public";
import {
  BoardSyncEngine,
  invertOwnBoardCommand,
  type BoardSyncState,
} from "../../src/modules/server-sync/public";
import { createCoordinatePlotProductionObject } from "../fixtures/coordinate-plot-production";

class MemoryQueue implements PendingBoardCommandQueue {
  items: PendingBoardCommand[] = [];
  head: ConfirmedBoardHead | null = null;
  sequence = 0;

  async acknowledge(_documentId: DocumentId, sequence: number): Promise<void> {
    this.items = this.items.filter((item) => item.sequence !== sequence);
  }

  async enqueue(
    documentId: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
  ): Promise<PendingBoardCommand> {
    const item = {
      command,
      documentId,
      idempotencyKey,
      sequence: ++this.sequence,
    };
    this.items.push(item);
    return item;
  }

  async list(documentId: DocumentId): Promise<readonly PendingBoardCommand[]> {
    return this.items.filter((item) => item.documentId === documentId);
  }

  async loadHead(documentId: DocumentId): Promise<ConfirmedBoardHead | null> {
    return this.head?.documentId === documentId ? this.head : null;
  }

  async replace(
    documentId: DocumentId,
    commands: readonly PendingBoardCommand[],
  ): Promise<void> {
    this.items = [
      ...this.items.filter((item) => item.documentId !== documentId),
      ...commands,
    ];
  }

  async saveHead(head: ConfirmedBoardHead): Promise<void> {
    this.head = head;
  }
}

class MemorySyncRepository implements BoardSyncRepository {
  readonly batches: ServerBoardCommandBatch[] = [];
  readonly pushed: BoardCommandEnvelope[] = [];
  readonly contextValue: BoardSessionContext = {
    actorId: actorId("actor:plot-release"),
    csrfToken: "csrf-release",
    organizationId: "organization:release",
    role: "tutor",
  };
  currentSha256 = "";

  constructor(
    readonly lessonId: string,
    readonly baseDocument: BoardDocument,
  ) {}

  descriptor(): ServerBoardDescriptor {
    return {
      archivedAt: null,
      currentDocumentSha256: this.currentSha256,
      currentRevision: this.batches.length,
      documentId: this.baseDocument.id,
      lastSnapshotRevision: 0,
      lessonId: this.lessonId,
      snapshotDue: false,
      studentId: "student:release",
    };
  }

  async context(): Promise<BoardSessionContext> {
    return this.contextValue;
  }

  async ensureBoard(): Promise<ServerBoardDescriptor> {
    return this.descriptor();
  }

  async load(documentIdValue: DocumentId): Promise<BoardServerRecovery> {
    const sha256 = await boardDocumentSha256(this.baseDocument);
    if (this.currentSha256 === "") this.currentSha256 = sha256;
    return {
      board: this.descriptor(),
      commandBatches: [...this.batches],
      snapshot: {
        createdAt: this.baseDocument.createdAt,
        document: this.baseDocument,
        documentId: documentIdValue,
        documentSha256: sha256,
        revision: 0,
        schemaVersion: "1.1",
      },
    };
  }

  async pull(
    _documentId: DocumentId,
    afterRevision: number,
  ): Promise<BoardCommandPage> {
    return {
      currentRevision: this.batches.length,
      hasMore: false,
      items: this.batches.filter(({ revision }) => revision > afterRevision),
    };
  }

  async saveSnapshot(): Promise<void> {}

  async push(
    envelope: BoardCommandEnvelope,
    _csrfToken: string,
  ): Promise<PushBoardCommandsResult> {
    this.pushed.push(envelope);
    if (envelope.baseRevision !== this.batches.length) {
      return {
        currentRevision: this.batches.length,
        hasMore: false,
        missingCommandBatches: this.batches.filter(
          ({ revision }) => revision > envelope.baseRevision,
        ),
        status: "conflict",
      };
    }
    const revision = this.batches.length + 1;
    this.currentSha256 = envelope.expectedDocumentSha256;
    this.batches.push({
      actorUserId: "user:plot-release",
      baseRevision: envelope.baseRevision,
      createdAt: envelope.commands[0]?.timestamp ?? this.baseDocument.updatedAt,
      envelope,
      idempotencyKey: envelope.idempotencyKey,
      payloadSha256: `payload:${revision}`,
      revision,
    });
    return {
      currentDocumentSha256: envelope.expectedDocumentSha256,
      revision,
      snapshotDue: false,
      status: "accepted",
    };
  }
}

const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "onLine",
);

function setOnline(value: boolean): void {
  Object.defineProperty(Navigator.prototype, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function apply(document: BoardDocument, command: BoardCommand): BoardDocument {
  const result = reduceBoardDocument(document, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}

afterEach(() => {
  if (originalOnlineDescriptor === undefined) {
    delete (Navigator.prototype as { onLine?: boolean }).onLine;
  } else {
    Object.defineProperty(
      Navigator.prototype,
      "onLine",
      originalOnlineDescriptor,
    );
  }
});

describe("coordinate plot server synchronization production lifecycle", () => {
  it("replays offline commands, acknowledges revisions and converges on collaborative undo", async () => {
    const activeDocumentId = documentId("document:plot-sync-release");
    const base = createEmptyBoardDocument({
      createdAt: "2026-08-01T08:00:00.000Z",
      id: activeDocumentId,
      title: "Plot sync release",
    });
    const repository = new MemorySyncRepository("lesson:release", base);
    const queue = new MemoryQueue();
    const states: BoardSyncState[] = [];
    let idempotencyIndex = 0;
    let nowIndex = 0;
    const engine = new BoardSyncEngine({
      createIdempotencyKey: () => `release-key:${++idempotencyIndex}`,
      documentId: activeDocumentId,
      lessonId: "lesson:release",
      now: () => `2026-08-01T08:0${nowIndex++}:00.000Z`,
      onStateChange: (state) => states.push(state),
      queue,
      repository,
    });

    setOnline(true);
    await engine.bootstrap();
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 0,
    });

    const plot = {
      ...createCoordinatePlotProductionObject(0),
      id: boardObjectId("release-plot:sync"),
    };
    const add: BoardCommand = {
      actorId: repository.contextValue.actorId,
      id: commandId("command:plot-sync:add"),
      kind: "core.objects.add",
      objects: [plot],
      timestamp: "2026-08-01T08:10:00.000Z",
    };
    const afterAdd = apply(base, add);

    setOnline(false);
    await engine.queue(add, afterAdd);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      network: "offline",
      pendingCount: 1,
      revision: 0,
    });
    expect(queue.items).toHaveLength(1);

    setOnline(true);
    await engine.synchronize();
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      network: "online",
      pendingCount: 0,
      revision: 1,
    });
    expect(queue.items).toHaveLength(0);

    const replacement = {
      ...plot.definition,
      coordinateViewport: {
        ...plot.definition.coordinateViewport,
        xMax: 20,
        xMin: -20,
      },
      parameters: plot.definition.parameters.map((parameter) =>
        parameter.name === "a" ? { ...parameter, value: 4 } : parameter,
      ),
    };
    const update: BoardCommand = {
      actorId: repository.contextValue.actorId,
      expected: plot.definition,
      id: commandId("command:plot-sync:update"),
      kind: "core.coordinate-plot.update",
      objectId: plot.id,
      replacement,
      timestamp: "2026-08-01T08:11:00.000Z",
    };
    const afterUpdate = apply(afterAdd, update);
    await engine.queue(update, afterUpdate);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 2,
    });

    const inverse = invertOwnBoardCommand(update, afterAdd, {
      actorId: repository.contextValue.actorId,
      createId: () => "command:plot-sync:undo",
      now: () => "2026-08-01T08:12:00.000Z",
    });
    expect(inverse).toHaveLength(1);
    await engine.apply(inverse);
    expect(states.at(-1)).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 3,
    });

    expect(repository.pushed.map(({ commands }) => commands[0]?.kind)).toEqual([
      "core.objects.add",
      "core.coordinate-plot.update",
      "core.coordinate-plot.update",
    ]);
    expect(
      repository.pushed.every(
        ({ expectedDocumentSha256, schemaVersion }) =>
          expectedDocumentSha256.length === 64 && schemaVersion === "1.1",
      ),
    ).toBe(true);

    const secondQueue = new MemoryQueue();
    const secondStates: BoardSyncState[] = [];
    const secondEngine = new BoardSyncEngine({
      createIdempotencyKey: () => `second-key:${crypto.randomUUID()}`,
      documentId: activeDocumentId,
      lessonId: "lesson:release",
      now: () => "2026-08-01T08:20:00.000Z",
      onStateChange: (state) => secondStates.push(state),
      queue: secondQueue,
      repository,
    });
    await secondEngine.bootstrap();
    const converged = secondStates.at(-1);
    expect(converged).toMatchObject({
      kind: "ready",
      pendingCount: 0,
      revision: 3,
    });
    if (converged?.kind !== "ready") throw new Error("Expected ready state.");
    expect(converged.document).toEqual(afterAdd);
  });
});
