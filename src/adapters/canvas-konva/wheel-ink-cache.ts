/**
 * Bounded rasterization of uninterrupted immutable pen-stroke runs.
 * Prepares the Konva scene/hit canvases during browser idle time when possible.
 * Cached hit canvases preserve individual stroke hit testing.
 */
export interface WheelInkNode {
  cache(config: {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio: number;
    hitCanvasPixelRatio: number;
  }): unknown;
  clearCache(): unknown;
  getClientRect(config: { skipTransform: boolean }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getLayer(): { batchDraw(): unknown } | null;
}

export const minimumWheelCacheStrokes = 80;
export const maximumWheelCachePixels = 4_000_000;

function boundedPixelRatio(devicePixelRatio: number): number {
  return Math.max(
    1,
    Math.min(2, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1),
  );
}

export class WheelInkCacheCoordinator {
  readonly #nodes = new Set<WheelInkNode>();
  readonly #cached = new Set<WheelInkNode>();
  #active = false;
  #preparedPixelRatio: number | null = null;
  #buildCount = 0;
  #lastBuildDurationMs = 0;
  #lastBuildPixels = 0;
  #lastBuildSkippedRuns = 0;
  #lastWheelBeginDurationMs = 0;
  #lastWheelBeginStartMs = 0;
  #lastWheelBeginEndMs = 0;
  #lastWheelUsedPrepared = false;

  get cachedCount(): number {
    return this.#cached.size;
  }

  get buildCount(): number {
    return this.#buildCount;
  }

  get canPrepare(): boolean {
    return (
      this.#nodes.size > 0 &&
      !this.#active &&
      this.#preparedPixelRatio === null
    );
  }

  get isPrepared(): boolean {
    return this.#preparedPixelRatio !== null;
  }

  get lastBuildDurationMs(): number {
    return this.#lastBuildDurationMs;
  }

  get lastBuildPixels(): number {
    return this.#lastBuildPixels;
  }

  get lastBuildSkippedRuns(): number {
    return this.#lastBuildSkippedRuns;
  }

  get lastWheelBeginDurationMs(): number {
    return this.#lastWheelBeginDurationMs;
  }

  get lastWheelBeginStartMs(): number {
    return this.#lastWheelBeginStartMs;
  }

  get lastWheelBeginEndMs(): number {
    return this.#lastWheelBeginEndMs;
  }

  get lastWheelUsedPrepared(): boolean {
    return this.#lastWheelUsedPrepared;
  }

  register(node: WheelInkNode): () => void {
    // A mounted run changes the set of cacheable objects: cached images from
    // an earlier board snapshot must never be reused after this registration.
    if (this.isPrepared) this.invalidate();
    this.#nodes.add(node);
    return () => {
      this.#release(node);
      this.#nodes.delete(node);
      this.#preparedPixelRatio = null;
    };
  }

  prepare(devicePixelRatio = 1): boolean {
    if (!this.canPrepare) return false;
    const ratio = boundedPixelRatio(devicePixelRatio);
    this.#build(ratio);
    if (this.#cached.size === 0) return false;
    this.#preparedPixelRatio = ratio;
    return true;
  }

  begin(devicePixelRatio = 1): void {
    if (this.#active) return;
    const startedAt = performance.now();
    this.#lastWheelBeginStartMs = startedAt;
    this.#active = true;
    const ratio = boundedPixelRatio(devicePixelRatio);
    this.#lastWheelUsedPrepared = this.#preparedPixelRatio === ratio;
    if (this.#lastWheelUsedPrepared) {
      this.#preparedPixelRatio = null;
    } else {
      if (this.#cached.size > 0) this.invalidate();
      this.#build(ratio);
    }
    this.#lastWheelBeginEndMs = performance.now();
    this.#lastWheelBeginDurationMs = this.#lastWheelBeginEndMs - startedAt;
  }

  #build(ratio: number): void {
    const startedAt = performance.now();
    this.#lastBuildPixels = 0;
    this.#lastBuildSkippedRuns = 0;
    let remainingPixels = maximumWheelCachePixels;
    for (const node of this.#nodes) {
      const bounds = node.getClientRect({ skipTransform: true });
      const x = Math.floor(bounds.x - 3);
      const y = Math.floor(bounds.y - 3);
      const width = Math.ceil(bounds.x + bounds.width + 3) - x;
      const height = Math.ceil(bounds.y + bounds.height + 3) - y;
      const pixels = Math.ceil(width * ratio) * Math.ceil(height * ratio);
      if (
        !Number.isFinite(pixels) ||
        width <= 0 ||
        height <= 0 ||
        pixels > remainingPixels
      ) {
        this.#lastBuildSkippedRuns += 1;
        continue;
      }
      node.cache({
        x,
        y,
        width,
        height,
        pixelRatio: ratio,
        hitCanvasPixelRatio: 1,
      });
      this.#cached.add(node);
      this.#buildCount += 1;
      this.#lastBuildPixels += pixels;
      remainingPixels -= pixels;
    }
    this.#lastBuildDurationMs = performance.now() - startedAt;
  }

  invalidate(): void {
    this.#preparedPixelRatio = null;
    for (const node of this.#cached) this.#release(node);
  }

  end(): void {
    this.#active = false;
    this.invalidate();
  }

  dispose(): void {
    this.end();
    this.#nodes.clear();
  }

  #release(node: WheelInkNode): void {
    if (!this.#cached.delete(node)) return;
    node.clearCache();
    node.getLayer()?.batchDraw();
  }
}
