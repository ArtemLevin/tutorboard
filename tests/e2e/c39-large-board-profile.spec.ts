import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";
import {
  correlateC39SlowFrames,
  startC39ChromiumTrace,
} from "./c39-frame-attribution.js";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  readonly PNG: {
    new (size: { readonly height: number; readonly width: number }): {
      readonly data: Buffer;
      readonly height: number;
      readonly width: number;
    };
    readonly sync: {
      readonly write: (png: {
        readonly data: Buffer;
        readonly height: number;
        readonly width: number;
      }) => Buffer;
    };
  };
};

interface FrameWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}
interface BrowserCapture {
  stop(): {
    readonly timestamps: readonly number[];
    readonly wheelTimes: readonly number[];
  };
}
type CapturingWindow = Window & { __c39Capture?: BrowserCapture };

interface C39Scenario {
  readonly name: string;
  readonly strokes: number;
  readonly visibleStrokes: number;
  readonly gifs: number;
  readonly dpr: number;
  readonly zOrder: "trailing" | "split" | "alternating";
  readonly cold: boolean;
  readonly quick: boolean;
  /** Dedicated C3.9-E2 factor-isolation scenario. */
  readonly e2?: boolean;
  readonly traceDisabled?: boolean;
  readonly expectedLayers?: number;
  readonly expectedAnimatedLayers?: number;
  /** User-priority scenario: large pen documents plus 10 static PNG/JPEG images. */
  readonly staticHeavy?: boolean;
}

// Small fast subset is automatically covered by the normal CI media profile.
// Explicit "npm run e2e:c39-profile" exercises the extended matrix as well.
const scenarios: readonly C39Scenario[] = [
  {
    name: "300-static",
    strokes: 300,
    visibleStrokes: 300,
    gifs: 0,
    dpr: 1,
    zOrder: "trailing",
    cold: false,
    quick: true,
  },
  {
    name: "1000-multiframe",
    strokes: 1000,
    visibleStrokes: 450,
    gifs: 4,
    dpr: 1,
    zOrder: "split",
    cold: false,
    quick: true,
  },
  {
    name: "3000-cold-mixed",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "alternating",
    cold: true,
    quick: true,
  },
  {
    name: "600-static",
    strokes: 600,
    visibleStrokes: 600,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: false,
    quick: false,
  },
  {
    name: "3000-warm-dense",
    strokes: 3000,
    visibleStrokes: 2400,
    gifs: 4,
    dpr: 1,
    zOrder: "split",
    cold: false,
    quick: false,
  },
  {
    name: "3000-offscreen",
    strokes: 3000,
    visibleStrokes: 150,
    gifs: 4,
    dpr: 2,
    zOrder: "trailing",
    cold: false,
    quick: false,
  },
  {
    name: "5000-heavy-mixed",
    strokes: 5000,
    visibleStrokes: 2500,
    gifs: 4,
    dpr: 2,
    zOrder: "alternating",
    cold: true,
    quick: false,
  },
];

// Opt in explicitly: the existing 7-scene baseline and its CI budget stay intact.
// The first three animated configurations have identical document objects,
// media bytes and viewports; only document order / layer composition changes.
const e2Scenarios: readonly C39Scenario[] = [
  {
    name: "e2-dpr2-png-only",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "e2-dpr2-two-runs",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 2,
    expectedAnimatedLayers: 1,
  },
  {
    name: "e2-dpr2-five-runs",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "split",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 5,
    expectedAnimatedLayers: 2,
  },
  {
    name: "e2-dpr2-fallback",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "alternating",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "e2-dpr2-fallback-untraced",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "alternating",
    cold: true,
    quick: false,
    e2: true,
    traceDisabled: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "e2-dpr2-fallback-warm",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 2,
    zOrder: "alternating",
    cold: false,
    quick: false,
    e2: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "e2-dpr1-two-runs",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 1,
    zOrder: "trailing",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 2,
    expectedAnimatedLayers: 1,
  },
  {
    name: "e2-dpr1-fallback",
    strokes: 3000,
    visibleStrokes: 800,
    gifs: 4,
    dpr: 1,
    zOrder: "alternating",
    cold: true,
    quick: false,
    e2: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
];

// Opt-in static-media board workload. Preserve existing GIF release scenarios.
// Four PNG plus six genuine JPEG files (three .jpg and three .jpeg).
const staticHeavyScenarios: readonly C39Scenario[] = [
  {
    name: "static-3000-10-images",
    strokes: 3000,
    visibleStrokes: 2400,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    staticHeavy: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "static-5000-10-images",
    strokes: 5000,
    visibleStrokes: 4000,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    staticHeavy: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "static-10000-10-images",
    strokes: 10000,
    visibleStrokes: 8000,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    staticHeavy: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
  {
    name: "static-10000-offscreen",
    strokes: 10000,
    visibleStrokes: 1000,
    gifs: 0,
    dpr: 2,
    zOrder: "trailing",
    cold: true,
    quick: false,
    staticHeavy: true,
    expectedLayers: 1,
    expectedAnimatedLayers: 0,
  },
];

let cachedPngs: readonly string[] | null = null;
function representativePngs(): readonly string[] {
  if (cachedPngs !== null) return cachedPngs;
  cachedPngs = Array.from({ length: 6 }, (_value, imageIndex) => {
    const png = new PNG({ height: 1536, width: 1536 });
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const offset = (y * png.width + x) * 4;
        png.data[offset] = (x * (imageIndex + 2) + (y >> 3)) % 256;
        png.data[offset + 1] = (y * 3 + imageIndex * 37) % 256;
        png.data[offset + 2] = ((x >> 2) + (y >> 2) + imageIndex * 41) % 256;
        png.data[offset + 3] = 255;
      }
    }
    return "data:image/png;base64," + PNG.sync.write(png).toString("base64");
  });
  return cachedPngs;
}

