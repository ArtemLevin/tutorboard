import type {
  BoardDocument,
  BoardDocumentRepository,
  LocalRevisionId,
  PersistenceOperationId,
  SaveBoardDocumentInput,
  SaveBoardDocumentPriority,
  SaveBoardDocumentResult,
} from "../../core/public";
import { bindLocalAutosaveLifecycleFlush } from "./lifecycle";

export type LocalAutosaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "scheduled" }
  | { readonly kind: "saving" }
  | {
      readonly duplicate: boolean;
      readonly kind: "saved";
      readonly revisionId: LocalRevisionId;
      readonly savedAt: string;
    }
  | {
      readonly code: string;
      readonly kind: "error";
      readonly message: string;
      readonly retryable: boolean;
    }
  | {
      readonly currentRevisionId: LocalRevisionId | null;
      readonly kind: "conflict";
    };

export interface LocalAutosaveOptions {
  readonly createOperationId: () => PersistenceOperationId;
  readonly debounceMs?: number;
  readonly initialDocument?: BoardDocument | null;
  readonly initialRevisionId: LocalRevisionId | null;
  readonly now: () => string;
  readonly onStateChange: (state: LocalAutosaveState) => void;
  readonly repository: BoardDocumentRepository;
}

interface SaveTask {
  readonly document: BoardDocument;
  readonly operationId: PersistenceOperationId;
  readonly priority: SaveBoardDocumentPriority;
  readonly savedAt: string;
}

