import type { Page } from "@playwright/test";

export interface C39FrameGap {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface C39JsEvent {
  readonly kind: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly detail?: string;
}

export interface C39ChromiumEvent {
  readonly name: string;
  readonly category: string;
  readonly startTraceUs: number;
  readonly durationMs: number;
  readonly processId: number;
  readonly threadId: number;
}

export interface C39ClockAnchor {
  readonly name: string;
  readonly browserMs: number;
  readonly traceUs: number;
}

export interface C39ChromiumTrace {
  readonly events: readonly C39ChromiumEvent[];
  readonly anchors: readonly C39ClockAnchor[];
  readonly droppedEvents: number;
}

export interface C39SlowFrame {
  readonly startMs: number;
  readonly endMs: number;
  readonly gapMs: number;
  readonly lastWheelInputMs: number | null;
  readonly jsEvents: readonly C39JsEvent[];
  readonly chromiumEvents: readonly (C39ChromiumEvent & {
    readonly browserStartMs: number;
  })[];
  readonly traceAlignment: "aligned" | "unavailable";
  readonly compositorEvidence: "present" | "absent" | "unavailable";
  readonly classification:
    "coincident-js" | "coincident-browser" | "unattributed";
}

/**
 * Browser time is the frame recorder's performance.now() clock.
 * Chromium tracing ts/dur fields are in microseconds from a separate clock.
 * A real performance.mark/console.timeStamp trace marker is REQUIRED to
 * establish an offset. Missing markers never imply zero compositor work.
 */
export function correlateC39SlowFrames(
  gaps: readonly C39FrameGap[],
  wheelTimes: readonly number[],
  jsEvents: readonly C39JsEvent[],
  chromium: C39ChromiumTrace | null,
  limit = 5,
): {
  readonly frames: readonly C39SlowFrame[];
  readonly traceAlignment: "aligned" | "unavailable";
  readonly clockDriftMs: number | null;
  readonly chromiumEventsDropped: number;
} {
  const start = chromium?.anchors.find(
    (anchor) => anchor.name === "C39_TRACE_SYNC_START",
  );
  const end = chromium?.anchors.find(
    (anchor) => anchor.name === "C39_TRACE_SYNC_END",
  );
  const startOffset =
    start === undefined ? null : start.browserMs - start.traceUs / 1_000;
  const endOffset =
    end === undefined ? null : end.browserMs - end.traceUs / 1_000;
  const drift =
    startOffset === null || endOffset === null ? null : endOffset - startOffset;
  const aligned =
    startOffset !== null && (drift === null || Math.abs(drift) <= 10);
  const overlaps = (begin: number, duration: number, gap: C39FrameGap) => {
    const stop = begin + Math.max(0, duration);
    return begin <= gap.endMs && stop >= gap.startMs;
  };
  const frames = [...gaps]
    .filter((gap) => gap.durationMs > 50)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
    .map((gap) => {
      const matchingJs = jsEvents
        .filter((item) => overlaps(item.startMs, item.durationMs, gap))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 40);
      const matchingChromium = aligned
        ? (chromium?.events ?? [])
            .map((item) => ({
              ...item,
              browserStartMs: item.startTraceUs / 1_000 + startOffset,
            }))
            .filter((item) =>
              overlaps(item.browserStartMs, item.durationMs, gap),
            )
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 30)
        : [];
      const wheel =
        wheelTimes.filter((time) => time <= gap.endMs).at(-1) ?? null;
      const jsDuration = Math.max(
        0,
        ...matchingJs
          .filter(
            (item) =>
              item.kind !== "wheel-input" && item.kind !== "wheel-layout",
          )
          .map((item) => item.durationMs),
      );
      const browserDuration = Math.max(
        0,
        ...matchingChromium.map((item) => item.durationMs),
      );
      return {
        startMs: gap.startMs,
        endMs: gap.endMs,
        gapMs: gap.durationMs,
        lastWheelInputMs: wheel,
        jsEvents: matchingJs,
        chromiumEvents: matchingChromium,
        traceAlignment: aligned
          ? ("aligned" as const)
          : ("unavailable" as const),
        compositorEvidence: !aligned
          ? ("unavailable" as const)
          : matchingChromium.length > 0
            ? ("present" as const)
            : ("absent" as const),
        classification:
          jsDuration >= 16
            ? ("coincident-js" as const)
            : browserDuration >= 16
              ? ("coincident-browser" as const)
              : ("unattributed" as const),
      };
    });
  return {
    frames,
    traceAlignment: aligned ? "aligned" : "unavailable",
    clockDriftMs: drift,
    chromiumEventsDropped: chromium?.droppedEvents ?? 0,
  };
}

const selectedEvent =
  /(?:raster|composit|drawframe|paint|layertree|activate|commit|tile|swapbuffers|scheduler)/iu;
const maximumC39ChromiumEvents = 20_000;

