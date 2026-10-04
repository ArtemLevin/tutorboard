import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

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
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC9sAAAAASUVORK5CYII=";
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
      intrinsicSize:
        index === 0 && options.largeStaticDataUrl !== undefined
          ? { height: 1_024, width: 1_024 }
          : undefined,
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

const mediaInstrumentationScript = String.raw`
(() => {
  const state = {
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
      state.clearRectCalls = 0;
      state.drawImageCalls = 0;
      state.imageSrcAssignments = 0;
      state.longTasks.length = 0;
      state.rafCallbacks = 0;
      state.rafRequests = 0;
    },
    snapshot() {
      return {
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
  document: ReturnType<typeof createMediaPerformanceDocument>,
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

async function profileDocument(
  page: Page,
  options: Parameters<typeof createMediaPerformanceDocument>[0],
) {
  await resetLocalDatabase(page);
  const document = createMediaPerformanceDocument(options);
  await importDocument(page, document);
  if (options?.mixed === true) {
    await addMixedSceneContent(page, document.order.length);
  }
  const expectedMountedMedia =
    (options?.staticCount ?? 0) + (options?.gifCount ?? 0);
  await expect
    .poll(async () => (await snapshot(page)).imageSrcAssignments)
    .toBeGreaterThanOrEqual(expectedMountedMedia);

  await resetProfile(page);
  const frames = await measureFrames(page);
  return {
    counters: await snapshot(page),
    frames,
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

test("@media-profile records the C2 media rendering baseline", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium owns C3.0 diagnostic profiling; lifecycle smoke runs cross-browser.",
  );

  const largeStaticDataUrl = createLargePngDataUrl();
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios: {
      static1: await profileDocument(page, { staticCount: 1 }),
      static5: await profileDocument(page, { staticCount: 5 }),
      static10: await profileDocument(page, { staticCount: 10 }),
      highPixelStatic: await profileDocument(page, {
        largeStaticDataUrl,
        staticCount: 1,
      }),
      gif1: await profileDocument(page, { gifCount: 1 }),
      gif4: await profileDocument(page, { gifCount: 4 }),
      gif8: await profileDocument(page, { gifCount: 8 }),
      mixed: await profileDocument(page, {
        gifCount: 4,
        mixed: true,
        staticCount: 5,
      }),
    },
  };

  expect(report.scenarios.gif1.counters.rafCallbacks).toBeGreaterThan(0);
  expect(report.scenarios.gif4.counters.rafCallbacks).toBeGreaterThan(
    report.scenarios.gif1.counters.rafCallbacks * 2,
  );
  expect(report.scenarios.gif8.counters.rafCallbacks).toBeGreaterThan(
    report.scenarios.gif4.counters.rafCallbacks * 1.5,
  );
  expect(report.scenarios.mixed.counters.drawImageCalls).toBeGreaterThan(
    report.scenarios.gif4.counters.drawImageCalls,
  );

  console.info("MEDIA_BROWSER_BASELINE", JSON.stringify(report));
  await testInfo.attach("media-performance-baseline.json", {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: "application/json",
  });
});

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

test("@smoke file import decodes raster metadata before renderer mount", async ({
  page,
}) => {
  await resetLocalDatabase(page);
  await page.getByRole("button", { name: "Медиа" }).click();
  await resetProfile(page);

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC9sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Вставить изображения").setInputFiles({
    buffer: onePixelPng,
    mimeType: "image/png",
    name: "decode-baseline.png",
  });

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect
    .poll(async () => (await snapshot(page)).imageSrcAssignments)
    .toBeGreaterThanOrEqual(2);
});
