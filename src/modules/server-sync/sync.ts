import {
  createEmptyBoardDocument,
  reduceBoardDocument,
  serializeBoardDocument,
  type ActorId,
  type BoardCommand,
  type BoardDocument,
  type BoardSyncRepository,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandConflict,
  type PendingBoardCommandQueue,
  type OrderedBoardCommand,
  type ServerBoardCommandBatch,
} from "../../core/public";
import {
  createLegacyBoardAccessContext,
  type BoardCapability,
  type BoardRuntimeAccessContext,
} from "../../core/access/public";

export type BoardSyncState =
  | { readonly kind: "bootstrapping" }
  | {
      readonly accessEpoch: string;
      readonly actorId: ActorId;
      readonly capabilities: readonly BoardCapability[];
      readonly confirmedSha256: string;
      readonly document: BoardDocument;
      readonly kind: "ready";
      readonly network: "offline" | "online";
      readonly pendingCount: number;
      readonly principalType: BoardRuntimeAccessContext["principalType"];
      readonly quarantinedCount: number;
      readonly revision: number;
      readonly role: BoardRuntimeAccessContext["role"];
    }
  | {
      readonly code: string;
      readonly document: BoardDocument | null;
      readonly kind: "recovery-required";
      readonly message: string;
      readonly pendingCount: number;
    }
  | {
      readonly code: string;
      readonly kind: "failure";
      readonly message: string;
    };

export interface BoardSyncEngineOptions {
  readonly accessContext?: BoardRuntimeAccessContext;
  readonly createIdempotencyKey: () => string;
  readonly documentId: DocumentId;
  /** @deprecated T0 keeps this input only so legacy callers compile. */
  readonly lessonId?: string;
  readonly now: () => string;
  readonly originId?: string;
  readonly onStateChange: (state: BoardSyncState) => void;
  readonly queue: PendingBoardCommandQueue;
  readonly repository: BoardSyncRepository;
}

interface ReplayedPending {
  readonly conflicts: readonly PendingBoardCommandConflict[];
  readonly document: BoardDocument;
  readonly items: readonly PendingBoardCommand[];
}

class SyncRecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncRecoveryError";
  }
}

function canonicalDocument(document: BoardDocument): string {
  const serialized = serializeBoardDocument(document);
  if (!serialized.ok) {
    throw new SyncRecoveryError(
      "board.sync.invalid-document",
      "Локальный документ не прошёл проверку перед синхронизацией.",
    );
  }
  return serialized.json;
}

export async function boardDocumentSha256(
  document: BoardDocument,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDocument(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function commandsFromBatch(
  batch: ServerBoardCommandBatch,
): readonly BoardCommand[] {
  return batch.envelope.commands.map((item) =>
    "command" in item ? item.command : item,
  );
}

function orderedFromPending(item: PendingBoardCommand): OrderedBoardCommand {
  return { command: item.command, order: item.order };
}

function applyCommand(
  document: BoardDocument,
  command: BoardCommand,
): BoardDocument {
  const result = reduceBoardDocument(document, command);
  if (!result.ok) {
    throw new SyncRecoveryError(
      "board.sync.remote-command-invalid",
      `Команда ${command.id} не применяется: ${result.error.message}`,
    );
  }
  return result.document;
}

async function applyRemoteBatches(
  start: ConfirmedBoardHead,
  batches: readonly ServerBoardCommandBatch[],
): Promise<ConfirmedBoardHead> {
  let head = start;
  for (const batch of batches) {
    if (
      batch.baseRevision !== head.revision ||
      batch.revision !== head.revision + 1 ||
      batch.envelope.documentId !== head.documentId ||
      batch.envelope.baseRevision !== batch.baseRevision ||
      batch.envelope.idempotencyKey !== batch.idempotencyKey
    ) {
      throw new SyncRecoveryError(
        "board.sync.revision-gap",
        "Удалённый журнал команд содержит разрыв ревизий.",
      );
    }
    let document = head.document;
    for (const command of commandsFromBatch(batch)) {
      document = applyCommand(document, command);
    }
    const sha256 = await boardDocumentSha256(document);
    if (sha256 !== batch.envelope.expectedDocumentSha256) {
      throw new SyncRecoveryError(
        "board.sync.sha-mismatch",
        "Контрольная сумма удалённой ревизии не совпадает.",
      );
    }
    head = {
      document,
      documentId: head.documentId,
      revision: batch.revision,
      session: head.session,
      sha256,
    };
  }
  return head;
}

function replayPending(
  head: ConfirmedBoardHead,
  pending: readonly PendingBoardCommand[],
): ReplayedPending {
  let document = head.document;
  const conflicts: PendingBoardCommandConflict[] = [];
  const items: PendingBoardCommand[] = [];
  for (const item of pending) {
    const result = reduceBoardDocument(document, item.command);
    if (!result.ok) {
      conflicts.push({
        item,
        message: `Локальная команда ${item.command.id} конфликтует с удалёнными изменениями: ${result.error.message}`,
      });
      continue;
    }
    document = result.document;
    items.push(item);
  }
  return { conflicts, document, items };
}

function retryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { readonly retryable?: unknown }).retryable === true
  );
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Неизвестная ошибка синхронизации.";
}

