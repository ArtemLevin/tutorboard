import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";
import { createCoordinatePlot } from "./coordinate-plot-interaction.js";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  readonly PNG: {
    new (options: { readonly height: number; readonly width: number }): {
      readonly data: Buffer;
      readonly height: number;
      readonly width: number;
    };
    readonly sync: {
      readonly read: (buffer: Buffer) => {
        readonly data: Buffer;
        readonly height: number;
        readonly width: number;
      };
      readonly write: (png: {
        readonly data: Buffer;
        readonly height: number;
        readonly width: number;
      }) => Buffer;
    };
  };
};

const databaseName = "tutorboard-local-v1";
const timestamp = "2026-10-04T18:30:00.000Z";
const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgEpH7DwABpAE8k4sOtwAAAABJRU5ErkJggg==";
const gifDataUrl =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

interface MediaPerformanceDocumentOptions {
  readonly gifCount?: number;
  readonly largeStaticDataUrl?: string | undefined;
  readonly mixed?: boolean;
  readonly staticCount?: number;
}

function digest(seed: number): string {
  return seed.toString(16).padStart(64, "0").slice(-64);
}

function mediaObject(
  index: number,
  input: {
    readonly dataUrl: string;
    readonly intrinsicSize?: {
      readonly height: number;
      readonly width: number;
    };
    readonly kind: "gif" | "static";
  },
) {
  const column = index % 5;
  const row = Math.floor(index / 5);
  const id = `object:media-performance:${input.kind}:${index}`;
  const mimeType = input.kind === "gif" ? "image/gif" : "image/png";
  return {
    contentSha256: digest(index + (input.kind === "gif" ? 10_000 : 1)),
    dataUrl: input.dataUrl,
    fileName: `${input.kind}-${index}.${input.kind === "gif" ? "gif" : "png"}`,
    groupId: null,
    id,
    intrinsicSize: input.intrinsicSize ?? { height: 900, width: 1_200 },
    kind: "image.embedded" as const,
    locked: false,
    mimeType,
    position: { x: 80 + column * 150, y: 80 + row * 120 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height: 90, width: 120 },
    source: { kind: "user" as const },
    style: {
      fill: null,
      opacity: 1,
      stroke: null,
      strokeWidth: 0,
    },
    visible: true,
  };
}

function createMediaPerformanceDocument(
  options: MediaPerformanceDocumentOptions = {},
) {
  const staticCount = options.staticCount ?? 0;
  const gifCount = options.gifCount ?? 0;
  const staticImages = Array.from({ length: staticCount }, (_value, index) =>
    mediaObject(index, {
      dataUrl:
        index === 0 && options.largeStaticDataUrl !== undefined
          ? options.largeStaticDataUrl
          : pngDataUrl,
      ...(index === 0 && options.largeStaticDataUrl !== undefined
        ? { intrinsicSize: { height: 1_024, width: 1_024 } }
        : {}),
      kind: "static",
    }),
  );
  const gifs = Array.from({ length: gifCount }, (_value, index) =>
    mediaObject(index, { dataUrl: gifDataUrl, kind: "gif" }),
  );
  const objects = [...staticImages, ...gifs];
  return {
    createdAt: timestamp,
    geometryImports: {},
    groups: {},
    id: "document:media-performance",
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
    schemaVersion: "1.6" as const,
    solidLearningAttempts: {},
    solidModels: {},
    title: "Media performance fixture",
    updatedAt: timestamp,
    viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
  };
}

interface MediaProfileSnapshot {
  readonly bitmapDecodeCalls: number;
  readonly clearRectCalls: number;
  readonly clearRectJsMs: number;
  readonly drawImageCalls: number;
  readonly drawImageJsMs: number;
  readonly strokeCalls: number;
  readonly strokeJsMs: number;
  readonly imageSrcAssignments: number;
  readonly longTaskCount: number;
  readonly longTaskMaxMs: number;
  readonly longTaskTotalMs: number;
  readonly rafCallbacks: number;
  readonly rafRequests: number;
}

interface FrameProfile {
  readonly frameCount: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly over25Ms: number;
  readonly over50Ms: number;
  readonly slowestGapsMs: readonly number[];
  readonly slowFrameWindows: readonly {
    readonly startMs: number;
    readonly endMs: number;
  }[];
}

interface MediaMeasuredPass {
  readonly counters: MediaProfileSnapshot;
  readonly frames: FrameProfile;
}

interface MediaScenarioMedian {
  readonly bitmapDecodeCalls: number;
  readonly clearRectCalls: number;
  readonly drawImageCalls: number;
  readonly frameP95Ms: number;
  readonly longTaskCount: number;
  readonly rafCallbacks: number;
  readonly rafRequests: number;
}

const mediaWarmupPasses = 2;
const mediaMeasuredPasses = 5;
const mediaWarmupFrames = 30;
const mediaMeasuredFrames = 60;

