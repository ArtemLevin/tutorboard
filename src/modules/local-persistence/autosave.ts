import type {
  BoardDocument,
  BoardDocumentRepository,
  LocalRevisionId,
  PersistenceOperationId,
  SaveBoardDocumentInput,
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
  readonly savedAt: string;
}

export class LocalDocumentAutosave {
  readonly #createOperationId: () => PersistenceOperationId;
  readonly #debounceMs: number;
  readonly #now: () => string;
  readonly #onStateChange: (state: LocalAutosaveState) => void;
  readonly #repository: BoardDocumentRepository;
  #disposed = false;
  #inFlight: Promise<void> = Promise.resolve();
  #lastFailedTask: SaveTask | null = null;
  #lastPersistedDocument: BoardDocument | null;
  #queuedDocument: BoardDocument | null = null;
  #revisionId: LocalRevisionId | null;
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
    if (this.#disposed || document === this.#lastPersistedDocument) {
      return;
    }
    this.#queuedDocument = document;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.#onStateChange({ kind: "scheduled" });
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#enqueueLatest();
    }, this.#debounceMs);
  }

  async flush(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#enqueueLatest();
    }
    await this.#inFlight;
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
    this.#disposed = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #enqueueLatest(): void {
    const document = this.#queuedDocument;
    this.#queuedDocument = null;
    if (document === null || document === this.#lastPersistedDocument) {
      return;
    }
    this.#enqueue({
      document,
      operationId: this.#createOperationId(),
      savedAt: this.#now(),
    });
  }

  #enqueue(task: SaveTask): void {
    const persist = async () => {
      if (this.#disposed) {
        return;
      }
      this.#onStateChange({ kind: "saving" });
      const input: SaveBoardDocumentInput = {
        document: task.document,
        expectedRevisionId: this.#revisionId,
        operationId: task.operationId,
        savedAt: task.savedAt,
      };
      const result = await this.#repository.save(input);
      if (result.status === "saved") {
        this.#revisionId = result.revisionId;
        this.#lastPersistedDocument = task.document;
        this.#lastFailedTask = null;
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
    };
    this.#inFlight = this.#inFlight.then(persist, persist);
  }
}