function orderedPending(
  pending: readonly PendingBoardCommand[],
): readonly PendingBoardCommand[] {
  return [...pending].sort((left, right) => left.sequence - right.sequence);
}

function confirmedSession(context: BoardRuntimeAccessContext) {
  return {
    accessEpoch: context.accessEpoch,
    actorId: context.actorId,
    cacheScopeId: context.cacheScopeId,
    capabilities: [...context.capabilities],
    ...(context.principalType === "teacher" ||
    context.principalType === "legacy"
      ? { organizationId: context.organizationId }
      : {}),
    principalType: context.principalType,
    role: context.role,
  } as const;
}

function sameCapabilities(
  left: readonly BoardCapability[],
  right: readonly BoardCapability[],
): boolean {
  return (
    left.length === right.length &&
    left.every((capability) => right.includes(capability))
  );
}

function cachedLegacyContext(
  head: ConfirmedBoardHead,
): BoardRuntimeAccessContext | null {
  const session = head.session;
  if (
    session.accessEpoch !== undefined &&
    session.cacheScopeId !== undefined &&
    session.capabilities !== undefined &&
    session.principalType !== undefined
  ) {
    if (session.principalType === "guest") {
      return {
        accessEpoch: session.accessEpoch,
        actorId: session.actorId,
        boardId: head.documentId,
        cacheScopeId: session.cacheScopeId,
        capabilities: session.capabilities,
        csrfToken: "",
        displayName: session.actorId,
        principalType: "guest",
        role: "student",
        schemaVersion: "1.0",
      };
    }
    if (session.organizationId === undefined) {
      return null;
    }
    if (session.principalType === "teacher") {
      if (session.role !== "admin" && session.role !== "tutor") return null;
      return {
        accessEpoch: session.accessEpoch,
        actorId: session.actorId,
        boardId: head.documentId,
        cacheScopeId: session.cacheScopeId,
        capabilities: session.capabilities,
        csrfToken: "",
        displayName: session.actorId,
        organizationId: session.organizationId,
        principalType: "teacher",
        role: session.role,
        schemaVersion: "1.0",
        userId: session.actorId,
      };
    }
    return {
      accessEpoch: session.accessEpoch,
      actorId: session.actorId,
      boardId: head.documentId,
      cacheScopeId: session.cacheScopeId,
      capabilities: session.capabilities,
      csrfToken: "",
      displayName: session.actorId,
      organizationId: session.organizationId,
      principalType: "legacy",
      role: session.role,
      schemaVersion: "legacy",
    };
  }
  if (session.organizationId === undefined) return null;
  return createLegacyBoardAccessContext(
    {
      actorId: session.actorId,
      csrfToken: "",
      organizationId: session.organizationId,
      role: session.role,
    },
    head.documentId,
  );
}