const mediaInstrumentationScript = String.raw`
(() => {
  const state = {
    bitmapDecodeCalls: 0,
    clearRectCalls: 0,
    clearRectJsMs: 0,
    drawImageCalls: 0,
    drawImageJsMs: 0,
    strokeCalls: 0,
    strokeJsMs: 0,
    imageSrcAssignments: 0,
    longTasks: [],
    rafCallbacks: 0,
    rafRequests: 0,
  };
  const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  const originalCreateImageBitmap = window.createImageBitmap.bind(window);
  const imageSrcDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );

  window.requestAnimationFrame = (callback) => {
    state.rafRequests += 1;
    return originalRequestAnimationFrame((timestamp) => {
      state.rafCallbacks += 1;
      callback(timestamp);
    });
  };
  window.cancelAnimationFrame = (frameId) =>
    originalCancelAnimationFrame(frameId);

  window.createImageBitmap = (...args) => {
    state.bitmapDecodeCalls += 1;
    return originalCreateImageBitmap(...args);
  };

  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    state.drawImageCalls += 1;
    const start = performance.now();
    try {
      return Reflect.apply(originalDrawImage, this, args);
    } finally {
      state.drawImageJsMs += performance.now() - start;
    }
  };
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    state.clearRectCalls += 1;
    const start = performance.now();
    try {
      return Reflect.apply(originalClearRect, this, args);
    } finally {
      state.clearRectJsMs += performance.now() - start;
    }
  };
  CanvasRenderingContext2D.prototype.stroke = function (...args) {
    state.strokeCalls += 1;
    const start = performance.now();
    try {
      return Reflect.apply(originalStroke, this, args);
    } finally {
      state.strokeJsMs += performance.now() - start;
    }
  };

  if (imageSrcDescriptor?.get && imageSrcDescriptor.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: imageSrcDescriptor.configurable,
      enumerable: imageSrcDescriptor.enumerable,
      get: imageSrcDescriptor.get,
      set(value) {
        if (typeof value === "string" && value.startsWith("data:image/")) {
          state.imageSrcAssignments += 1;
        }
        imageSrcDescriptor.set.call(this, value);
      },
    });
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 50) state.longTasks.push(entry.duration);
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Firefox currently has no Long Tasks API. Functional lifecycle coverage
    // still runs there; Chromium owns this diagnostic metric.
  }

  const percentile = (values, ratio) => {
    if (values.length === 0) return 0;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)] ?? 0;
  };

  window.__tutorBoardMediaProfile = {
    reset() {
      state.bitmapDecodeCalls = 0;
      state.clearRectCalls = 0;
      state.clearRectJsMs = 0;
      state.drawImageCalls = 0;
      state.drawImageJsMs = 0;
      state.strokeCalls = 0;
      state.strokeJsMs = 0;
      state.imageSrcAssignments = 0;
      state.longTasks.length = 0;
      state.rafCallbacks = 0;
      state.rafRequests = 0;
    },
    snapshot() {
      return {
        bitmapDecodeCalls: state.bitmapDecodeCalls,
        clearRectCalls: state.clearRectCalls,
        clearRectJsMs: state.clearRectJsMs,
        drawImageCalls: state.drawImageCalls,
        drawImageJsMs: state.drawImageJsMs,
        strokeCalls: state.strokeCalls,
        strokeJsMs: state.strokeJsMs,
        imageSrcAssignments: state.imageSrcAssignments,
        longTaskCount: state.longTasks.length,
        longTaskMaxMs:
          state.longTasks.length === 0 ? 0 : Math.max(...state.longTasks),
        longTaskTotalMs: state.longTasks.reduce(
          (sum, duration) => sum + duration,
          0,
        ),
        rafCallbacks: state.rafCallbacks,
        rafRequests: state.rafRequests,
      };
    },
    async measureFrames(frameCount) {
      const intervals = [];
      const slowFrameWindows = [];
      let previous = null;
      for (let index = 0; index < frameCount + 1; index += 1) {
        const timestamp = await new Promise((resolve) =>
          originalRequestAnimationFrame(resolve),
        );
        if (previous !== null) {
          const duration = timestamp - previous;
          intervals.push(duration);
          if (duration > 25) {
            slowFrameWindows.push({ startMs: previous, endMs: timestamp });
          }
        }
        previous = timestamp;
      }
      return {
        frameCount: intervals.length,
        maxMs: intervals.length === 0 ? 0 : Math.max(...intervals),
        meanMs:
          intervals.length === 0
            ? 0
            : intervals.reduce((sum, value) => sum + value, 0) /
              intervals.length,
        p50Ms: percentile(intervals, 0.5),
        p95Ms: percentile(intervals, 0.95),
        over25Ms: intervals.filter((duration) => duration > 25).length,
        over50Ms: intervals.filter((duration) => duration > 50).length,
        slowestGapsMs: [...intervals].sort((a, b) => b - a).slice(0, 5),
        slowFrameWindows,
      };
    },
  };
})();
`;

async function installMediaInstrumentation(page: Page): Promise<void> {
  await page.addInitScript({ content: mediaInstrumentationScript });
}

async function resetLocalDatabase(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB deletion failed"));
      request.onblocked = () => reject(new Error("IndexedDB deletion blocked"));
    });
  }, databaseName);
  await page.reload();
  await expect(page.getByTestId("board-stage")).toBeVisible();
}

async function importDocument(
  page: Page,
  document: { readonly order: readonly string[] },
): Promise<void> {
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "media-performance.tutorboard.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp(`^${document.order.length} объект`, "u"),
  );
}

async function addMixedSceneContent(
  page: Page,
  baseCount: number,
): Promise<void> {
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Board stage has no bounds");

  await page.getByRole("button", { name: "Рисование" }).click();
  await page.getByRole("menuitemradio", { name: /Перо/u }).click();
  await page.mouse.move(bounds.x + 180, bounds.y + 520);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 460, bounds.y + 560, { steps: 8 });
  await page.mouse.up();

  await createCoordinatePlot(page);
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp(`^${baseCount + 2} объект`, "u"),
  );
}