async function representativeJpegs(page: Page): Promise<readonly string[]> {
  // Browser Canvas writes real JPEG bytes at 1536x1536. All encodes happen
  // before the board import or frame recording and are never used as a mock.
  return page.evaluate(
    async (pngUrls) => {
      const jpegUrls: string[] = [];
      for (const pngUrl of pngUrls) {
        const image = new Image();
        image.src = pngUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("JPEG test canvas unavailable");
        context.drawImage(image, 0, 0);
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.85);
        if (!jpegUrl.startsWith("data:image/jpeg;base64,/9j/")) {
          throw new Error("Expected a genuine encoded JPEG data URL");
        }
        jpegUrls.push(jpegUrl);
        canvas.width = 0;
        canvas.height = 0;
        image.src = "";
      }
      return jpegUrls;
    },
    [...representativePngs()],
  );
}

async function actualGifDataUrl(): Promise<string> {
  const file = await readFile(
    new URL("../fixtures/media/c39-animated-64x64.gif", import.meta.url),
  );
  expect(file.subarray(0, 6).toString("ascii")).toBe("GIF89a");
  expect(file.readUInt16LE(6)).toBe(64);
  expect(file.readUInt16LE(8)).toBe(64);
  // Four authentic image frames with varying 90–130 ms delays.
  let graphicControlBlocks = 0;
  for (let offset = 0; offset < file.length - 2; offset += 1) {
    if (
      file[offset] === 0x21 &&
      file[offset + 1] === 0xf9 &&
      file[offset + 2] === 0x04
    ) {
      graphicControlBlocks += 1;
    }
  }
  expect(graphicControlBlocks).toBe(4);
  return "data:image/gif;base64," + file.toString("base64");
}

async function importDocument(
  page: Page,
  document: { readonly order: readonly string[] },
  timeoutMs = 5_000,
) {
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "c39-representative-board.tutorboard.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp("^" + document.order.length + " объект", "u"),
    { timeout: timeoutMs },
  );
}

/** Seed a genuine persisted local revision for documents exceeding the public
 * 10 MiB JSON-import boundary. Subsequent load uses the production Dexie
 * repository and full document validation. Only Playwright fixture code writes
 * the initial IndexedDB records; this does not alter shipping import limits.
 */
async function restoreLargeBoardFromLocalStore(
  page: Page,
  document: ReturnType<typeof createDenseBoardDocument>,
): Promise<void> {
  const localDocument = { ...document, id: "document:local-board" };
  await page.evaluate(async (input) => {
    const opened = indexedDB.open("tutorboard-local-v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    try {
      if (
        !db.objectStoreNames.contains("documents") ||
        !db.objectStoreNames.contains("revisions")
      ) {
        throw new Error("Production local-document stores are missing");
      }
      const transaction = db.transaction(
        ["documents", "revisions"],
        "readwrite",
      );
      const finished = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const operationId = "operation:c39-static-heavy-seed";
      const revisionId = "revision:" + operationId;
      const savedAt = "2026-10-10T13:00:00.000Z";
      transaction.objectStore("revisions").put({
        documentId: input.id,
        documentSchemaVersion: input.schemaVersion,
        operationId,
        revisionId,
        savedAt,
        sequence: 1,
        serializedDocument: JSON.stringify(input),
      });
      transaction.objectStore("documents").put({
        currentRevisionId: revisionId,
        documentId: input.id,
        lastGoodRevisionId: revisionId,
        nextSequence: 2,
        updatedAt: savedAt,
      });
      await finished;
    } finally {
      db.close();
    }
  }, localDocument);
  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp("^" + document.order.length + " объект", "u"),
    { timeout: 45_000 },
  );
}