export class BoardSyncEngine {
  readonly #createIdempotencyKey: () => string;
  readonly #documentId: DocumentId;
  readonly #now: () => string;
  readonly #originId: string;
  readonly #onStateChange: (state: BoardSyncState) => void;
  readonly #providedAccessContext: BoardRuntimeAccessContext | null;
  readonly #queue: PendingBoardCommandQueue;
  readonly #repository: BoardSyncRepository;
  #context: BoardRuntimeAccessContext | null = null;
  #confirmed: ConfirmedBoardHead | null = null;
  #document: BoardDocument | null = null;
  #pending: readonly PendingBoardCommand[] = [];
  #quarantinedCount = 0;
  #networkAvailable =
    typeof navigator === "undefined" ? true : navigator.onLine;
  #durableSerial: Promise<void> = Promise.resolve();
  #disposed = false;
  #accessRefreshPending = false;
  #serial: Promise<void> = Promise.resolve();

  constructor(options: BoardSyncEngineOptions) {
    this.#createIdempotencyKey = options.createIdempotencyKey;
    this.#documentId = options.documentId;
    this.#now = options.now;
    this.#originId = options.originId ?? "origin:legacy-client";
    this.#onStateChange = options.onStateChange;
    this.#providedAccessContext = options.accessContext ?? null;
    this.#queue = options.queue;
    this.#repository = options.repository;
    if (
      this.#providedAccessContext !== null &&
      this.#providedAccessContext.boardId !== this.#documentId
    ) {
      throw new Error("Board access context belongs to another document.");
    }
  }

  bootstrap(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#serial = this.#serial.then(() => this.#bootstrap());
    return this.#serial;
  }

  dispose(): void {
    this.#disposed = true;
  }

