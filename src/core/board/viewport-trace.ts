/**
 * C3.9-S6 opt-in, main-thread viewport attribution. The profiler injects
 * the sink before loading the app. Production has no collection or timers.
 * These durations cover synchronous JS only, not worker execution or GPU.
 */
export type C39ViewportTraceKind =
  | "viewport-reduce.prevalidate"
  | "viewport-reduce.dispatch"
  | "viewport-history"
  | "viewport-command-callback"
  | "viewport-scene-select"
  | "viewport-local-autosave.schedule"
  | "viewport-local-worker.postMessage"
  | "viewport-sync.queue";

export interface C39ViewportTraceEvent {
  readonly kind: C39ViewportTraceKind;
  readonly startMs: number;
  readonly durationMs: number;
  readonly detail?: string;
}

declare global {
  interface Window {
    __tutorBoardC39ViewportTrace?: {
      events: C39ViewportTraceEvent[];
    };
  }
}

const maximumEvents = 12_000;

export function startC39ViewportTrace(): number | null {
  return typeof window !== "undefined" &&
    window.__tutorBoardC39ViewportTrace !== undefined
    ? performance.now()
    : null;
}

export function finishC39ViewportTrace(
  kind: C39ViewportTraceKind,
  startMs: number | null,
  detail?: string,
): void {
  if (startMs === null || typeof window === "undefined") return;
  const sink = window.__tutorBoardC39ViewportTrace;
  if (sink === undefined || sink.events.length >= maximumEvents) return;
  sink.events.push({
    kind,
    startMs,
    durationMs: Math.max(0, performance.now() - startMs),
    ...(detail === undefined ? {} : { detail }),
  });
}
