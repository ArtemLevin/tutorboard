export interface AnimationFrameScheduler {
  readonly cancel: (frameId: number) => void;
  readonly request: (callback: FrameRequestCallback) => number;
}

export function startAnimatedImageRedraw(
  draw: () => void,
  scheduler: AnimationFrameScheduler = {
    cancel: (frameId) => window.cancelAnimationFrame(frameId),
    request: (callback) => window.requestAnimationFrame(callback),
  },
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
