import { createRequire } from "node:module";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  createMediaPerformanceDocument,
  type MediaPerformanceDocumentOptions,
} from "../fixtures/media-performance.js";

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

interface MediaLifecycleMetrics {
  readonly activeGifElements: number;
  readonly activeBlobUrls: number;
  readonly createdBlobUrls: number;
  readonly revokedBlobUrls: number;
}

interface RasterDiagnostics {
  readonly activeCount: number;
  readonly activeBytes: number;
  readonly startedCount: number;
  readonly releasedCount: number;
}

interface CycleResult {
  readonly cycle: number;
  readonly afterLoad: RasterDiagnostics;
  readonly afterClear: RasterDiagnostics;
  readonly lifecycle: MediaLifecycleMetrics;
  readonly frameP95Ms: number;
  readonly heapAfterGcBytes: number | null;
}

const largeImageWidth = 1_024;
const largeImageHeight = 1_024;
const smokeCycles = 3;
const soakCycles = 12;

function representativePng(): string {
  const png = new PNG({ height: largeImageHeight, width: largeImageWidth });
  for (let index = 0; index < largeImageWidth * largeImageHeight; index += 1) {
    const at = index * 4;
    png.data[at] = index % 256;
    png.data[at + 1] = Math.floor(index / largeImageWidth) % 256;
    png.data[at + 2] = (index * 13) % 256;
    png.data[at + 3] = 255;
  }
  return "data:image/png;base64," + PNG.sync.write(png).toString("base64");
}

async function installLifecycleObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let gifCount = 0;
    let created = 0;
    let revoked = 0;
    const live = new Set<string>();
    const gifByImage = new WeakMap<HTMLImageElement, boolean>();
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    );
    if (descriptor?.get !== undefined && descriptor.set !== undefined) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value: string) {
          const wasGif = gifByImage.get(this) === true;
          const isGif = typeof value === "string" && value.startsWith("data:image/gif");
          if (wasGif !== isGif) gifCount += isGif ? 1 : -1;
          gifByImage.set(this, isGif);
          descriptor.set!.call(this, value);
        },
      });
    }
    const createUrl = URL.createObjectURL.bind(URL);
    const revokeUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (source) => {
      const url = createUrl(source);
      live.add(url);
      created++;
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (live.delete(url)) revoked++;
      revokeUrl(url);
    };
    Object.defineProperty(window, "__tutorboardMediaCycle", {
      configurable: false,
      value: {
        snapshot: () => ({
          activeGifElements: gifCount,
          activeBlobUrls: live.size,
          createdBlobUrls: created,
          revokedBlobUrls: revoked,
        }),
      },
    });
  });
}

async function lifecycleSnapshot(page: Page): Promise<MediaLifecycleMetrics> {
  return page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __tutorboardMediaCycle?: { snapshot(): MediaLifecycleMetrics };
      }
    ).__tutorboardMediaCycle;
    if (probe === undefined) throw new Error("Lifecycle observer is missing");
    return probe.snapshot();
  });
}

async function rasterSnapshot(page: Page): Promise<RasterDiagnostics> {
  const stage = page.getByTestId("board-stage");
  const attrs = await Promise.all([
    stage.getAttribute("data-raster-active-decoded-count"),
    stage.getAttribute("data-raster-active-estimated-decoded-bytes"),
    stage.getAttribute("data-raster-decode-started-count"),
    stage.getAttribute("data-raster-released-count"),
  ]);
  const [active, bytes, started, released] = attrs.map((value) =>
    value === null ? NaN : Number(value),
  );
  for (const value of [active, bytes, started, released]) {
    if (!Number.isFinite(value)) {
      throw new Error("Raster diagnostics were not published");
    }
  }
  return {
    activeCount: active!,
    activeBytes: bytes!,
    startedCount: started!,
    releasedCount: released!,
  };
}

async function importDocument(
  page: Page,
  document: ReturnType<typeof createMediaPerformanceDocument>,
): Promise<void> {
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "f332d-cycle.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp("^" + document.order.length + " объект", "u"),
  );
  const close = page.getByRole("button", {
    name: "Закрыть настройки доски",
  });
  if (await close.isVisible()) await close.click();
}

