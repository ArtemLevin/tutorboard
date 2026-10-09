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
  readonly drawImageCalls: number;
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
    drawImageCalls: 0,
    imageSrcAssignments: 0,
    longTasks: [],
    rafCallbacks: 0,
    rafRequests: 0,
  };
  const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
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
    return Reflect.apply(originalDrawImage, this, args);
  };
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    state.clearRectCalls += 1;
    return Reflect.apply(originalClearRect, this, args);
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
      state.drawImageCalls = 0;
      state.imageSrcAssignments = 0;
      state.longTasks.length = 0;
      state.rafCallbacks = 0;
      state.rafRequests = 0;
    },
    snapshot() {
      return {
        bitmapDecodeCalls: state.bitmapDecodeCalls,
        clearRectCalls: state.clearRectCalls,
        drawImageCalls: state.drawImageCalls,
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
      let previous = null;
      for (let index = 0; index < frameCount + 1; index += 1) {
        const timestamp = await new Promise((resolve) =>
          originalRequestAnimationFrame(resolve),
        );
        if (previous !== null) intervals.push(timestamp - previous);
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
  largeBoardPngs = Array.from({ length: largeBoardImageCount }, (_, imageIndex) => {
    const png = new PNG({ height: largeBoardImageSide, width: largeBoardImageSide });
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
  });
  return largeBoardPngs;
}

interface LargeBoardInteractionMeasurement {
  readonly scenario: string;
  readonly strokeCount: number;
  readonly imageCount: number;
  readonly gifCount: number;
  readonly decodedPixelBytes: number;
  readonly embeddedSourceBytes: number;
  readonly importAndDecodeWallMs: number;
  readonly rasterActiveDecodedCount: number;
  readonly rasterActiveEstimatedDecodedBytes: number;
  readonly idle: { readonly frames: FrameProfile; readonly counters: MediaProfileSnapshot };
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
  scenario: { readonly name: string; readonly strokeCount: number; readonly gifCount: number },
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
  const activeCount = await integerStageMetric(page, "data-raster-active-decoded-count");
  const activeBytes = await integerStageMetric(page, "data-raster-active-estimated-decoded-bytes");

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
    page.mouse.move(x + Math.min(bounds.width * 0.65, 510), y + 34, { steps: 48 }),
  ]);
  const pointerGestureWallMs = performance.now() - gestureStart;
  const drawingCounters = await snapshot(page);
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp("^" + (document.order.length + 1) + " объект", "u"),
  );
  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  const inputToPaintP95Ms = await integerStageMetric(page, "data-wet-ink-latency-p95-ms");
  const inputToPaintCount = await integerStageMetric(page, "data-wet-ink-latency-count");

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await resetProfile(page);
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
  const result: LargeBoardInteractionMeasurement = {
    scenario: scenario.name,
    strokeCount: scenario.strokeCount,
    imageCount: sources.length,
    gifCount: scenario.gifCount,
    decodedPixelBytes: largeBoardImageCount * largeBoardImageSide ** 2 * 4,
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
    zoom: { frames: zoomFrames, counters: zoomCounters, wheelGestureWallMs },
  };
  expect(result.rasterActiveDecodedCount).toBe(largeBoardImageCount);
  expect(result.rasterActiveEstimatedDecodedBytes).toBeGreaterThanOrEqual(
    result.decodedPixelBytes,
  );
  expect(result.drawing.inputToPaintCount).toBeGreaterThan(0);
  expect(result.drawing.frames.frameCount).toBe(largeBoardFrameCount);
  expect(result.zoom.frames.frameCount).toBe(largeBoardFrameCount);
  return result;
}

for (const scenario of [
  { name: "large300-static", strokeCount: 300, gifCount: 0 },
  { name: "large600-animated", strokeCount: 600, gifCount: 4 },
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
      const result = await profileLargeBoard(page, scenario);
      console.info("LARGE_BOARD_INTERACTION_PROFILE", JSON.stringify(result));
      await testInfo.attach("large-board-" + scenario.name + ".json", {
        body: Buffer.from(JSON.stringify(result, null, 2)),
        contentType: "application/json",
      });
    },
  );
}
