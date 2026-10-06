export interface RasterImageDiagnosticsSnapshot {
  readonly activeDecodedCount: number;
  readonly activeEstimatedDecodedBytes: number;
  readonly decodeCompletedCount: number;
  readonly decodeFailedCount: number;
  readonly decodeStartedCount: number;
  readonly duplicateDecodeStartCount: number;
  readonly lastDecodeMs: number;
  readonly maxDecodeMs: number;
  readonly peakActiveDecodedCount: number;
  readonly peakEstimatedDecodedBytes: number;
  readonly releasedCount: number;
}

interface RasterDecodeSession {
  readonly contentSha256: string;
  readonly startedAtMs: number;
  estimatedDecodedBytes: number;
  state: "decoding" | "loaded";
}

type RasterImageDiagnosticsListener = (
  snapshot: RasterImageDiagnosticsSnapshot,
) => void;

function emptySnapshot(): RasterImageDiagnosticsSnapshot {
  return {
    activeDecodedCount: 0,
    activeEstimatedDecodedBytes: 0,
    decodeCompletedCount: 0,
    decodeFailedCount: 0,
    decodeStartedCount: 0,
    duplicateDecodeStartCount: 0,
    lastDecodeMs: 0,
    maxDecodeMs: 0,
    peakActiveDecodedCount: 0,
    peakEstimatedDecodedBytes: 0,
    releasedCount: 0,
  };
}

export class RasterImageDiagnostics {
  readonly #activeHashes = new Map<string, number>();
  readonly #listeners = new Set<RasterImageDiagnosticsListener>();
  readonly #sessions = new Map<number, RasterDecodeSession>();
  #nextSessionId = 1;
  #snapshot = emptySnapshot();

  begin(contentSha256: string, startedAtMs: number): number {
    const activeForHash = this.#activeHashes.get(contentSha256) ?? 0;
    if (activeForHash > 0) {
      this.#snapshot = {
        ...this.#snapshot,
        duplicateDecodeStartCount:
          this.#snapshot.duplicateDecodeStartCount + 1,
      };
    }
    this.#activeHashes.set(contentSha256, activeForHash + 1);
    const sessionId = this.#nextSessionId++;
    this.#sessions.set(sessionId, {
      contentSha256,
      estimatedDecodedBytes: 0,
      startedAtMs,
      state: "decoding",
    });
    this.#snapshot = {
      ...this.#snapshot,
      decodeStartedCount: this.#snapshot.decodeStartedCount + 1,
    };
    this.#emit();
    return sessionId;
  }

  complete(
    sessionId: number,
    intrinsicWidth: number,
    intrinsicHeight: number,
    completedAtMs: number,
  ): void {
    const session = this.#sessions.get(sessionId);
    if (session === undefined || session.state !== "decoding") return;
    const estimatedDecodedBytes =
      Math.max(0, intrinsicWidth) * Math.max(0, intrinsicHeight) * 4;
    session.estimatedDecodedBytes = estimatedDecodedBytes;
    session.state = "loaded";
    const activeDecodedCount = this.#snapshot.activeDecodedCount + 1;
    const activeEstimatedDecodedBytes =
      this.#snapshot.activeEstimatedDecodedBytes + estimatedDecodedBytes;
    const decodeMs = Math.max(0, completedAtMs - session.startedAtMs);
    this.#snapshot = {
      ...this.#snapshot,
      activeDecodedCount,
      activeEstimatedDecodedBytes,
      decodeCompletedCount: this.#snapshot.decodeCompletedCount + 1,
      lastDecodeMs: decodeMs,
      maxDecodeMs: Math.max(this.#snapshot.maxDecodeMs, decodeMs),
      peakActiveDecodedCount: Math.max(
        this.#snapshot.peakActiveDecodedCount,
        activeDecodedCount,
      ),
      peakEstimatedDecodedBytes: Math.max(
        this.#snapshot.peakEstimatedDecodedBytes,
        activeEstimatedDecodedBytes,
      ),
    };
    this.#emit();
  }

  fail(sessionId: number): void {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return;
    this.#sessions.delete(sessionId);
    this.#decrementHash(session.contentSha256);
    this.#snapshot = {
      ...this.#snapshot,
      decodeFailedCount: this.#snapshot.decodeFailedCount + 1,
    };
    this.#emit();
  }

  release(sessionId: number): void {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return;
    this.#sessions.delete(sessionId);
    this.#decrementHash(session.contentSha256);
    this.#snapshot = {
      ...this.#snapshot,
      activeDecodedCount:
        session.state === "loaded"
          ? Math.max(0, this.#snapshot.activeDecodedCount - 1)
          : this.#snapshot.activeDecodedCount,
      activeEstimatedDecodedBytes:
        session.state === "loaded"
          ? Math.max(
              0,
              this.#snapshot.activeEstimatedDecodedBytes -
                session.estimatedDecodedBytes,
            )
          : this.#snapshot.activeEstimatedDecodedBytes,
      releasedCount: this.#snapshot.releasedCount + 1,
    };
    this.#emit();
  }

  reset(): void {
    this.#activeHashes.clear();
    this.#sessions.clear();
    this.#snapshot = emptySnapshot();
    this.#emit();
  }

  snapshot(): RasterImageDiagnosticsSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: RasterImageDiagnosticsListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => this.#listeners.delete(listener);
  }

  #decrementHash(contentSha256: string): void {
    const count = this.#activeHashes.get(contentSha256) ?? 0;
    if (count <= 1) this.#activeHashes.delete(contentSha256);
    else this.#activeHashes.set(contentSha256, count - 1);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export const rasterImageDiagnostics = new RasterImageDiagnostics();
