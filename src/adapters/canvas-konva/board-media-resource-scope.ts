/**
 * Frontend-only ownership boundary for asynchronous board media handles.
 * Cache implementations still own their shared resources and late-result disposal.
 */
export interface BoardMediaResourceIdentity {
  readonly boardId: string;
  readonly resourceGeneration: number;
}

export interface BoardMediaHandle<T> {
  readonly promise: Promise<T>;
  release(): void;
}

export type BoardMediaHandleFactory<T> = (
  signal: AbortSignal,
) => BoardMediaHandle<T>;

export interface BoardMediaResourceScopeSnapshot
  extends BoardMediaResourceIdentity {
  readonly disposed: boolean;
  readonly activeLeases: number;
  readonly pendingLeases: number;
  readonly readyLeases: number;
}

interface TrackedLease {
  pending: boolean;
  release(): void;
}

/**
 * A scope owns only its acquired handles, never the underlying shared cache.
 *
 * invalidate() advances resourceGeneration and releases all old leases.
 * dispose() permanently closes the scope. Both operations are idempotent
 * with respect to releasing each lease.
 */
export class BoardMediaResourceScope {
  readonly boardId: string;
  readonly #leases = new Set<TrackedLease>();
  #resourceGeneration: number;
  #disposed = false;

  constructor(boardId: string, resourceGeneration = 0) {
    if (boardId.trim().length === 0) {
      throw new Error("Board media scope requires a boardId.");
    }
    if (!Number.isSafeInteger(resourceGeneration) || resourceGeneration < 0) {
      throw new RangeError("Invalid board resource generation.");
    }
    this.boardId = boardId;
    this.#resourceGeneration = resourceGeneration;
  }

  get identity(): BoardMediaResourceIdentity {
    return {
      boardId: this.boardId,
      resourceGeneration: this.#resourceGeneration,
    };
  }

  acquire<T>(factory: BoardMediaHandleFactory<T>): BoardMediaHandle<T> {
    if (this.#disposed) {
      throw new Error("Board media resource scope is disposed.");
    }

    const controller = new AbortController();
    const underlying = factory(controller.signal);
    let active = true;
    let settled = false;
    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (cause: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const lease: TrackedLease = {
      pending: true,
      release: () => {
        if (!active) return;
        active = false;
        controller.abort();
        try {
          underlying.release();
        } finally {
          this.#leases.delete(lease);
          if (!settled) {
            settled = true;
            rejectPromise(new DOMException("Board media scope cancelled.", "AbortError"));
          }
        }
      },
    };
    this.#leases.add(lease);
    void underlying.promise.then(
      (value) => {
        if (!active) return;
        lease.pending = false;
        settled = true;
        resolvePromise(value);
      },
      (cause: unknown) => {
        if (!active) return;
        lease.pending = false;
        settled = true;
        rejectPromise(cause);
        lease.release();
      },
    );
    return { promise, release: lease.release };
  }

  invalidate(): void {
    if (this.#disposed) return;
    if (!Number.isSafeInteger(this.#resourceGeneration + 1)) {
      throw new RangeError("Board resource generation overflow.");
    }
    this.#resourceGeneration += 1;
    this.#releaseAll();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#releaseAll();
  }

  snapshot(): BoardMediaResourceScopeSnapshot {
    let pendingLeases = 0;
    for (const lease of this.#leases) {
      if (lease.pending) pendingLeases += 1;
    }
    return {
      ...this.identity,
      disposed: this.#disposed,
      activeLeases: this.#leases.size,
      pendingLeases,
      readyLeases: this.#leases.size - pendingLeases,
    };
  }

  #releaseAll(): void {
    for (const lease of [...this.#leases]) lease.release();
  }
}
