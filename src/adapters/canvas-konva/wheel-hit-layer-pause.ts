/**
 * During a wheel gesture, Konva recomputes the full hit canvas of every
 * committed Layer even though no picking is requested. Temporarily suspend
 * only the committed-content hit layers. The Stage keeps receiving wheel
 * input. Every pointer input restores the exact hit map synchronously,
 * before Konva resolves the event's target.
 *
 * No cached hit pixels, approximation, or altered scene draw is involved.
 */
export interface WheelHitLayer {
  name(): string;
  listening(): boolean;
  listening(value: boolean): unknown;
  drawHit(): unknown;
}

const committedContentNames = new Set([
  "static-content-layer",
  "animated-content-layer",
]);

export class WheelHitLayerPause {
  readonly #previous = new Map<WheelHitLayer, boolean>();
  #active = false;
  #restores = 0;

  get active(): boolean {
    return this.#active;
  }

  get suspendedCount(): number {
    return this.#previous.size;
  }

  get restoreCount(): number {
    return this.#restores;
  }

  begin(layers: readonly WheelHitLayer[]): void {
    this.#active = true;
    this.sync(layers);
  }

  sync(layers: readonly WheelHitLayer[]): void {
    if (!this.#active) return;
    const mounted = new Set(layers);
    for (const [layer, wasListening] of this.#previous) {
      if (mounted.has(layer)) continue;
      // A content Layer can be replaced when the viewport crosses a
      // virtualization boundary. Release ownership of detached nodes.
      if (wasListening) layer.listening(true);
      this.#previous.delete(layer);
    }
    for (const layer of layers) {
      if (!committedContentNames.has(layer.name())) continue;
      if (this.#previous.has(layer)) continue;
      const wasListening = layer.listening();
      this.#previous.set(layer, wasListening);
      if (wasListening) layer.listening(false);
    }
  }

  /**
   * Called before a pointer event reaches Konva's native event dispatcher,
   * and on every wheel end/cancel/unmount/authoritative viewport change.
   * Reconstruct the precise current hit canvas exactly once.
   */
  restore(): void {
    if (!this.#active) return;
    this.#active = false;
    for (const [layer, wasListening] of this.#previous) {
      if (wasListening) {
        layer.listening(true);
        layer.drawHit();
      }
    }
    this.#previous.clear();
    this.#restores += 1;
  }

  dispose(): void {
    this.restore();
  }
}