function parseTraceEvent(value: unknown): {
  readonly name: string;
  readonly category: string;
  readonly phase: string;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly pid: number;
  readonly tid: number;
  readonly args: unknown;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || typeof v.ts !== "number") return null;
  return {
    name: v.name,
    category: typeof v.cat === "string" ? v.cat : "",
    phase: typeof v.ph === "string" ? v.ph : "",
    timestampUs: v.ts,
    durationUs: typeof v.dur === "number" ? v.dur : 0,
    pid: typeof v.pid === "number" ? v.pid : -1,
    tid: typeof v.tid === "number" ? v.tid : -1,
    args: v.args,
  };
}

function containsMarker(args: unknown, marker: string): boolean {
  if (typeof args !== "object" || args === null) return false;
  // Marker names are fixed constants. No arbitrary student/board data is
  // exported: only the whitelisted trace names and numeric timing fields.
  return JSON.stringify(args).includes(marker);
}

export async function startC39ChromiumTrace(page: Page) {
  const session = await page.context().newCDPSession(page);
  const events: C39ChromiumEvent[] = [];
  const observedMarkers = new Map<string, number>();
  let droppedEvents = 0;
  const completed = new Promise<void>((resolve) => {
    session.once("Tracing.tracingComplete", () => resolve());
  });
  session.on("Tracing.dataCollected", (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("value" in payload) ||
      !Array.isArray(payload.value)
    )
      return;
    for (const raw of payload.value) {
      const item = parseTraceEvent(raw);
      if (item === null) continue;
      for (const name of ["C39_TRACE_SYNC_START", "C39_TRACE_SYNC_END"]) {
        if (item.name === name || containsMarker(item.args, name)) {
          observedMarkers.set(name, item.timestampUs);
        }
      }
      if (item.phase !== "X" || !selectedEvent.test(item.name)) continue;
      if (events.length >= maximumC39ChromiumEvents) {
        droppedEvents += 1;
        continue;
      }
      events.push({
        name: item.name,
        category: item.category,
        startTraceUs: item.timestampUs,
        durationMs: item.durationUs / 1_000,
        processId: item.pid,
        threadId: item.tid,
      });
    }
  });
  await session.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,cc,viz,gpu,renderer.scheduler",
    transferMode: "ReportEvents",
  });

  const clockAnchors: { name: string; browserMs: number }[] = [];
  const mark = async (name: string) => {
    const browserMs = await page.evaluate((label) => {
      const now = performance.now();
      performance.mark(label);
      console.timeStamp(label);
      return now;
    }, name);
    clockAnchors.push({ name, browserMs });
  };
  await mark("C39_TRACE_SYNC_START");
  let stopped = false;
  return async (): Promise<C39ChromiumTrace> => {
    if (stopped) throw new Error("C3.9 Chromium trace stopped twice");
    stopped = true;
    try {
      await mark("C39_TRACE_SYNC_END");
      await session.send("Tracing.end");
      await completed;
      return {
        events,
        anchors: clockAnchors.flatMap((anchor) => {
          const ts = observedMarkers.get(anchor.name);
          return ts === undefined ? [] : [{ ...anchor, traceUs: ts }];
        }),
        droppedEvents,
      };
    } finally {
      await session.detach();
    }
  };
}

/**
 * Preserve historical active p95. Mixed rendering/persist intervals remain
 * in the original distribution and are separately identified.
 */
export function partitionC39PersistFrames(
  gaps: readonly C39FrameGap[],
  wheelTimes: readonly number[],
  jsEvents: readonly C39JsEvent[],
): {
  readonly activeWithoutPersist: readonly C39FrameGap[];
  readonly activeWithPersist: readonly C39FrameGap[];
  readonly intermediatePersistCount: number;
  readonly finalPersistCount: number;
} {
  const firstWheel = wheelTimes[0];
  const lastWheel = wheelTimes.at(-1);
  if (firstWheel === undefined || lastWheel === undefined) {
    return {
      activeWithoutPersist: [],
      activeWithPersist: [],
      intermediatePersistCount: 0,
      finalPersistCount: 0,
    };
  }
  const persists = jsEvents.filter(
    (event) => event.kind === "wheel-viewport-persist",
  );
  const active = gaps.filter(
    (gap) => gap.endMs >= firstWheel && gap.endMs <= lastWheel,
  );
  const withPersist = (gap: C39FrameGap) =>
    persists.some(
      (event) =>
        event.startMs <= gap.endMs &&
        event.startMs + event.durationMs >= gap.startMs,
    );
  return {
    activeWithoutPersist: active.filter((gap) => !withPersist(gap)),
    activeWithPersist: active.filter(withPersist),
    intermediatePersistCount: persists.filter(
      (event) => event.startMs < lastWheel,
    ).length,
    finalPersistCount: persists.filter(
      (event) => event.startMs >= lastWheel,
    ).length,
  };
}
