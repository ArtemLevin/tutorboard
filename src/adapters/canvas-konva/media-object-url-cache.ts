import type { BoardMediaContentSource } from "../../core/public";

export interface MediaObjectUrlHandle {
  readonly promise: Promise<string>;
  release(): void;
}

interface MediaObjectUrlEntry {
  readonly abort: AbortController;
  readonly promise: Promise<string>;
  refs: number;
  url: string | null;
}

/**
 * Encoded GIF bytes are shared only while active consumers exist.
 * Every security scope keeps a distinct identity; no zero-ref object URL survives.
 */
export class MediaObjectUrlCache {
  readonly #entries = new Map<string, MediaObjectUrlEntry>();

  acquire(source: BoardMediaContentSource): MediaObjectUrlHandle {
    const key = source.cacheKey;
    let entry = this.#entries.get(key);
    if (entry === undefined) {
      const abort = new AbortController();
      const created: MediaObjectUrlEntry = {
        abort,
        refs: 0,
        url: null,
        promise: source
          .loadBlob(abort.signal)
          .then((blob) => {
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
          })
          .catch((cause: unknown) => {
            if (this.#entries.get(key) === created) {
              this.#entries.delete(key);
            }
            throw cause;
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
