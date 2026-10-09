/**
 * Transient, bounded rasterization of uninterrupted immutable pen-stroke runs
 * during wheel zoom. Group hit canvases are cached alongside scene canvases,
 * keeping Konva's child hit-testing and Transformer targets intact.
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

export class WheelInkCacheCoordinator {
  readonly #nodes = new Set<WheelInkNode>();
  readonly #cached = new Set<WheelInkNode>();
  #active = false;
  #buildCount = 0;

  get cachedCount(): number {
    return this.#cached.size;
  }

  get buildCount(): number {
    return this.#buildCount;
  }

  register(node: WheelInkNode): () => void {
    this.#nodes.add(node);
    return () => {
      this.#release(node);
      this.#nodes.delete(node);
    };
  }

  begin(devicePixelRatio = 1): void {
    if (this.#active) return;
    this.#active = true;
    const ratio = Math.max(1, Math.min(2, devicePixelRatio));
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
      remainingPixels -= pixels;
    }
  }

  invalidate(): void {
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
