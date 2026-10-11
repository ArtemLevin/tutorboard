import {
  SharedInkRasterBudget,
  type InkRasterLease,
} from "./shared-ink-raster-budget";

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

export interface WheelInkCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const minimumWheelCacheStrokes = 80;
export const maximumWheelCachePixels = 4_000_000;

function boundedPixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio)) return 1;
  return Math.max(1, Math.min(2, devicePixelRatio));
}

export class WheelInkCacheCoordinator {
  readonly #nodes = new Set<WheelInkNode>();
  readonly #cached = new Set<WheelInkNode>();
  readonly #budgetLeases = new Map<WheelInkNode, InkRasterLease>();
  readonly #expectedCrops = new Map<WheelInkNode, WheelInkCrop>();
  #active = false;
  #preparedPixelRatio: number | null = null;
  #buildCount = 0;
  #lastBuildDurationMs = 0;
  #lastBuildPixels = 0;
  #lastBuildSkippedRuns = 0;
  #lastBuildFailedRuns = 0;
  #lastWheelBeginDurationMs = 0;
  #lastWheelBeginStartMs = 0;
  #lastWheelBeginEndMs = 0;
  #lastWheelUsedPrepared = false;
  #lastWheelSkippedColdBuild = false;

  constructor(private readonly sharedBudget?: SharedInkRasterBudget) {}

  get cachedCount(): number {
    return this.#cached.size;
  }

  /** Cached runs attached to an active gesture; idle-prepared runs are separate. */
  get activeCachedCount(): number {
    return this.#active ? this.#cached.size : 0;
  }

  get buildCount(): number {
    return this.#buildCount;
  }

  get canPrepare(): boolean {
    if (this.#nodes.size === 0 || this.#active) return false;
    return this.#preparedPixelRatio === null;
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

  get lastBuildFailedRuns(): number {
    return this.#lastBuildFailedRuns;
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

  get lastWheelSkippedColdBuild(): boolean {
    return this.#lastWheelSkippedColdBuild;
  }

  register(node: WheelInkNode, expectedCrop?: WheelInkCrop): () => void {
    // A mounted run changes the set of cacheable objects: cached images from
    // an earlier board snapshot must never be reused after this registration.
    if (this.isPrepared) this.invalidate();
    this.#nodes.add(node);
    if (expectedCrop !== undefined) this.#expectedCrops.set(node, expectedCrop);
    return () => {
      this.#release(node);
      this.#nodes.delete(node);
      this.#expectedCrops.delete(node);
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

  begin(
    devicePixelRatio = 1,
    { buildIfUnprepared = true }: { readonly buildIfUnprepared?: boolean } = {},
  ): void {
    if (this.#active) return;
    const startedAt = performance.now();
    this.#lastWheelBeginStartMs = startedAt;
    this.#active = true;
    const ratio = boundedPixelRatio(devicePixelRatio);
    this.#lastWheelUsedPrepared = this.#preparedPixelRatio === ratio;
    this.#lastWheelSkippedColdBuild =
      !this.#lastWheelUsedPrepared && !buildIfUnprepared;
    if (this.#lastWheelUsedPrepared) {
      this.#preparedPixelRatio = null;
    } else {
      if (this.#cached.size > 0) this.invalidate();
      if (buildIfUnprepared) this.#build(ratio);
    }
    this.#lastWheelBeginEndMs = performance.now();
    this.#lastWheelBeginDurationMs = this.#lastWheelBeginEndMs - startedAt;
  }

  #build(ratio: number): void {
    const startedAt = performance.now();
    this.#lastBuildPixels = 0;
    this.#lastBuildSkippedRuns = 0;
    this.#lastBuildFailedRuns = 0;
    let remainingPixels = maximumWheelCachePixels;
    for (const node of this.#nodes) {
      let bounds: ReturnType<WheelInkNode["getClientRect"]>;
      try {
        bounds = node.getClientRect({ skipTransform: true });
      } catch (error) {
        // An experimental Konva node may have been detached or invalidated.
        // Only the opt-in guarded path treats this as a skipped vector run.
        if (this.sharedBudget === undefined) throw error;
        this.#lastBuildFailedRuns += 1;
        this.#lastBuildSkippedRuns += 1;
        continue;
      }
      const x = Math.floor(bounds.x - 3);
      const y = Math.floor(bounds.y - 3);
      const width = Math.ceil(bounds.x + bounds.width + 3) - x;
      const height = Math.ceil(bounds.y + bounds.height + 3) - y;
      const pixels = Math.ceil(width * ratio) * Math.ceil(height * ratio);
      const expected = this.#expectedCrops.get(node);
      // The S5.2 bounds estimate must cover the actual mounted Konva
      // descendants including their live transforms and hit geometry.
      // On disagreement, keep the original vector group unchanged.
      if (
        expected !== undefined &&
        (x < expected.x ||
          y < expected.y ||
          x + width > expected.x + expected.width ||
          y + height > expected.y + expected.height)
      ) {
        this.#lastBuildSkippedRuns += 1;
        continue;
      }
      if (
        !Number.isFinite(pixels) ||
        width <= 0 ||
        height <= 0 ||
        pixels > remainingPixels
      ) {
        this.#lastBuildSkippedRuns += 1;
        continue;
      }
      const lease =
        this.sharedBudget?.tryAcquire("wheel", {
          width,
          height,
          scenePixelRatio: ratio,
          hitPixelRatio: 1,
        }) ?? (this.sharedBudget === undefined ? undefined : null);
      if (lease === null) {
        this.#lastBuildSkippedRuns += 1;
        continue;
      }
      try {
        node.cache({
          x,
          y,
          width,
          height,
          pixelRatio: ratio,
          hitCanvasPixelRatio: 1,
        });
      } catch (error) {
        // Opt-in A2 must restore the original vector Group after a failed
        // partial cache allocation. Preserve legacy exception behavior when
        // the shared budget has not been enabled.
        try {
          node.clearCache();
        } finally {
          lease?.release();
        }
        if (this.sharedBudget === undefined) throw error;
        this.#lastBuildFailedRuns += 1;
        this.#lastBuildSkippedRuns += 1;
        node.getLayer()?.batchDraw();
        continue;
      }
      if (lease !== undefined) this.#budgetLeases.set(node, lease);
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
    this.#expectedCrops.clear();
  }

  #release(node: WheelInkNode): void {
    if (!this.#cached.delete(node)) return;
    try {
      node.clearCache();
    } finally {
      this.#budgetLeases.get(node)?.release();
      this.#budgetLeases.delete(node);
      node.getLayer()?.batchDraw();
    }
  }
}