async function settleFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(async (total) => {
    for (let index = 0; index < total; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  }, count);
}

async function beginFrameCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const timestamps: number[] = [];
    const wheelTimes: number[] = [];
    let active = true;
    const onWheel = () => {
      if (wheelTimes.length < 100) wheelTimes.push(performance.now());
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    let frameId = 0;
    const onFrame = (timestampMs: number) => {
      if (!active) return;
      if (timestamps.length < 300) timestamps.push(timestampMs);
      frameId = requestAnimationFrame(onFrame);
    };
    frameId = requestAnimationFrame(onFrame);
    (window as CapturingWindow).__c39Capture = {
      stop() {
        active = false;
        cancelAnimationFrame(frameId);
        window.removeEventListener("wheel", onWheel, true);
        return { timestamps, wheelTimes };
      },
    };
  });
}

function summarize(frames: readonly FrameWindow[]) {
  const durations = frames
    .map((frame) => frame.durationMs)
    .sort((a, b) => a - b);
  const percentile = (ratio: number) =>
    durations[Math.max(0, Math.ceil(durations.length * ratio) - 1)] ?? null;
  return {
    count: durations.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: durations.at(-1) ?? null,
    over25: durations.filter((ms) => ms > 25).length,
    over50: durations.filter((ms) => ms > 50).length,
    over100: durations.filter((ms) => ms > 100).length,
  };
}

function summarizePhases(
  timestamps: readonly number[],
  wheelTimes: readonly number[],
  commitObservedAtMs: number,
) {
  if (wheelTimes.length !== 18) {
    throw new Error(
      "Expected exactly 18 observed wheel inputs; got " + wheelTimes.length,
    );
  }
  const frames = timestamps.slice(1).map((endMs, index) => ({
    startMs: timestamps[index]!,
    endMs,
    durationMs: endMs - timestamps[index]!,
  }));
  const firstWheel = wheelTimes[0]!;
  const lastWheel = wheelTimes[wheelTimes.length - 1]!;
  // The first/last input timestamps bound the active input phase. The commit
  // window is from final wheel input through observation of wheel-pause exit.
  // Observation can trail the actual React commit; C3.9-B will trace it exactly.
  return {
    inputTimesMs: wheelTimes,
    commitObservedAtMs,
    phases: {
      active: summarize(
        frames.filter((f) => f.endMs >= firstWheel && f.endMs <= lastWheel),
      ),
      commit: summarize(
        frames.filter(
          (f) => f.endMs > lastWheel && f.endMs <= commitObservedAtMs,
        ),
      ),
      settling: summarize(frames.filter((f) => f.endMs > commitObservedAtMs)),
    },
    gaps: frames,
  };
}