  setNetworkAvailable(available: boolean): Promise<void> {
    this.#networkAvailable = available;
    if (this.#disposed) return Promise.resolve();
    if (!available) {
      this.#emitReady("offline");
      return Promise.resolve();
    }
    return this.synchronize();
  }

  /**
   * Closes the local mutation boundary synchronously while a standalone access
   * context is being refreshed. The server remains authoritative, but this
   * prevents a command created after an access-change event from entering the
   * durable queue with the superseded epoch.
   */
  pauseForAccessRefresh(): void {
    if (this.#disposed) return;
    this.#accessRefreshPending = true;
  }

  updateAccessContext(context: BoardRuntimeAccessContext): Promise<void> {
    if (context.boardId !== this.#documentId) {
      return Promise.reject(
        new Error("Board access context belongs to another document."),
      );
    }
    if (this.#disposed) return Promise.resolve();
    this.#accessRefreshPending = true;
    const update = this.#serial.then(async () => {
      const current = this.#context;
      if (current !== null && current.cacheScopeId !== context.cacheScopeId) {
        throw new SyncRecoveryError(
          "board.sync.access-scope-changed",
          "Изменился security scope доски; требуется новый sync engine.",
        );
      }
      if (current !== null && current.principalType !== context.principalType) {
        throw new SyncRecoveryError(
          "board.sync.principal-changed",
          "Изменился principal доски; требуется новый sync engine.",
        );
      }
      if (
        current !== null &&
        current.accessEpoch === context.accessEpoch &&
        !sameCapabilities(current.capabilities, context.capabilities)
      ) {
        throw new SyncRecoveryError(
          "board.sync.access-epoch-not-advanced",
          "Права доски изменились без обновления access epoch.",
        );
      }
      const previousPendingCount = this.#pending.length;
      this.#context = context;
      await this.#queue.setAccessScope?.({
        accessEpoch: context.accessEpoch,
        cacheScopeId: context.cacheScopeId,
      });
      this.#pending = await this.#queue.list(this.#documentId);
      this.#quarantinedCount += Math.max(
        0,
        previousPendingCount - this.#pending.length,
      );
      await this.#dropStaleOrUnauthorizedPending();
      if (this.#confirmed !== null) {
        this.#confirmed = {
          ...this.#confirmed,
          session: confirmedSession(context),
        };
        const knownSequences = this.#pending.map(({ sequence }) => sequence);
        const replayed = replayPending(this.#confirmed, this.#pending);
        await this.#quarantineConflicts(replayed.conflicts);
        this.#pending = replayed.items;
        await this.#queue.reconcile(
          this.#documentId,
          this.#pending,
          knownSequences,
        );
        this.#document = replayed.document;
        await this.#queue.saveHead(this.#confirmed);
      }
      this.#accessRefreshPending = false;
      await this.#synchronize();
    });
    this.#serial = update.catch(() => undefined);
    return update;
  }

  #enqueueDurably(
    command: BoardCommand,
    baseRevisionAtCreation: number,
  ): Promise<PendingBoardCommand> {
    const idempotencyKey = this.#createIdempotencyKey();
    const accessEpochAtCreation = this.#context?.accessEpoch;
    const pending = this.#durableSerial.then(() =>
      this.#queue.enqueue(this.#documentId, idempotencyKey, command, {
        ...(accessEpochAtCreation === undefined
          ? {}
          : { accessEpochAtCreation }),
        baseRevisionAtCreation,
      }),
    );
    this.#durableSerial = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  queue(command: BoardCommand, document: BoardDocument): Promise<void> {
    if (this.#disposed || this.#accessRefreshPending) return Promise.resolve();
    const context = this.#context;
    const confirmed = this.#confirmed;
    if (context === null || confirmed === null) {
      this.#recover(
        "board.sync.queue-failed",
        "Board sync engine is not ready.",
      );
      return Promise.resolve();
    }
    if (!context.capabilities.includes("board.write")) {
      return Promise.resolve();
    }
    if (
      command.actorId !== context.actorId ||
      document.id !== this.#documentId
    ) {
      this.#recover(
        "board.sync.actor-or-document-mismatch",
        "Команда не соответствует активному пользователю или доске.",
      );
      return Promise.resolve();
    }

    const durable = this.#enqueueDurably(command, confirmed.revision);
    this.#serial = this.#serial
      .then(async () => {
        const queued = await durable;
        if (this.#disposed) return;
        if (this.#confirmed === null) {
          throw new Error("Board sync engine is not ready.");
        }
        this.#pending = orderedPending([...this.#pending, queued]);
        const knownSequences = this.#pending.map(({ sequence }) => sequence);
        const replayed = replayPending(this.#confirmed, this.#pending);
        await this.#quarantineConflicts(replayed.conflicts);
        this.#pending = replayed.items;
        await this.#queue.reconcile(
          this.#documentId,
          this.#pending,
          knownSequences,
        );
        this.#document = replayed.document;
        this.#emitReady(this.#networkAvailable ? "online" : "offline");
        if (this.#networkAvailable) await this.#synchronize();
      })
      .catch((error: unknown) => {
        this.#recover(
          error instanceof SyncRecoveryError
            ? error.code
            : "board.sync.queue-failed",
          message(error),
        );
      });
    return this.#serial;
  }

  apply(commands: readonly BoardCommand[]): Promise<void> {
    if (this.#disposed || this.#accessRefreshPending) return Promise.resolve();
    const context = this.#context;
    const confirmed = this.#confirmed;
    const currentDocument = this.#document;
    if (context === null || confirmed === null || currentDocument === null) {
      this.#recover(
        "board.sync.undo-failed",
        "Board sync engine is not ready.",
      );
      return Promise.resolve();
    }
    if (!context.capabilities.includes("board.write")) {
      return Promise.resolve();
    }

    let preview = currentDocument;
    const rebased: BoardCommand[] = [];
    try {
      for (const candidate of commands) {
        if (candidate.actorId !== context.actorId) {
          throw new SyncRecoveryError(
            "board.sync.actor-or-document-mismatch",
            "Команда отмены не принадлежит активному пользователю.",
          );
        }
        const result = reduceBoardDocument(preview, candidate);
        if (!result.ok) return Promise.resolve();
        preview = result.document;
        rebased.push(candidate);
      }
    } catch (error) {
      this.#recover(
        error instanceof SyncRecoveryError
          ? error.code
          : "board.sync.undo-failed",
        message(error),
      );
      return Promise.resolve();
    }

    const durable = Promise.all(
      rebased.map((command) =>
        this.#enqueueDurably(command, confirmed.revision),
      ),
    );
    this.#serial = this.#serial
      .then(async () => {
        const queued = await durable;
        if (this.#disposed) return;
        if (this.#confirmed === null) {
          throw new Error("Board sync engine is not ready.");
        }
        this.#pending = orderedPending([...this.#pending, ...queued]);
        const knownSequences = this.#pending.map(({ sequence }) => sequence);
        const replayed = replayPending(this.#confirmed, this.#pending);
        await this.#quarantineConflicts(replayed.conflicts);
        this.#pending = replayed.items;
        await this.#queue.reconcile(
          this.#documentId,
          this.#pending,
          knownSequences,
        );
        this.#document = replayed.document;
        this.#emitReady(this.#networkAvailable ? "online" : "offline");
        if (this.#networkAvailable) await this.#synchronize();
      })
      .catch((error: unknown) => {
        this.#recover(
          error instanceof SyncRecoveryError
            ? error.code
            : "board.sync.undo-failed",
          message(error),
        );
      });
    return this.#serial;
  }

  synchronize(): Promise<void> {
    if (this.#disposed || this.#accessRefreshPending) return Promise.resolve();
    this.#serial = this.#serial.then(() =>
      this.#context === null || this.#context.csrfToken === ""
        ? this.#bootstrap()
        : this.#synchronize(),
    );
    return this.#serial;
  }

  async #resolveOnlineContext(): Promise<BoardRuntimeAccessContext> {
    if (this.#providedAccessContext !== null)
      return this.#providedAccessContext;
    const session = await this.#repository.context();
    return createLegacyBoardAccessContext(session, this.#documentId);
  }

  async #prepareScope(context: BoardRuntimeAccessContext): Promise<void> {
    await this.#queue.setAccessScope?.({
      accessEpoch: context.accessEpoch,
      cacheScopeId: context.cacheScopeId,
    });
  }

  async #bootstrap(): Promise<void> {
    if (this.#disposed) return;
    this.#onStateChange({ kind: "bootstrapping" });

    let cached: ConfirmedBoardHead | null = null;
    try {
      if (this.#providedAccessContext !== null) {
        this.#context = this.#providedAccessContext;
        await this.#prepareScope(this.#providedAccessContext);
      }
      this.#pending = await this.#queue.list(this.#documentId);
      if (this.#disposed) return;
      cached = await this.#queue.loadHead(this.#documentId);
      if (this.#disposed) return;

      if (this.#context === null || this.#context.csrfToken === "") {
        this.#context = await this.#resolveOnlineContext();
        if (this.#disposed) return;
        await this.#prepareScope(this.#context);
        if (this.#providedAccessContext === null) {
          this.#pending = await this.#queue.list(this.#documentId);
          cached = await this.#queue.loadHead(this.#documentId);
        }
      }
      if (this.#disposed) return;
      await this.#dropStaleOrUnauthorizedPending();
      const recovery = await this.#repository.load(this.#documentId);
      if (this.#disposed) return;
      if (cached !== null && recovery.board.currentRevision < cached.revision) {
        throw new SyncRecoveryError(
          "board.sync.server-rollback",
          `Серверная ревизия ${recovery.board.currentRevision} ниже подтверждённой локальной ревизии ${cached.revision}.`,
        );
      }
      if (recovery.snapshot === null && recovery.board.currentRevision > 0) {
        throw new SyncRecoveryError(
          "board.sync.missing-base-snapshot",
          "На сервере есть команды, но отсутствует базовый снимок ревизии 0.",
        );
      }

      let head: ConfirmedBoardHead;
      if (recovery.snapshot === null) {
        const createdAt = recovery.board.createdAt ?? this.#now();
        const document = createEmptyBoardDocument({
          createdAt,
          id: this.#documentId,
          title:
            this.#context.principalType === "legacy"
              ? "Доска занятия"
              : "Совместная доска",
        });
        const sha256 = await boardDocumentSha256(document);
        if (this.#context.capabilities.includes("board.snapshot.write")) {
          await this.#repository.saveSnapshot(
            this.#documentId,
            0,
            document,
            sha256,
            this.#context.csrfToken,
          );
          if (this.#disposed) return;
        }
        head = {
          document,
          documentId: this.#documentId,
          revision: 0,
          session: confirmedSession(this.#context),
          sha256,
        };
      } else {
        if (
          recovery.snapshot.documentId !== this.#documentId ||
          recovery.snapshot.revision > recovery.board.currentRevision
        ) {
          throw new SyncRecoveryError(
            "board.sync.invalid-snapshot",
            "Базовый снимок не соответствует активной доске.",
          );
        }
        const sha256 = await boardDocumentSha256(recovery.snapshot.document);
        if (sha256 !== recovery.snapshot.documentSha256) {
          throw new SyncRecoveryError(
            "board.sync.snapshot-sha-mismatch",
            "Контрольная сумма базового снимка не совпадает.",
          );
        }
        head = {
          document: recovery.snapshot.document,
          documentId: this.#documentId,
          revision: recovery.snapshot.revision,
          session: confirmedSession(this.#context),
          sha256,
        };
      }
      head = await applyRemoteBatches(head, recovery.commandBatches);
      if (this.#disposed) return;
      if (
        recovery.snapshot !== null &&
        head.sha256 !== recovery.board.currentDocumentSha256
      ) {
        throw new SyncRecoveryError(
          "board.sync.head-sha-mismatch",
          "Контрольная сумма актуальной серверной ревизии не совпадает.",
        );
      }
      await this.#acknowledgeRemoteDuplicates(recovery.commandBatches);
      if (this.#disposed) return;
      if (head.revision !== recovery.board.currentRevision) {
        throw new SyncRecoveryError(
          "board.sync.incomplete-recovery",
          "Сервер вернул неполный журнал восстановления.",
        );
      }
      if (
        cached !== null &&
        head.revision === cached.revision &&
        head.sha256 !== cached.sha256
      ) {
        throw new SyncRecoveryError(
          "board.sync.split-brain",
          "Сервер и локальный durable head имеют разные документы для одной ревизии.",
        );
      }
      this.#confirmed = head;
      await this.#queue.saveHead(head);
      if (this.#disposed) return;
      const knownSequences = this.#pending.map(({ sequence }) => sequence);
      const replayed = replayPending(head, this.#pending);
      await this.#quarantineConflicts(replayed.conflicts);
      this.#pending = replayed.items;
      await this.#queue.reconcile(
        this.#documentId,
        this.#pending,
        knownSequences,
      );
      this.#document = replayed.document;
      this.#emitReady(this.#networkAvailable ? "online" : "offline");
      await this.#synchronize();
    } catch (error) {
      if (
        cached !== null &&
        !(error instanceof SyncRecoveryError) &&
        (retryable(error) ||
          (typeof navigator !== "undefined" && !navigator.onLine))
      ) {
        this.#confirmed = cached;
        this.#context = this.#context ?? cachedLegacyContext(cached);
        if (this.#context === null) {
          this.#onStateChange({
            code: "board.sync.offline-context-missing",
            kind: "failure",
            message:
              "Не удалось восстановить security context локальной доски.",
          });
          return;
        }
        const knownSequences = this.#pending.map(({ sequence }) => sequence);
        const replayed = replayPending(cached, this.#pending);
        await this.#quarantineConflicts(replayed.conflicts);
        this.#pending = replayed.items;
        await this.#queue.reconcile(
          this.#documentId,
          this.#pending,
          knownSequences,
        );
        this.#document = replayed.document;
        this.#emitReady("offline");
        return;
      }
      if (error instanceof SyncRecoveryError) {
        this.#recover(error.code, error.message);
        return;
      }
      this.#onStateChange({
        code: "board.sync.bootstrap-failed",
        kind: "failure",
        message: message(error),
      });
    }
  }

  async #dropStaleOrUnauthorizedPending(): Promise<void> {
    const context = this.#context;
    if (context === null || this.#pending.length === 0) return;
    const knownSequences = this.#pending.map(({ sequence }) => sequence);
    const canWrite = context.capabilities.includes("board.write");
    const retained = this.#pending.filter(
      (item) =>
        canWrite &&
        (item.accessEpochAtCreation === undefined ||
          item.accessEpochAtCreation === context.accessEpoch),
    );
    const removed = this.#pending.length - retained.length;
    if (removed === 0) return;
    this.#pending = retained;
    this.#quarantinedCount += removed;
    await this.#queue.reconcile(this.#documentId, retained, knownSequences);
  }

  async #synchronize(): Promise<void> {
    if (this.#disposed || this.#accessRefreshPending) return;
    if (
      this.#context === null ||
      this.#confirmed === null ||
      this.#document === null
    ) {
      return;
    }
    if (!this.#networkAvailable) {
      this.#emitReady("offline");
      return;
    }
    try {
      await this.#dropStaleOrUnauthorizedPending();
      if (this.#pending.length === 0) {
        await this.#pullAll();
        if (this.#disposed) return;
      }
      let safety = 0;
      while (!this.#disposed && this.#pending.length > 0) {
        if (++safety > 1_000) {
          throw new SyncRecoveryError(
            "board.sync.loop-limit",
            "Синхронизация превысила безопасный предел повторов.",
          );
        }
        if (!this.#context.capabilities.includes("board.write")) {
          await this.#dropStaleOrUnauthorizedPending();
          break;
        }
        const knownSequences = this.#pending.map(({ sequence }) => sequence);
        const replayed = replayPending(this.#confirmed, this.#pending);
        await this.#quarantineConflicts(replayed.conflicts);
        this.#pending = replayed.items;
        await this.#queue.reconcile(
          this.#documentId,
          this.#pending,
          knownSequences,
        );
        if (this.#disposed) return;
        this.#document = replayed.document;
        const first = this.#pending[0];
        if (first === undefined) break;
        if (
          first.accessEpochAtCreation !== undefined &&
          first.accessEpochAtCreation !== this.#context.accessEpoch
        ) {
          await this.#dropStaleOrUnauthorizedPending();
          continue;
        }
        const applied = applyCommand(this.#confirmed.document, first.command);
        const sha256 = await boardDocumentSha256(applied);
        const result = await this.#repository.push(
          {
            actorId: this.#context.actorId,
            baseRevision: this.#confirmed.revision,
            commands: [orderedFromPending(first)],
            documentId: this.#documentId,
            expectedDocumentSha256: sha256,
            idempotencyKey: first.idempotencyKey,
            originId: this.#originId,
            schemaVersion: "1.5",
          },
          this.#context.csrfToken,
        );
        if (this.#disposed) return;
        if (result.status === "conflict") {
          if (result.currentRevision < this.#confirmed.revision) {
            throw new SyncRecoveryError(
              "board.sync.server-rollback",
              `Серверная ревизия ${result.currentRevision} ниже подтверждённой локальной ревизии ${this.#confirmed.revision}.`,
            );
          }
          this.#confirmed = await applyRemoteBatches(
            this.#confirmed,
            result.missingCommandBatches,
          );
          if (this.#disposed) return;
          if (
            result.hasMore ||
            this.#confirmed.revision < result.currentRevision
          ) {
            await this.#pullAll();
            if (this.#disposed) return;
          }
          continue;
        }
        if (
          result.revision !== this.#confirmed.revision + 1 ||
          result.currentDocumentSha256 !== sha256
        ) {
          throw new SyncRecoveryError(
            "board.sync.invalid-acceptance",
            "Подтверждение сервера не соответствует отправленной ревизии.",
          );
        }
        this.#confirmed = {
          document: applied,
          documentId: this.#documentId,
          revision: result.revision,
          session: confirmedSession(this.#context),
          sha256,
        };
        await this.#queue.acknowledge(this.#documentId, first.sequence);
        if (this.#disposed) return;
        this.#pending = this.#pending.slice(1);
        await this.#queue.saveHead(this.#confirmed);
      }
      const knownSequences = this.#pending.map(({ sequence }) => sequence);
      const replayed = replayPending(this.#confirmed, this.#pending);
      await this.#quarantineConflicts(replayed.conflicts);
      this.#pending = replayed.items;
      await this.#queue.reconcile(
        this.#documentId,
        this.#pending,
        knownSequences,
      );
      this.#document = replayed.document;
      this.#emitReady(this.#networkAvailable ? "online" : "offline");
    } catch (error) {
      if (error instanceof SyncRecoveryError || !retryable(error)) {
        this.#recover(
          error instanceof SyncRecoveryError
            ? error.code
            : "board.sync.non-retryable",
          message(error),
        );
        return;
      }
      this.#emitReady("offline");
    }
  }

  async #pullAll(): Promise<void> {
    if (this.#confirmed === null) return;
    let hasMore = true;
    let reportedCurrentRevision = this.#confirmed.revision;
    while (!this.#disposed && hasMore) {
      const page = await this.#repository.pull(
        this.#documentId,
        this.#confirmed.revision,
      );
      if (this.#disposed) return;
      if (page.currentRevision < this.#confirmed.revision) {
        throw new SyncRecoveryError(
          "board.sync.server-rollback",
          `Серверная ревизия ${page.currentRevision} ниже подтверждённой локальной ревизии ${this.#confirmed.revision}.`,
        );
      }
      this.#confirmed = await applyRemoteBatches(this.#confirmed, page.items);
      if (this.#disposed) return;
      await this.#acknowledgeRemoteDuplicates(page.items);
      if (this.#disposed) return;
      await this.#queue.saveHead(this.#confirmed);
      hasMore = page.hasMore;
      reportedCurrentRevision = page.currentRevision;
      if (page.items.length === 0 && hasMore) {
        throw new SyncRecoveryError(
          "board.sync.empty-page",
          "Сервер сообщил о продолжении журнала без следующей ревизии.",
        );
      }
    }
    if (this.#confirmed.revision !== reportedCurrentRevision) {
      throw new SyncRecoveryError(
        "board.sync.incomplete-command-page",
        "Сервер не вернул все заявленные ревизии доски.",
      );
    }
  }

  async #acknowledgeRemoteDuplicates(
    batches: readonly ServerBoardCommandBatch[],
  ): Promise<void> {
    if (this.#pending.length === 0 || batches.length === 0) return;
    const byKey = new Map(
      batches.map((batch) => [batch.idempotencyKey, batch] as const),
    );
    const remaining: PendingBoardCommand[] = [];
    for (const item of this.#pending) {
      if (this.#disposed) return;
      const accepted = byKey.get(item.idempotencyKey);
      if (accepted === undefined) {
        remaining.push(item);
        continue;
      }
      const acceptedCommands = commandsFromBatch(accepted);
      if (
        acceptedCommands.length !== 1 ||
        JSON.stringify(acceptedCommands[0]) !== JSON.stringify(item.command)
      ) {
        throw new SyncRecoveryError(
          "board.sync.idempotency-mismatch",
          "Серверная команда с локальным idempotency key имеет другое содержимое.",
        );
      }
      await this.#queue.acknowledge(this.#documentId, item.sequence);
    }
    this.#pending = remaining;
  }

  #emitReady(network: "offline" | "online"): void {
    if (
      this.#disposed ||
      this.#context === null ||
      this.#confirmed === null ||
      this.#document === null
    ) {
      return;
    }
    this.#onStateChange({
      accessEpoch: this.#context.accessEpoch,
      actorId: this.#context.actorId,
      capabilities: [...this.#context.capabilities],
      confirmedSha256: this.#confirmed.sha256,
      document: this.#document,
      kind: "ready",
      network,
      pendingCount: this.#pending.length,
      principalType: this.#context.principalType,
      quarantinedCount: this.#quarantinedCount,
      revision: this.#confirmed.revision,
      role: this.#context.role,
    });
  }

  async #quarantineConflicts(
    conflicts: readonly PendingBoardCommandConflict[],
  ): Promise<void> {
    if (conflicts.length === 0) return;
    await this.#queue.quarantineConflicts?.(this.#documentId, conflicts);
    this.#quarantinedCount += conflicts.length;
  }

  #recover(code: string, recoveryMessage: string): void {
    if (this.#disposed) return;
    this.#onStateChange({
      code,
      document: this.#document,
      kind: "recovery-required",
      message: recoveryMessage,
      pendingCount: this.#pending.length,
    });
  }
}