export class LocalDocumentAutosave {
  readonly #createOperationId: () => PersistenceOperationId;
  readonly #debounceMs: number;
  readonly #now: () => string;
  readonly #onStateChange: (state: LocalAutosaveState) => void;
  readonly #repository: BoardDocumentRepository;
  #activeInput: SaveBoardDocumentInput | null = null;
  #resolveActivePromotion:
    ((result: Promise<SaveBoardDocumentResult>) => void) | null = null;
  readonly #promotedTasks = new Map<
    PersistenceOperationId,
    Promise<SaveBoardDocumentResult>
  >();
  #disposed = false;
  #inFlight: Promise<void> = Promise.resolve();
  #isSaving = false;
  #lifecyclePromotion: {
    readonly operationId: PersistenceOperationId;
    readonly promise: Promise<void>;
  } | null = null;
  #lastFailedTask: SaveTask | null = null;
  #lastPersistedDocument: BoardDocument | null;
  #queuedDocument: BoardDocument | null = null;
  #revisionId: LocalRevisionId | null;
  readonly #tasks: SaveTask[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #unbindLifecycleFlush: (() => void) | null = null;

  constructor(options: LocalAutosaveOptions) {
    this.#createOperationId = options.createOperationId;
    this.#debounceMs = options.debounceMs ?? 350;
    this.#lastPersistedDocument = options.initialDocument ?? null;
    this.#now = options.now;
    this.#onStateChange = options.onStateChange;
    this.#repository = options.repository;
    this.#revisionId = options.initialRevisionId;

    if (typeof document !== "undefined" && typeof window !== "undefined") {
      this.#unbindLifecycleFlush = bindLocalAutosaveLifecycleFlush(this, {
        documentTarget: document,
        windowTarget: window,
      });
    }
  }

  schedule(document: BoardDocument): void {
    if (
      this.#disposed ||
      (document === this.#lastPersistedDocument &&
        !this.#isSaving &&
        this.#queuedDocument === null)
    ) {
      return;
    }
    this.#queuedDocument = document;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.#onStateChange({ kind: "scheduled" });
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#enqueueLatest("background");
    }, this.#debounceMs);
  }

  async flush(
    priority: SaveBoardDocumentPriority = "background",
  ): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#enqueueLatest(priority);
    }
    if (priority === "lifecycle") {
      this.#promoteActiveSaveForLifecycle();
    }
    const promotion = this.#lifecyclePromotion?.promise;
    await this.#inFlight;
    if (promotion !== undefined) await promotion;
  }

  retry(): void {
    if (this.#disposed || this.#lastFailedTask === null) {
      return;
    }
    this.#enqueue(this.#lastFailedTask);
  }

  dispose(): void {
    this.#unbindLifecycleFlush?.();
    this.#unbindLifecycleFlush = null;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    // SPA navigation can unmount the board without firing pagehide or
    // visibilitychange. Move the latest debounced document into the durable
    // save chain before rejecting future schedules.
    this.#enqueueLatest("lifecycle");
    this.#promoteActiveSaveForLifecycle();
    this.#disposed = true;
  }

  #enqueueLatest(priority: SaveBoardDocumentPriority): void {
    const document = this.#queuedDocument;
    this.#queuedDocument = null;
    if (document === null) {
      return;
    }
    this.#enqueue({
      document,
      operationId: this.#createOperationId(),
      priority,
      savedAt: this.#now(),
    });
  }

  #enqueue(task: SaveTask): void {
    this.#tasks.push(task);
    if (!this.#isSaving) {
      this.#isSaving = true;
      // Starting the async drain invokes repository.save synchronously up to
      // its first durable await. This is essential on pagehide: merely queuing
      // a Promise microtask can let the browser terminate the page first.
      this.#inFlight = this.#drain();
    }
  }

  async #drain(): Promise<void> {
    while (this.#tasks.length > 0) {
      const task = this.#tasks.shift();
      if (task === undefined) continue;
      try {
        await this.#persist(task);
      } catch (error) {
        this.#lastFailedTask = task;
        this.#onStateChange({
          code: "persistence.save-threw",
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected persistence failure.",
          retryable: true,
        });
      }
    }
    this.#isSaving = false;
  }

  async #persist(task: SaveTask): Promise<void> {
    // A save already accepted into this chain must be allowed to finish even
    // after the owning React workspace has unmounted.
    this.#onStateChange({ kind: "saving" });
    const input: SaveBoardDocumentInput = {
      document: task.document,
      expectedRevisionId: this.#revisionId,
      operationId: task.operationId,
      priority: task.priority,
      savedAt: task.savedAt,
    };
    this.#activeInput = input;
    let result: SaveBoardDocumentResult;
    try {
      // Prepare only when this debounced snapshot reaches its save turn. The
      // save joins immediately, so even an uncached large result is consumed
      // once. Lifecycle flush enters the synchronous durable path directly.
      if (
        task.priority === "background" &&
        !this.#promotedTasks.has(task.operationId)
      ) {
        this.#repository.prepareSave?.(task.document);
      }
      const promotion = new Promise<SaveBoardDocumentResult>((resolve) => {
        this.#resolveActivePromotion = resolve;
      });
      const save =
        this.#promotedTasks.get(task.operationId) ??
        this.#repository.save(input);
      result = await Promise.race([save, promotion]);
    } finally {
      this.#promotedTasks.delete(task.operationId);
      if (this.#activeInput === input) {
        this.#activeInput = null;
        this.#resolveActivePromotion = null;
      }
    }
    if (result.status === "saved") {
      this.#revisionId = result.revisionId;
      this.#lastPersistedDocument = task.document;
      this.#lastFailedTask = null;
      // A later accepted write can overwrite this document, even when Undo
      // has returned to the same identity. Only discard a duplicate debounce
      // when no such write remains. "saved" must describe the latest state.
      if (this.#queuedDocument === task.document && this.#tasks.length === 0) {
        this.#queuedDocument = null;
        if (this.#timer !== null) {
          clearTimeout(this.#timer);
          this.#timer = null;
        }
      }
      if (this.#queuedDocument !== null || this.#tasks.length > 0) {
        this.#onStateChange({
          kind: this.#tasks.length > 0 ? "saving" : "scheduled",
        });
        return;
      }
      this.#onStateChange({
        duplicate: result.duplicate,
        kind: "saved",
        revisionId: result.revisionId,
        savedAt: task.savedAt,
      });
      return;
    }
    if (result.status === "conflict") {
      this.#lastFailedTask = null;
      this.#onStateChange({
        currentRevisionId: result.currentRevisionId,
        kind: "conflict",
      });
      return;
    }
    if (result.status === "invalid-document") {
      this.#lastFailedTask = null;
      this.#onStateChange({
        code: "persistence.invalid-document",
        kind: "error",
        message: result.issues.map((item) => item.code).join(", "),
        retryable: false,
      });
      return;
    }
    this.#lastFailedTask = task;
    this.#onStateChange({
      code: result.code,
      kind: "error",
      message: result.message,
      retryable: true,
    });
  }

  #promoteActiveSaveForLifecycle(): void {
    const input = this.#activeInput;
    if (input === null) return;
    if (input.priority === "lifecycle" && this.#tasks.length === 0) return;
    const inputs =
      this.#repository.saveLifecycleBatch === undefined
        ? [{ ...input, priority: "lifecycle" as const }]
        : [
            { ...input, priority: "lifecycle" as const },
            ...this.#tasks.map((task): SaveBoardDocumentInput => ({
              ...task,
              priority: "lifecycle",
              expectedRevisionId: this.#revisionId,
            })),
          ];
    const last = inputs.at(-1)!;
    if (this.#lifecyclePromotion?.operationId === last.operationId) return;
    // Invoke the repository now. Dexie serializes ALL accepted snapshots before
    // returning, then commits their CAS chain atomically, without waiting for
    // the old Worker. Late background replies are ordinary idempotent retries.
    const results =
      this.#repository.saveLifecycleBatch === undefined
        ? this.#repository.save(inputs[0]!).then((result) => [result])
        : this.#repository.saveLifecycleBatch(inputs);
    for (let index = 0; index < inputs.length; index += 1) {
      const result = results.then((items) => {
        const item = items[index];
        if (item === undefined)
          throw new Error("Missing lifecycle batch result.");
        return item;
      });
      // A later queued task may not attach its await until this batch settles.
      // Retain rejection for that consumer while avoiding an unhandled promise.
      void result.catch(() => undefined);
      this.#promotedTasks.set(inputs[index]!.operationId, result);
      if (index === 0) this.#resolveActivePromotion?.(result);
    }
    this.#lifecyclePromotion = {
      operationId: last.operationId,
      promise: results.then(
        () => undefined,
        () => undefined,
      ),
    };
  }
}