for (const scenario of [
  ...scenarios,
  ...(process.env.C39_E2_PROFILE === "1" ? e2Scenarios : []),
  ...(process.env.C39_STATIC_HEAVY_PROFILE === "1" ? staticHeavyScenarios : []),
]) {
  test(
    (scenario.name === "3000-cold-mixed" ? "@smoke " : "") +
      (scenario.staticHeavy
        ? "@c39-static-heavy "
        : scenario.e2
          ? "@c39-e2 "
          : scenario.quick
            ? "@media-profile @c39-quick "
            : "@c39-extended ") +
      "representative zoom baseline: " +
      scenario.name,
    async ({ browser }, testInfo) => {
      test.setTimeout(scenario.staticHeavy ? 360_000 : 180_000);
      const context = await browser.newContext({
        deviceScaleFactor: scenario.dpr,
        viewport: { width: 1240, height: 820 },
      });
      try {
        const page = await context.newPage();
        // Trace-off is the same physical scene without JS event collection.
        // Each test gets an isolated browser context; production never opts in.
        const traceEnabled =
          scenario.strokes >= 3000 && !scenario.traceDisabled;
        if (traceEnabled || !scenario.e2) {
          await page.addInitScript(() => {
            window.__tutorBoardC37Trace = { events: [] };
          });
        }
        if (scenario.cold) {
          await page.addInitScript(() => {
            window.requestIdleCallback = () => 0;
            window.cancelIdleCallback = () => {};
          });
        }
        await page.goto("/");
        await expect(page.getByTestId("board-stage")).toBeVisible();
        const dataUrl =
          scenario.gifs > 0 ? await actualGifDataUrl() : undefined;
        const staticCount = scenario.staticHeavy
          ? 10
          : scenario.e2
            ? 10 - scenario.gifs
            : 6;
        const pngUrls = representativePngs();
        const staticUrls = scenario.staticHeavy
          ? [...pngUrls.slice(0, 4), ...(await representativeJpegs(page))]
          : Array.from(
              { length: staticCount },
              (_unused, index) => pngUrls[index % pngUrls.length]!,
            );
        const staticFormats = scenario.staticHeavy
          ? ([
              "png",
              "png",
              "png",
              "png",
              "jpg",
              "jpeg",
              "jpg",
              "jpeg",
              "jpg",
              "jpeg",
            ] as const)
          : undefined;
        const board = createDenseBoardDocument({
          strokeCount: scenario.strokes,
          visibleStrokeCount: scenario.visibleStrokes,
          staticCount,
          gifCount: scenario.gifs,
          strokeGeometry: "varied",
          zOrderPattern: scenario.zOrder,
          splitAtVisibleBoundary:
            scenario.e2 === true && scenario.zOrder === "split",
          largeStaticDataUrls: staticUrls,
          ...(staticFormats === undefined
            ? {}
            : { staticImageFormats: staticFormats }),
          ...(dataUrl === undefined
            ? {}
            : {
                animatedGifDataUrl: dataUrl,
                animatedGifSize: { width: 64, height: 64 },
              }),
        });
        const importStart = performance.now();
        if (scenario.staticHeavy) {
          await restoreLargeBoardFromLocalStore(page, board);
        } else {
          await importDocument(page, board);
        }
        const importDurationMs = performance.now() - importStart;
        const stage = page.getByTestId("board-stage");
        await settleFrames(page, 24);
        const before = {
          layers: Number(
            await stage.getAttribute("data-committed-layer-count"),
          ),
          animatedLayers: Number(
            await stage.getAttribute("data-animated-layer-count"),
          ),
          prepared:
            (await stage.getAttribute("data-wheel-cache-prepared")) === "true",
        };
        if (scenario.expectedLayers !== undefined) {
          expect(before.layers, "E2 composition changed unexpectedly").toBe(
            scenario.expectedLayers,
          );
          expect(before.animatedLayers).toBe(scenario.expectedAnimatedLayers);
        }
        if (scenario.staticHeavy) {
          expect(scenario.gifs).toBe(0);
          const imageObjects = Object.values(board.objects).filter(
            (object) => object.kind === "image.embedded",
          );
          expect(imageObjects).toHaveLength(10);
          expect(
            imageObjects.filter((object) => object.mimeType === "image/png"),
          ).toHaveLength(4);
          expect(
            imageObjects.filter((object) => object.mimeType === "image/jpeg"),
          ).toHaveLength(6);
          expect(
            imageObjects.every((object) =>
              object.dataUrl.startsWith(`data:${object.mimeType};base64,`),
            ),
          ).toBe(true);
        }
        const bounds = await stage.boundingBox();
        if (bounds === null)
          throw new Error("Missing board stage bounding box");
        await page.mouse.move(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        // The full post-merge E2E gate also runs this benchmark in Firefox.
        // Preserve JS rAF/wheel attribution there, without attempting CDP.
        const chromiumTraceEnabled =
          traceEnabled && browser.browserType().name() === "chromium";
        const stopChromiumTrace = chromiumTraceEnabled
          ? await startC39ChromiumTrace(page)
          : null;
        await beginFrameCapture(page);
        for (let index = 0; index < 18; index += 1) {
          await page.mouse.wheel(0, index % 2 === 0 ? -190 : 190);
          // Inputs are separated by a rendered frame to obtain useful
          // active-gesture samples without timer-based sleeps.
          await settleFrames(page, 1);
        }
        // On a very slow scene the 120 ms wheel debounce may elapse
        // between two inputs. Report this observable state without assuming
        // the entire 18-event sequence is a single wheel session.
        const wheelPauseStillActiveAfterInputs =
          (await stage.getAttribute("data-wheel-gif-pause-active")) === "true";
        await expect(stage).toHaveAttribute(
          "data-wheel-gif-pause-active",
          "false",
          {
            timeout: 10_000,
          },
        );
        const commitObservedAtMs = await page.evaluate(() => performance.now());
        await settleFrames(page, 20);
        const captured = await page.evaluate(() => {
          const recorder = (window as CapturingWindow).__c39Capture;
          if (recorder === undefined)
            throw new Error("C3.9 frame recorder not installed");
          delete (window as CapturingWindow).__c39Capture;
          return recorder.stop();
        });
        const phases = summarizePhases(
          captured.timestamps,
          captured.wheelTimes,
          commitObservedAtMs,
        );
        const chromiumTrace =
          stopChromiumTrace === null ? null : await stopChromiumTrace();
        const jsTrace = await page.evaluate(
          () => window.__tutorBoardC37Trace?.events ?? [],
        );
        const attribution = correlateC39SlowFrames(
          phases.gaps,
          captured.wheelTimes,
          jsTrace,
          chromiumTrace,
        );
        if (traceEnabled) {
          const kinds = new Set<string>(jsTrace.map((event) => event.kind));
          for (const expected of [
            "wheel-input",
            "wheel-layout",
            "wheel-cache-end",
            "wheel-animation-resume",
            "wheel-viewport-persist",
            "wheel-commit",
          ]) {
            expect(
              kinds.has(expected),
              `Missing C3.9 trace event: ${expected}`,
            ).toBe(true);
          }
          expect(jsTrace.length).toBeLessThanOrEqual(12_000);
          if (chromiumTraceEnabled) {
            expect(chromiumTrace?.events.length).toBeLessThanOrEqual(20_000);
          } else {
            expect(chromiumTrace).toBeNull();
            expect(attribution.traceAlignment).toBe("unavailable");
          }
        }
        expect(phases.phases.active.count).toBeGreaterThan(0);
        expect(phases.phases.settling.count).toBeGreaterThan(0);
        const report = {
          schemaVersion: 1,
          baselineSha: process.env.GITHUB_SHA ?? "local",
          experiment: scenario.staticHeavy
            ? "C3.9-STATIC"
            : scenario.e2
              ? "C3.9-E2"
              : "C3.9",
          traceEnabled,
          scenario,
          browser: browser.version(),
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          importDurationMs,
          loadMode: scenario.staticHeavy
            ? "indexeddb-revision-restore"
            : "json-import",
          content: {
            objects: board.order.length,
            visibleStrokesRequested: scenario.visibleStrokes,
            realGifFrames: scenario.gifs > 0 ? 4 : 0,
            pngCount: scenario.staticHeavy ? 4 : staticCount,
            jpegCount: scenario.staticHeavy ? 6 : 0,
            pngWidthPx: 1536,
            pngHeightPx: 1536,
          },
          before,
          after: {
            layers: Number(
              await stage.getAttribute("data-committed-layer-count"),
            ),
            animatedLayers: Number(
              await stage.getAttribute("data-animated-layer-count"),
            ),
            prepared:
              (await stage.getAttribute("data-wheel-cache-prepared")) ===
              "true",
          },
          wheelPauseStillActiveAfterInputs,
          ...phases,
          c39Attribution: {
            ...attribution,
            jsEventCount: jsTrace.length,
            chromiumEventCount: chromiumTrace?.events.length ?? null,
            browserGpuInstrumentation:
              chromiumTrace === null
                ? "not-recorded"
                : attribution.traceAlignment,
          },
        };
        console.info("C39_REPRESENTATIVE_BASELINE " + JSON.stringify(report));
        if (attribution.frames.length > 0) {
          // Keep the full evidence in the JSON attachment, while console
          // output displays a compact summary useful for CI triage.
          console.info(
            "C39_SLOW_FRAME_ATTRIBUTION " +
              JSON.stringify({
                scenario: scenario.name,
                traceAlignment: attribution.traceAlignment,
                slowFrames: attribution.frames.map(
                  ({
                    gapMs,
                    classification,
                    compositorEvidence,
                    jsEvents,
                    chromiumEvents,
                  }) => ({
                    gapMs,
                    classification,
                    compositorEvidence,
                    jsKinds: jsEvents.map((event) => event.kind),
                    chromiumNames: chromiumEvents
                      .slice(0, 6)
                      .map((event) => event.name),
                  }),
                ),
              }),
          );
        }
        await testInfo.attach("c39-baseline-" + scenario.name + ".json", {
          body: Buffer.from(JSON.stringify(report, null, 2)),
          contentType: "application/json",
        });
      } finally {
        await context.close();
      }
    },
  );
}