async function snapshot(page: Page): Promise<MediaProfileSnapshot> {
  return page.evaluate(() => {
    const profile = (
      globalThis as typeof globalThis & {
        __tutorBoardMediaProfile?: {
          readonly snapshot: () => MediaProfileSnapshot;
        };
      }
    ).__tutorBoardMediaProfile;
    if (profile === undefined) throw new Error("Media profiler is unavailable");
    return profile.snapshot();
  });
}

async function resetProfile(page: Page): Promise<void> {
  await page.evaluate(() => {
    const profile = (
      globalThis as typeof globalThis & {
        __tutorBoardMediaProfile?: { readonly reset: () => void };
      }
    ).__tutorBoardMediaProfile;
    if (profile === undefined) throw new Error("Media profiler is unavailable");
    profile.reset();
  });
}

async function measureFrames(
  page: Page,
  frameCount = 60,
): Promise<FrameProfile> {
  return page.evaluate(async (count) => {
    const profile = (
      globalThis as typeof globalThis & {
        __tutorBoardMediaProfile?: {
          readonly measureFrames: (frameCount: number) => Promise<FrameProfile>;
        };
      }
    ).__tutorBoardMediaProfile;
    if (profile === undefined) throw new Error("Media profiler is unavailable");
    return profile.measureFrames(count);
  }, frameCount);
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function medianScenario(
  samples: readonly MediaMeasuredPass[],
): MediaScenarioMedian {
  return {
    bitmapDecodeCalls: median(
      samples.map(({ counters }) => counters.bitmapDecodeCalls),
    ),
    clearRectCalls: median(
      samples.map(({ counters }) => counters.clearRectCalls),
    ),
    drawImageCalls: median(
      samples.map(({ counters }) => counters.drawImageCalls),
    ),
    frameP95Ms: median(samples.map(({ frames }) => frames.p95Ms)),
    longTaskCount: median(
      samples.map(({ counters }) => counters.longTaskCount),
    ),
    rafCallbacks: median(samples.map(({ counters }) => counters.rafCallbacks)),
    rafRequests: median(samples.map(({ counters }) => counters.rafRequests)),
  };
}

async function profileDocument(
  page: Page,
  options: MediaPerformanceDocumentOptions,
) {
  await resetLocalDatabase(page);
  const document = createMediaPerformanceDocument(options);
  await importDocument(page, document);
  if (options.mixed === true) {
    await addMixedSceneContent(page, document.order.length);
  }
  const expectedMountedMedia =
    (options.staticCount ?? 0) + (options.gifCount ?? 0);
  await expect
    .poll(async () => {
      const counters = await snapshot(page);
      return counters.bitmapDecodeCalls + counters.imageSrcAssignments;
    })
    .toBeGreaterThanOrEqual(expectedMountedMedia);
  const mountCounters = await snapshot(page);

  for (let pass = 0; pass < mediaWarmupPasses; pass += 1) {
    await resetProfile(page);
    await measureFrames(page, mediaWarmupFrames);
  }

  const samples: MediaMeasuredPass[] = [];
  for (let pass = 0; pass < mediaMeasuredPasses; pass += 1) {
    await resetProfile(page);
    const frames = await measureFrames(page, mediaMeasuredFrames);
    samples.push({
      counters: await snapshot(page),
      frames,
    });
  }

  return {
    median: medianScenario(samples),
    mountCounters,
    samples,
  };
}

function createLargePngDataUrl(): string {
  const width = 1_024;
  const height = 1_024;
  const png = new PNG({ height, width });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      png.data[offset] = x % 256;
      png.data[offset + 1] = y % 256;
      png.data[offset + 2] = (x + y) % 256;
      png.data[offset + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

test.beforeEach(async ({ page }) => {
  await installMediaInstrumentation(page);
});

interface MediaProfileScenario {
  readonly createOptions: () => MediaPerformanceDocumentOptions;
  readonly name: string;
}

const mediaProfileScenarioTimeoutMs = 60_000;

const mediaProfileScenarios: readonly MediaProfileScenario[] = [
  {
    name: "static1",
    createOptions: () => ({ staticCount: 1 }),
  },
  {
    name: "static5",
    createOptions: () => ({ staticCount: 5 }),
  },
  {
    name: "static10",
    createOptions: () => ({ staticCount: 10 }),
  },
  {
    name: "highPixelStatic",
    createOptions: () => ({
      largeStaticDataUrl: createLargePngDataUrl(),
      staticCount: 1,
    }),
  },
  {
    name: "gif1",
    createOptions: () => ({ gifCount: 1 }),
  },
  {
    name: "gif4",
    createOptions: () => ({ gifCount: 4 }),
  },
  {
    name: "gif8",
    createOptions: () => ({ gifCount: 8 }),
  },
  {
    name: "mixed",
    createOptions: () => ({
      gifCount: 4,
      mixed: true,
      staticCount: 5,
    }),
  },
];

for (const scenario of mediaProfileScenarios) {
  test(`@media-profile records F3.0 media rendering baseline: ${scenario.name}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(mediaProfileScenarioTimeoutMs);
    test.skip(
      testInfo.project.name !== "chromium",
      "Chromium owns C3.0 diagnostic profiling; lifecycle smoke runs cross-browser.",
    );

    const options = scenario.createOptions();
    const profile = await profileDocument(page, options);
    const report = {
      generatedAt: new Date().toISOString(),
      profile,
      scenario: scenario.name,
    };

    console.info("MEDIA_BROWSER_BASELINE", JSON.stringify(report));
    await testInfo.attach(`media-performance-baseline-${scenario.name}.json`, {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });

    const gifCount = options.gifCount ?? 0;
    if (gifCount > 0) {
      // One board-scoped GIF coordinator replaces one RAF loop per GIF.
      expect(profile.median.rafCallbacks).toBeGreaterThan(
        mediaMeasuredFrames / 2,
      );
      expect(profile.median.rafCallbacks).toBeLessThanOrEqual(
        mediaMeasuredFrames * 3,
      );
    }
    if (options.mixed === true) {
      expect(profile.median.drawImageCalls).toBeGreaterThan(0);
    }
  });
}

test("@smoke GIF redraw lifecycle stops offscreen and resumes after viewport churn", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  await importDocument(page, createMediaPerformanceDocument({ gifCount: 1 }));
  await expect
    .poll(async () => (await snapshot(page)).imageSrcAssignments)
    .toBeGreaterThanOrEqual(1);

  await resetProfile(page);
  await measureFrames(page, 30);
  const visible = await snapshot(page);
  expect(visible.rafCallbacks).toBeGreaterThan(10);

  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Board stage has no bounds");

  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + 260, { steps: 6 });
  await page.mouse.up();

  await resetProfile(page);
  await measureFrames(page, 30);
  const offscreen = await snapshot(page);
  expect(offscreen.rafCallbacks).toBeLessThan(visible.rafCallbacks / 4);

  await resetProfile(page);
  await page.mouse.move(bounds.x + 40, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + 260, {
    steps: 6,
  });
  await page.mouse.up();

  await measureFrames(page, 30);
  const restored = await snapshot(page);
  expect(restored.rafCallbacks).toBeGreaterThan(10);
  expect(restored.imageSrcAssignments).toBeGreaterThanOrEqual(1);
});

test("@smoke file import decodes static raster before A2 renderer mount", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  await page.getByRole("button", { name: "Медиа" }).click();
  await resetProfile(page);

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgEpH7DwABpAE8k4sOtwAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("Вставить изображения").setInputFiles({
    buffer: onePixelPng,
    mimeType: "image/png",
    name: "decode-baseline.png",
  });

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect
    .poll(async () => (await snapshot(page)).bitmapDecodeCalls)
    .toBeGreaterThanOrEqual(2);
});

const largeBoardImageSide = 1_536;
const largeBoardImageCount = 6;
const largeBoardFrameCount = 48;
let largeBoardPngs: readonly string[] | null = null;

function representativeLargeBoardPngs(): readonly string[] {
  if (largeBoardPngs !== null) return largeBoardPngs;
  largeBoardPngs = Array.from(
    { length: largeBoardImageCount },
    (_, imageIndex) => {
      const png = new PNG({
        height: largeBoardImageSide,
        width: largeBoardImageSide,
      });
      for (let y = 0; y < largeBoardImageSide; y += 1) {
        for (let x = 0; x < largeBoardImageSide; x += 1) {
          const offset = (y * largeBoardImageSide + x) * 4;
          png.data[offset] = (x * (imageIndex + 2) + (y >> 3)) % 256;
          png.data[offset + 1] = (y * 3 + imageIndex * 37) % 256;
          png.data[offset + 2] = ((x >> 2) + (y >> 2) + imageIndex * 41) % 256;
          png.data[offset + 3] = 255;
        }
      }
      return "data:image/png;base64," + PNG.sync.write(png).toString("base64");
    },
  );
  return largeBoardPngs;
}

interface LargeBoardInteractionMeasurement {
  readonly scenario: string;
  readonly strokeCount: number;
  readonly imageCount: number;
  readonly gifCount: number;
  readonly sourcePixelBytes: number;
  readonly embeddedSourceBytes: number;
  readonly importAndDecodeWallMs: number;
  readonly rasterActiveDecodedCount: number;
  readonly rasterActiveEstimatedDecodedBytes: number;
  readonly idle: {
    readonly frames: FrameProfile;
    readonly counters: MediaProfileSnapshot;
  };
  readonly drawing: {
    readonly frames: FrameProfile;
    readonly counters: MediaProfileSnapshot;
    readonly inputToPaintP95Ms: number;
    readonly inputToPaintCount: number;
    readonly pointerGestureWallMs: number;
  };
  readonly zoom: {
    readonly frames: FrameProfile;
    readonly counters: MediaProfileSnapshot;
    readonly wheelGestureWallMs: number;
    readonly wheelCacheBuildMs: number;
    readonly wheelCacheWheelBeginMs: number;
    readonly wheelCacheOverlappingSlowFrames: number;
    readonly wheelCacheUsedPrewarm: boolean;
    readonly wheelCacheSkippedColdBuild: boolean;
    readonly wheelCacheBuildPixels: number;
    readonly wheelCacheBuilds: number;
    readonly wheelCacheSkippedRuns: number;
    readonly c37Trace?: Record<
      string,
      {
        readonly count: number;
        readonly totalMs: number;
        readonly maxMs: number;
        readonly over25Ms: number;
      }
    >;
  };
}

async function integerStageMetric(page: Page, name: string): Promise<number> {
  const value = await page.getByTestId("board-stage").getAttribute(name);
  if (value === null || !Number.isFinite(Number(value))) {
    throw new Error("Stage did not publish " + name);
  }
  return Number(value);
}

async function profileLargeBoard(
  page: Page,
  scenario: {
    readonly name: string;
    readonly strokeCount: number;
    readonly gifCount: number;
  },
): Promise<LargeBoardInteractionMeasurement> {
  await resetLocalDatabase(page);
  const sources = representativeLargeBoardPngs();
  const document = createDenseBoardDocument({
    strokeCount: scenario.strokeCount,
    staticCount: sources.length,
    gifCount: scenario.gifCount,
    largeStaticDataUrls: sources,
  });
  const start = performance.now();
  await importDocument(page, document);
  await expect
    .poll(() => integerStageMetric(page, "data-raster-active-decoded-count"))
    .toBe(largeBoardImageCount);
  const importAndDecodeWallMs = performance.now() - start;
  const activeCount = await integerStageMetric(
    page,
    "data-raster-active-decoded-count",
  );
  const activeBytes = await integerStageMetric(
    page,
    "data-raster-active-estimated-decoded-bytes",
  );

  await measureFrames(page, 20);
  await resetProfile(page);
  const idleFrames = await measureFrames(page, largeBoardFrameCount);
  const idleCounters = await snapshot(page);

  await page.getByRole("button", { name: "Рисование" }).click();
  await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Dense stage bounds missing");

  const x = bounds.x + 110;
  const y = bounds.y + Math.min(bounds.height * 0.74, 540);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(stage).toHaveAttribute("data-wet-ink-active", "true");
  await resetProfile(page);
  const gestureStart = performance.now();
  const [drawingFrames] = await Promise.all([
    measureFrames(page, largeBoardFrameCount),
    page.mouse.move(x + Math.min(bounds.width * 0.65, 510), y + 34, {
      steps: 48,
    }),
  ]);
  const pointerGestureWallMs = performance.now() - gestureStart;
  const drawingCounters = await snapshot(page);
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp("^" + (document.order.length + 1) + " объект", "u"),
  );
  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  const inputToPaintP95Ms = await integerStageMetric(
    page,
    "data-wet-ink-latency-p95-ms",
  );
  const inputToPaintCount = await integerStageMetric(
    page,
    "data-wet-ink-latency-count",
  );

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await resetProfile(page);
  await page.evaluate(() => {
    if (window.__tutorBoardC37Trace !== undefined) {
      window.__tutorBoardC37Trace.events.length = 0;
    }
  });
  const wheelStart = performance.now();
  const [zoomFrames] = await Promise.all([
    measureFrames(page, largeBoardFrameCount),
    (async () => {
      for (let step = 0; step < 6; step += 1) {
        await page.mouse.wheel(0, step % 2 === 0 ? -190 : 190);
      }
    })(),
  ]);
  const wheelGestureWallMs = performance.now() - wheelStart;
  const zoomCounters = await snapshot(page);
  const c37Trace = await page.evaluate(() => {
    const events = window.__tutorBoardC37Trace?.events ?? [];
    const summary: Record<
      string,
      { count: number; totalMs: number; maxMs: number; over25Ms: number }
    > = {};
    for (const event of events) {
      const current = summary[event.kind] ?? {
        count: 0,
        totalMs: 0,
        maxMs: 0,
        over25Ms: 0,
      };
      current.count += 1;
      current.totalMs += event.durationMs;
      current.maxMs = Math.max(current.maxMs, event.durationMs);
      if (event.durationMs > 25) current.over25Ms += 1;
      summary[event.kind] = current;
    }
    return summary;
  });
  const cacheStartMs = await integerStageMetric(
    page,
    "data-wheel-cache-last-wheel-start-ms",
  );
  const cacheEndMs = await integerStageMetric(
    page,
    "data-wheel-cache-last-wheel-end-ms",
  );
  const overlappingSlowFrames = zoomFrames.slowFrameWindows.filter(
    ({ startMs, endMs }) => startMs < cacheEndMs && endMs > cacheStartMs,
  ).length;
  const result: LargeBoardInteractionMeasurement = {
    scenario: scenario.name,
    strokeCount: scenario.strokeCount,
    imageCount: sources.length,
    gifCount: scenario.gifCount,
    sourcePixelBytes: largeBoardImageCount * largeBoardImageSide ** 2 * 4,
    embeddedSourceBytes: sources.reduce((sum, value) => sum + value.length, 0),
    importAndDecodeWallMs,
    rasterActiveDecodedCount: activeCount,
    rasterActiveEstimatedDecodedBytes: activeBytes,
    idle: { frames: idleFrames, counters: idleCounters },
    drawing: {
      frames: drawingFrames,
      counters: drawingCounters,
      inputToPaintP95Ms,
      inputToPaintCount,
      pointerGestureWallMs,
    },
    zoom: {
      frames: zoomFrames,
      counters: zoomCounters,
      wheelGestureWallMs,
      wheelCacheBuildMs: await integerStageMetric(
        page,
        "data-wheel-cache-last-build-ms",
      ),
      wheelCacheWheelBeginMs: await integerStageMetric(
        page,
        "data-wheel-cache-last-wheel-begin-ms",
      ),
      wheelCacheOverlappingSlowFrames: overlappingSlowFrames,
      wheelCacheUsedPrewarm:
        (await stage.getAttribute(
          "data-wheel-cache-last-wheel-used-prepared",
        )) === "true",
      wheelCacheSkippedColdBuild:
        (await stage.getAttribute(
          "data-wheel-cache-last-wheel-skipped-cold-build",
        )) === "true",
      wheelCacheBuildPixels: await integerStageMetric(
        page,
        "data-wheel-cache-last-build-pixels",
      ),
      wheelCacheBuilds: await integerStageMetric(
        page,
        "data-wheel-cache-builds",
      ),
      wheelCacheSkippedRuns: await integerStageMetric(
        page,
        "data-wheel-cache-last-skipped-runs",
      ),
      ...(scenario.strokeCount === 3000 ? { c37Trace } : {}),
    },
  };
  console.info("LARGE_BOARD_INTERACTION_PROFILE", JSON.stringify(result));
  // Decoding is intentionally display-resolution-aware (typically 256 px here),
  // while zoom/remount may briefly leave multiple live decode buckets.
  expect(result.rasterActiveDecodedCount).toBeGreaterThanOrEqual(
    largeBoardImageCount,
  );
  expect(result.rasterActiveDecodedCount).toBeLessThanOrEqual(
    largeBoardImageCount * 2,
  );
  expect(result.rasterActiveEstimatedDecodedBytes).toBeGreaterThan(0);
  expect(result.drawing.inputToPaintCount).toBeGreaterThan(0);
  expect(result.drawing.frames.frameCount).toBe(largeBoardFrameCount);
  expect(result.zoom.frames.frameCount).toBe(largeBoardFrameCount);
  expect(result.zoom.wheelCacheBuildMs).toBeGreaterThanOrEqual(0);
  expect(result.zoom.wheelCacheWheelBeginMs).toBeGreaterThanOrEqual(0);
  expect(result.zoom.wheelCacheSkippedColdBuild).toBe(
    !result.zoom.wheelCacheUsedPrewarm,
  );
  expect(result.zoom.wheelCacheOverlappingSlowFrames).toBeLessThanOrEqual(
    result.zoom.frames.over25Ms,
  );
  expect(result.zoom.wheelCacheBuildPixels).toBeLessThanOrEqual(4_000_000);
  expect(result.zoom.frames.over25Ms).toBeLessThanOrEqual(
    result.zoom.frames.frameCount,
  );
  return result;
}

// Two factors are varied independently, preventing dense ink and GIF cadence
// from becoming an uninterpretable combined performance regression.
for (const scenario of [
  { name: "large300-static", strokeCount: 300, gifCount: 0 },
  { name: "large300-animated", strokeCount: 300, gifCount: 4 },
  { name: "large600-static", strokeCount: 600, gifCount: 0 },
  { name: "large600-animated", strokeCount: 600, gifCount: 4 },
  { name: "large1000-animated", strokeCount: 1000, gifCount: 4 },
  { name: "large3000-animated", strokeCount: 3000, gifCount: 4 },
]) {
  test(
    "@media-profile measures large-board drawing, zoom and raster decode: " +
      scenario.name,
    async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      test.skip(
        testInfo.project.name !== "chromium",
        "Chromium owns the isolated diagnostic browser profile",
      );
      // This extreme scene must remain responsive even when animated content
      // starves requestIdleCallback: measure a guaranteed cold-wheel path.
      if (scenario.strokeCount === 3000) {
        await page.addInitScript(() => {
          window.__tutorBoardC37Trace = { events: [] };
          window.requestIdleCallback = () => 0;
          window.cancelIdleCallback = () => {};
        });
      }
      const result = await profileLargeBoard(page, scenario);
      if (scenario.strokeCount === 3000) {
        expect(result.zoom.wheelCacheSkippedColdBuild).toBe(true);
        expect(result.zoom.wheelCacheWheelBeginMs).toBeLessThan(25);
        expect(result.zoom.c37Trace?.["konva-scene"]?.count).toBeGreaterThan(
          0,
        );
        expect(result.zoom.c37Trace?.["board-commit"]?.count).toBeGreaterThan(
          0,
        );
        expect(result.zoom.c37Trace?.["gif-invalidate"]?.count).toBeGreaterThan(
          0,
        );
        expect(result.zoom.c37Trace?.["react-ink-run"]?.count ?? 0).toBe(0);
      }
      await testInfo.attach("large-board-" + scenario.name + ".json", {
        body: Buffer.from(JSON.stringify(result, null, 2)),
        contentType: "application/json",
      });
    },
  );
}

// High-DPI visual equivalence of the prepared and cold-cache render paths,
// including interleaved PNG/GIF, semi-transparent ink and object transforms.
test("@media-profile DPR2 pixel parity", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium owns the pixel-equivalence diagnostic profile",
  );
  const board = createDenseBoardDocument({
    strokeCount: 120,
    staticCount: 2,
    gifCount: 1,
  });
  const strokes = board.order.filter((id) => id.includes(":stroke:"));
  const images = board.order.filter((id) => id.includes(":image:"));
  const [pngBelow, pngAbove, gif] = images;
  if (pngBelow === undefined || pngAbove === undefined || gif === undefined) {
    throw new Error("Missing mixed media for high-DPI visual profile");
  }
  board.order.splice(
    0,
    board.order.length,
    ...strokes.slice(0, 100),
    pngBelow,
    gif,
    ...strokes.slice(100),
    pngAbove,
  );
  for (const [index, id] of board.order.entries()) {
    const object = board.objects[id];
    if (object === undefined) throw new Error("Missing visual object " + id);
    object.style.opacity = index % 2 === 0 ? 0.65 : 0.85;
    object.rotation = index < 120 ? 0 : 0.21;
    object.scale = { x: 1.12, y: 0.87 };
    if (object.kind === "image.embedded") {
      object.position = { x: 205 + (index % 30), y: 195 };
    }
  }

  const comparison = await Promise.all(
    [true, false].map(async (prewarm) => {
      const context = await browser.newContext({
        deviceScaleFactor: 2,
        viewport: { width: 1240, height: 820 },
      });
      const page = await context.newPage();
      try {
        await installMediaInstrumentation(page);
        await page.addInitScript((enabled) => {
          if (enabled) {
            window.requestIdleCallback = (callback) =>
              window.setTimeout(
                () => callback({ didTimeout: false, timeRemaining: () => 50 }),
                0,
              );
            window.cancelIdleCallback = (id) => window.clearTimeout(id);
          } else {
            window.requestIdleCallback = () => 0;
            window.cancelIdleCallback = () => {};
          }
        }, prewarm);
        await resetLocalDatabase(page);
        await importDocument(page, board);
        const stage = page.getByTestId("board-stage");
        if (prewarm) {
          await expect(stage).toHaveAttribute(
            "data-wheel-cache-prepared",
            "true",
          );
        } else {
          await expect(stage).toHaveAttribute(
            "data-wheel-cache-prepared",
            "false",
          );
        }
        const bounds = await stage.boundingBox();
        if (bounds === null) throw new Error("Missing visual board bounds");
        await page.mouse.move(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        await page.mouse.wheel(0, -190);
        await expect(stage).toHaveAttribute(
          "data-wheel-cache-last-wheel-used-prepared",
          String(prewarm),
        );
        await expect(stage).toHaveAttribute(
          "data-wheel-cache-last-wheel-skipped-cold-build",
          String(!prewarm),
        );
        await measureFrames(page, 24);
        expect(
          await integerStageMetric(page, "data-wheel-cache-last-build-pixels"),
        ).toBeLessThanOrEqual(4_000_000);
        return await stage.screenshot({ animations: "disabled" });
      } finally {
        await context.close();
      }
    }),
  );

  const [warmImage, coldImage] = comparison.map((buffer) =>
    PNG.sync.read(buffer),
  );
  if (warmImage === undefined || coldImage === undefined) {
    throw new Error("Missing pixel comparison screenshots");
  }
  expect(warmImage.width).toBe(coldImage.width);
  expect(warmImage.height).toBe(coldImage.height);
  let significantChannels = 0;
  let totalChannelError = 0;
  for (let index = 0; index < warmImage.data.length; index += 1) {
    const channelError = Math.abs(
      (warmImage.data[index] ?? 0) - (coldImage.data[index] ?? 0),
    );
    if (channelError > 3) significantChannels += 1;
    totalChannelError += channelError;
  }
  const channelCount = warmImage.data.length;
  const profile = {
    dpr: 2,
    width: warmImage.width,
    height: warmImage.height,
    significantChannelFraction: significantChannels / channelCount,
    meanChannelError: totalChannelError / channelCount,
  };
  console.info("WHEEL_CACHE_PIXEL_EQUIVALENCE", JSON.stringify(profile));
  expect(profile.significantChannelFraction).toBeLessThan(0.01);
  expect(profile.meanChannelError).toBeLessThan(1);
});

// Long, heavy interaction sequence: checks bounded cache allocation and
// that the last cleanup releases prepared Konva groups after a board clear.
test("@media-profile 3000 pen long-wheel soak", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium owns the extended zoom-cycle lifetime profile",
  );
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1240, height: 820 },
  });
  const page = await context.newPage();
  try {
    await installMediaInstrumentation(page);
    await resetLocalDatabase(page);
    const board = createDenseBoardDocument({
      strokeCount: 3000,
      staticCount: 2,
      gifCount: 2,
    });
    await importDocument(page, board);
    const stage = page.getByTestId("board-stage");
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("Missing large board bounds");
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    let observedPeakCachePixels = 0;
    for (let cycle = 0; cycle < 48; cycle += 1) {
      await page.mouse.wheel(0, cycle % 2 === 0 ? -190 : 190);
      if (cycle % 6 === 5) {
        await measureFrames(page, 12);
        const cachePixels = await integerStageMetric(
          page,
          "data-wheel-cache-last-build-pixels",
        );
        observedPeakCachePixels = Math.max(
          observedPeakCachePixels,
          cachePixels,
        );
        expect(cachePixels).toBeLessThanOrEqual(4_000_000);
      }
    }
    await measureFrames(page, 16);
    const builds = await integerStageMetric(page, "data-wheel-cache-builds");
    console.info(
      "WHEEL_CACHE_LONG_CYCLE_PROFILE",
      JSON.stringify({
        strokes: 3000,
        cycles: 48,
        dpr: 2,
        cacheBuilds: builds,
        observedPeakCachePixels,
        lastBuildSkippedRuns: await integerStageMetric(
          page,
          "data-wheel-cache-last-skipped-runs",
        ),
      }),
    );
    await page.mouse.click(
      bounds.x + bounds.width * 0.85,
      bounds.y + bounds.height * 0.83,
      { button: "right" },
    );
    await page.getByRole("menuitem", { name: "Очистить холст" }).click();
    await page.getByRole("button", { name: "Очистить", exact: true }).click();
    await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
    await expect(stage).toHaveAttribute("data-wheel-cache-active-runs", "0");
    await expect(stage).toHaveAttribute("data-wheel-cache-prepared", "false");
  } finally {
    await context.close();
  }
});

// C3.2-B: GIF frames must only invalidate their own ordered render runs.
// Static media may appear both before and after animation in the z-order.
test("@smoke isolates interleaved GIF redraw while preserving committed z-order", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  const document = createMediaPerformanceDocument({
    staticCount: 3,
    gifCount: 2,
  });
  const [staticA, staticB, staticC, animatedA, animatedB] = document.order;
  if (
    staticA === undefined ||
    staticB === undefined ||
    staticC === undefined ||
    animatedA === undefined ||
    animatedB === undefined
  ) {
    throw new Error("Missing mixed scene objects");
  }
  await importDocument(page, {
    ...document,
    order: [staticA, animatedA, staticB, animatedB, staticC],
  });
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-committed-layer-count", "5");
  await expect(stage).toHaveAttribute("data-animated-layer-count", "2");
  await expect
    .poll(async () => (await snapshot(page)).imageSrcAssignments)
    .toBeGreaterThanOrEqual(2);
  // PNGs use createImageBitmap and do not assign HTMLImageElement.src.
  await expect
    .poll(() => integerStageMetric(page, "data-raster-active-decoded-count"))
    .toBeGreaterThanOrEqual(3);

  await measureFrames(page, 15);
  await resetProfile(page);
  await measureFrames(page, 40);
  const counters = await snapshot(page);
  expect(counters.drawImageCalls).toBeGreaterThan(0);
  // GIF frames repaint only two animation Layers. Three static PNGs stay
  // mounted on separate retained Layers throughout the idle interval.
  expect(counters.drawImageCalls).toBeLessThan(140);
});

test("@smoke reuses prepared wheel cache and restores pen hits", async ({
  page,
}) => {
  // Deterministic browser scheduler for the functional contract: native
  // requestIdleCallback is opportunistic and benchmarked separately below.
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback) =>
      window.setTimeout(
        () => callback({ didTimeout: false, timeRemaining: () => 50 }),
        0,
      );
    window.cancelIdleCallback = (id) => window.clearTimeout(id);
  });
  await resetLocalDatabase(page);
  await importDocument(
    page,
    createDenseBoardDocument({ strokeCount: 120, staticCount: 1 }),
  );
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-wheel-cache-prepared", "true");
  const builds = await integerStageMetric(page, "data-wheel-cache-builds");
  expect(builds).toBeGreaterThan(0);
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Missing board bounds");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -190);
  await expect(stage).toHaveAttribute(
    "data-wheel-cache-last-wheel-used-prepared",
    "true",
  );
  expect(await integerStageMetric(page, "data-wheel-cache-builds")).toBe(
    builds,
  );
  // The cache may be prepared again after commit; hit testing verifies
  // that the completed viewport remains interactive and individually selectable.
  await page.mouse.wheel(0, 190);
  await page.keyboard.press("v");
  await page.mouse.click(bounds.x + 90, bounds.y + 192);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
});

test("@smoke builds and releases bounded pen cache across wheel zoom", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  const document = createDenseBoardDocument({
    strokeCount: 120,
    staticCount: 1,
    gifCount: 1,
  });
  await importDocument(page, document);
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Missing board bounds");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -190);
  await expect
    .poll(() => integerStageMetric(page, "data-wheel-cache-builds"))
    .toBeGreaterThan(0);
  await expect(stage).toHaveAttribute("data-wheel-cache-active-runs", "0");
  await expect(stage).toHaveAttribute("data-committed-layer-count", "2");

  // A second gesture must safely rebuild from the committed viewport,
  // after the first hit and scene caches were completely released.
  await page.mouse.wheel(0, 190);
  await expect
    .poll(() => integerStageMetric(page, "data-wheel-cache-builds"))
    .toBeGreaterThanOrEqual(2);
  await expect(stage).toHaveAttribute("data-wheel-cache-active-runs", "0");

  // Two inverse wheel steps return to the original world coordinates.
  // Hit testing must still resolve an individual pen stroke, after
  // the cached Konva hit canvas has been released and rebuilt.
  await page.keyboard.press("v");
  await page.mouse.click(bounds.x + 90, bounds.y + 192);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
});

test("@smoke GIF redraw resumes after repeated wheel zoom on a dense board", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  await importDocument(
    page,
    createMediaPerformanceDocument({ gifCount: 4, staticCount: 5 }),
  );
  await expect
    .poll(async () => (await snapshot(page)).imageSrcAssignments)
    .toBeGreaterThanOrEqual(4);
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Expected a board stage");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, index % 2 === 0 ? -190 : 190);
  }
  // Wait by rendering real frames until the 120 ms wheel session has settled.
  await measureFrames(page, 15);
  await resetProfile(page);
  await measureFrames(page, 30);
  const restored = await snapshot(page);
  expect(restored.rafCallbacks).toBeGreaterThan(10);
  expect(restored.drawImageCalls).toBeGreaterThan(0);
});
