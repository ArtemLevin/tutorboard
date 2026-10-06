export interface AnimationFrameScheduler {
  readonly cancel: (frameId: number) => void;
  readonly request: (callback: FrameRequestCallback) => number;
}

export interface AnimatedImageLayer {
  batchDraw(): unknown;
}

type AnimationVisibility = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
> & {
  readonly hidden: boolean;
};

const browserFrameScheduler: AnimationFrameScheduler = {
  cancel: (frameId) => window.cancelAnimationFrame(frameId),
  request: (callback) => window.requestAnimationFrame(callback),
};

export const interactiveAnimatedImageFps = 24;
const interactiveAnimatedImageFrameIntervalMs =
  1_000 / interactiveAnimatedImageFps;

/** Each board owns one loop; GIFs keep their original z-order and Layer. */
export class AnimatedImageRedrawCoordinator {
  readonly #registrations = new Set<() => AnimatedImageLayer | null>();
  readonly #scheduler: AnimationFrameScheduler;
  readonly #visibility: AnimationVisibility | null;
  #frameId: number | null = null;
  #epoch = 0;
  #interactionActive = false;
  #lastDrawAtMs = Number.NEGATIVE_INFINITY;

  constructor(
    scheduler: AnimationFrameScheduler = browserFrameScheduler,
    visibility: AnimationVisibility | null = typeof document === "undefined"
      ? null
      : document,
  ) {
    this.#scheduler = scheduler;
    this.#visibility = visibility;
  }

  register(layer: () => AnimatedImageLayer | null): () => void {
    // A separate token allows identical layer readers to register independently.
    const registration = () => layer();
    this.#registrations.add(registration);
    if (this.#registrations.size === 1) {
      this.#visibility?.addEventListener(
        "visibilitychange",
        this.#onVisibilityChange,
      );
    }
    this.#schedule();
    return () => {
      if (!this.#registrations.delete(registration)) return;
      if (this.#registrations.size === 0) this.#stop();
    };
  }

  dispose(): void {
    this.#registrations.clear();
    this.#interactionActive = false;
    this.#lastDrawAtMs = Number.NEGATIVE_INFINITY;
    this.#stop();
  }

  setInteractionActive(active: boolean): void {
    if (this.#interactionActive === active) return;
    this.#interactionActive = active;
    if (!active) {
      this.#lastDrawAtMs = Number.NEGATIVE_INFINITY;
    }
  }

  readonly #onVisibilityChange = () => {
    if (this.#visibility?.hidden === true) {
      this.#cancelFrame();
      return;
    }
    this.#lastDrawAtMs = Number.NEGATIVE_INFINITY;
    this.#schedule();
  };

  #cancelFrame(): void {
    this.#epoch += 1;
    if (this.#frameId !== null) this.#scheduler.cancel(this.#frameId);
    this.#frameId = null;
  }

  #stop(): void {
    this.#cancelFrame();
    this.#visibility?.removeEventListener(
      "visibilitychange",
      this.#onVisibilityChange,
    );
  }

  #schedule(): void {
    if (
      this.#frameId !== null ||
      this.#registrations.size === 0 ||
      this.#visibility?.hidden === true
    )
      return;
    const epoch = this.#epoch;
    this.#frameId = this.#scheduler.request((timestampMs) => {
      if (epoch !== this.#epoch) return;
      this.#frameId = null;
      const shouldDraw =
        !this.#interactionActive ||
        timestampMs - this.#lastDrawAtMs >=
          interactiveAnimatedImageFrameIntervalMs;
      if (shouldDraw) {
        const layers = new Set<AnimatedImageLayer>();
        for (const readLayer of this.#registrations) {
          const layer = readLayer();
          if (layer !== null) layers.add(layer);
        }
        for (const layer of layers) layer.batchDraw();
        this.#lastDrawAtMs = timestampMs;
      }
      this.#schedule();
    });
  }
}

export function startAnimatedImageRedraw(
  draw: () => void,
  scheduler: AnimationFrameScheduler = browserFrameScheduler,
): () => void {
  let active = true;
  let frameId: number | null = null;
  const redraw: FrameRequestCallback = () => {
    if (!active) return;
    draw();
    frameId = scheduler.request(redraw);
  };
  frameId = scheduler.request(redraw);
  return () => {
    active = false;
    if (frameId !== null) scheduler.cancel(frameId);
    frameId = null;
  };
}
