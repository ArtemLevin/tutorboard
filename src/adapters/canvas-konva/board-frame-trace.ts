/**
 * Opt-in large-board frame attribution. The browser profile injects a
 * recorder before the application loads. Production sessions pay only one
 * optional property lookup; events remain bounded by the test harness.
 *
 * Canvas drawScene JS duration excludes compositor/GPU work.
 * React render->layout duration also includes synchronous React-Konva commit.
 */
export interface BoardFrameTraceEvent {
  readonly kind:
    | "board-commit"
    | "react-ink-run"
    | "react-other-run"
    | "konva-scene"
    | "konva-hit"
    | "gif-invalidate";
  readonly startMs: number;
  readonly durationMs: number;
  readonly detail?: string;
}

declare global {
  interface Window {
    __tutorBoardC37Trace?: {
      events: BoardFrameTraceEvent[];
    };
  }
}

export function recordBoardFrameTrace(
  kind: BoardFrameTraceEvent["kind"],
  startMs: number,
  durationMs: number,
  detail?: string,
): void {
  const sink =
    typeof window === "undefined" ? undefined : window.__tutorBoardC37Trace;
  if (sink === undefined || sink.events.length >= 12_000) return;
  sink.events.push({
    kind,
    startMs,
    durationMs,
    ...(detail === undefined ? {} : { detail }),
  });
}