async function afterGarbageCollection(page: Page, chromium: boolean): Promise<number | null> {
  if (!chromium) return null;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.enable");
    await session.send("HeapProfiler.collectGarbage");
    await session.send("Performance.enable");
    const metrics = await session.send("Performance.getMetrics");
    return metrics.metrics.find(({ name }) => name === "JSHeapUsedSize")?.value ?? null;
  } finally {
    await session.detach();
  }
}

async function frameP95(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const gaps: number[] = [];
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 30; i++) {
      const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      gaps.push(now - previous);
      previous = now;
    }
    gaps.sort((a, b) => a - b);
    return gaps[Math.ceil(gaps.length * 0.95) - 1] ?? 0;
  });
}

async function runCycles(
  page: Page,
  testInfo: TestInfo,
  cycles: number,
  options: MediaPerformanceDocumentOptions,
): Promise<void> {
  await installLifecycleObserver(page);
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  const blank = createMediaPerformanceDocument();
  const populated = createMediaPerformanceDocument({
    ...options,
    largeStaticDataUrl: representativePng(),
  });
  const chromium = testInfo.project.name === "chromium";
  const initialHeap = await afterGarbageCollection(page, chromium);
  const results: CycleResult[] = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    await importDocument(page, populated);
    await expect
      .poll(async () => (await rasterSnapshot(page)).activeCount)
      .toBeGreaterThanOrEqual(1);
    const afterLoad = await rasterSnapshot(page);
    const gifExpected = options.gifCount ?? 0;
    if (gifExpected > 0) {
      await expect
        .poll(async () => (await lifecycleSnapshot(page)).activeGifElements)
        .toBeGreaterThanOrEqual(gifExpected);
    }
    await importDocument(page, blank);
    await expect
      .poll(async () => (await rasterSnapshot(page)).activeCount)
      .toBe(0);
    await expect
      .poll(async () => (await rasterSnapshot(page)).activeBytes)
      .toBe(0);
    await expect
      .poll(async () => (await lifecycleSnapshot(page)).activeGifElements)
      .toBe(0);
    const afterClear = await rasterSnapshot(page);
    const lifecycle = await lifecycleSnapshot(page);
    expect(lifecycle.activeBlobUrls).toBe(0);
    const p95 = await frameP95(page);
    const heap = await afterGarbageCollection(page, chromium);
    results.push({
      cycle: cycle + 1,
      afterLoad,
      afterClear,
      lifecycle,
      frameP95Ms: p95,
      heapAfterGcBytes: heap,
    });
    expect(afterClear.activeBytes).toBe(0);
    expect(afterClear.activeCount).toBe(0);
    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(180);
  }
  // Snapshot totals count retained/closed resources; the active working set
  // must return to zero, regardless of intentionally durable document history.
  expect(results.at(-1)?.afterClear.activeBytes).toBe(0);
  const measuredHeap = results.map((x) => x.heapAfterGcBytes).filter(
    (value): value is number => value !== null,
  );
  const report = {
    kind: "tutorboard.media-cache-cycles/v1",
    browser: testInfo.project.name,
    cycles,
    input: {
      gifCount: options.gifCount ?? 0,
      staticCount: options.staticCount ?? 0,
      largeImage: [largeImageWidth, largeImageHeight],
      mixed: options.mixed ?? false,
    },
    baselineHeapAfterGcBytes: initialHeap,
    maxHeapAfterGcBytes: measuredHeap.length === 0 ? null : Math.max(...measuredHeap),
    results,
  };
  console.info("MEDIA_CACHE_CYCLES", JSON.stringify(report));
  await testInfo.attach("media-cache-cycles.json", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(report, null, 2)),
  });
  // The JS heap includes document undo/history and is noisy across V8 versions.
  // Treat it as reported evidence until a stable machine-specific budget exists.
}

test("@smoke F3.3.2-D repeated media mount/unmount returns to zero", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await runCycles(page, testInfo, smokeCycles, {
    staticCount: 5,
    gifCount: 3,
    mixed: true,
  });
});

test("@media-cache-soak F3.3.2-D extended 12-cycle media lifetime profile", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(
    testInfo.project.name !== "chromium",
    "Extended heap profiling uses Chromium CDP.",
  );
  await runCycles(page, testInfo, soakCycles, {
    staticCount: 12,
    gifCount: 8,
    mixed: true,
  });
});
