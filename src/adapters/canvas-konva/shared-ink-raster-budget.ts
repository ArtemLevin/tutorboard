/**
 * Shared accounting for one bounded spatial ink candidate and the existing
 * wheel-ink raster cache. Allocations are owned by leases, never by tiles or
 * frame counters. This is a CPU-canvas lower-bound model: GPU copies are an
 * additional diagnostic and may require a smaller experiment budget.
 */
export const maximumSharedInkScenePixels = 4_000_000;
export const maximumSharedInkCanvasBytes = 16 * 1024 * 1024;

export interface InkRasterRegion {
  readonly width: number;
  readonly height: number;
  readonly scenePixelRatio: number;
  readonly hitPixelRatio: number;
}

export interface InkRasterCost {
  readonly scenePixels: number;
  readonly hitPixels: number;
  readonly scratchPixels: number;
  readonly accountedBytes: number;
}

function backingPixels(width: number, height: number, ratio: number): number {
  return Math.ceil(width * ratio) * Math.ceil(height * ratio);
}

/**
 * Includes a full same-size scratch scene and hit copy, in addition to the
 * retained scene+hit buffers. No allocation is performed here.
 */
export function estimateInkRasterCost(
  region: InkRasterRegion,
): InkRasterCost | null {
  const { width, height, scenePixelRatio, hitPixelRatio } = region;
  if (
    ![width, height, scenePixelRatio, hitPixelRatio].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    scenePixelRatio < 1 ||
    scenePixelRatio > 2 ||
    hitPixelRatio !== 1
  ) {
    return null;
  }
  const scenePixels = backingPixels(width, height, scenePixelRatio);
  const hitPixels = backingPixels(width, height, hitPixelRatio);
  const scratchPixels = scenePixels + hitPixels;
  const accountedBytes = 4 * (scenePixels + hitPixels + scratchPixels);
  if (
    ![scenePixels, hitPixels, scratchPixels, accountedBytes].every(
      Number.isSafeInteger,
    )
  ) {
    return null;
  }
  return { scenePixels, hitPixels, scratchPixels, accountedBytes };
}

export type InkRasterOwner = "wheel" | "spatial";

export interface InkRasterLease {
  readonly cost: InkRasterCost;
  readonly owner: InkRasterOwner;
  release(): void;
}

export class SharedInkRasterBudget {
  readonly #leases = new Set<InkRasterLease>();
  #scenePixels = 0;
  #accountedBytes = 0;
  #peakBytes = 0;

  get scenePixels(): number {
    return this.#scenePixels;
  }

  get accountedBytes(): number {
    return this.#accountedBytes;
  }

  get peakBytes(): number {
    return this.#peakBytes;
  }

  get activeLeases(): number {
    return this.#leases.size;
  }

  get wheelLeases(): number {
    return [...this.#leases].filter((lease) => lease.owner === "wheel").length;
  }

  get spatialLeases(): number {
    return [...this.#leases].filter((lease) => lease.owner === "spatial")
      .length;
  }

  tryAcquire(
    owner: InkRasterOwner,
    region: InkRasterRegion,
  ): InkRasterLease | null {
    const cost = estimateInkRasterCost(region);
    if (
      cost === null ||
      this.#scenePixels + cost.scenePixels > maximumSharedInkScenePixels ||
      this.#accountedBytes + cost.accountedBytes >
        maximumSharedInkCanvasBytes ||
      (owner === "spatial" && this.spatialLeases >= 1)
    ) {
      return null;
    }
    let released = false;
    const lease: InkRasterLease = {
      owner,
      cost,
      release: () => {
        if (released) return;
        released = true;
        this.#leases.delete(lease);
        this.#scenePixels -= cost.scenePixels;
        this.#accountedBytes -= cost.accountedBytes;
      },
    };
    this.#leases.add(lease);
    this.#scenePixels += cost.scenePixels;
    this.#accountedBytes += cost.accountedBytes;
    this.#peakBytes = Math.max(this.#peakBytes, this.#accountedBytes);
    return lease;
  }

  /** Call only after every backing canvas has been cleared by its owner. */
  releaseAll(): void {
    for (const lease of [...this.#leases]) lease.release();
  }
}
