import type { BoardMediaContentSource } from "../../core/public";

export interface MediaObjectUrlHandle {
  readonly promise: Promise<string>;
  release(): void;
}

interface MediaObjectUrlEntry {
  readonly abort: AbortController;
  readonly promise: Promise<string>;
  pending: boolean;
  refs: number;
  url: string | null;
}

/**
 * Encoded GIF bytes are shared only while active consumers exist.
 * Every security scope keeps a distinct identity; no zero-ref object URL survives.
 */
export class MediaObjectUrlCache {
  readonly #entries = new Map<string, MediaObjectUrlEntry>();

  snapshot(): {
    readonly activeObjectUrls: number;
    readonly activeReferences: number;
    readonly entryCount: number;
    readonly pendingLoads: number;
  } {
    const entries = [...this.#entries.values()];
    return {
      activeObjectUrls: entries.filter((entry) => entry.url !== null).length,
      activeReferences: entries.reduce((sum, entry) => sum + entry.refs, 0),
      entryCount: entries.length,
      pendingLoads: entries.filter((entry) => entry.pending).length,
    };
  }

  /**
   * A zero-reference GIF URL never survives. This is an idempotent,
   * source-targeted diagnostic hook for the board cleanup path.
   */
  discardUnusedSource(cacheKey: string): void {
    const entry = this.#entries.get(cacheKey);
    if (entry === undefined || entry.refs > 0) return;
    this.#entries.delete(cacheKey);
    entry.abort.abort();
    if (entry.url !== null) {
      URL.revokeObjectURL(entry.url);
      entry.url = null;
    }
  }

  acquire(source: BoardMediaContentSource): MediaObjectUrlHandle {
    const key = source.cacheKey;
    let entry = this.#entries.get(key);
    if (entry === undefined) {
      const abort = new AbortController();
      let abortReject!: (error: Error) => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        abortReject = reject;
      });
      const onAbort = () =>
        abortReject(new DOMException("Media source cancelled.", "AbortError"));
      abort.signal.addEventListener("abort", onAbort, { once: true });
      const created: MediaObjectUrlEntry = {
        abort,
        pending: true,
        refs: 0,
        url: null,
        promise: Promise.race([
          source.loadBlob(abort.signal).then((blob) => {
            if (abort.signal.aborted) {
              throw new DOMException("Media source cancelled.", "AbortError");
            }
            const url = URL.createObjectURL(blob);
            if (abort.signal.aborted) {
              URL.revokeObjectURL(url);
              throw new DOMException("Media source cancelled.", "AbortError");
            }
            created.url = url;
            return url;
          }),
          cancelled,
        ])
          .catch((cause: unknown) => {
            if (this.#entries.get(key) === created) {
              this.#entries.delete(key);
            }
            throw cause;
          })
          .finally(() => {
            created.pending = false;
            abort.signal.removeEventListener("abort", onAbort);
          }),
      };
      entry = created;
      this.#entries.set(key, entry);
    }
    const acquired = entry;
    acquired.refs += 1;
    let released = false;
    return {
      promise: acquired.promise,
      release: () => {
        if (released) return;
        released = true;
        acquired.refs -= 1;
        if (acquired.refs > 0) return;
        if (this.#entries.get(key) === acquired) this.#entries.delete(key);
        acquired.abort.abort();
        if (acquired.url !== null) {
          URL.revokeObjectURL(acquired.url);
          acquired.url = null;
        }
      },
    };
  }
}

export const mediaObjectUrlCache = new MediaObjectUrlCache();
