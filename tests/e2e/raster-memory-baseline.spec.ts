import { expect, test, type Page } from "@playwright/test";
const rasterWidth = 4_096;
const rasterHeight = 3_072;
const rasterCount = 2;
const previousFullDecodeBytes = rasterWidth * rasterHeight * 4 * rasterCount;
const rasterCacheBudgetPerFixtureBytes = 16 * 1024 * 1024;

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, "__tutorboardRasterFrameGaps", []);
    Reflect.set(window, "__tutorboardRasterLongTasks", []);
    let previousFrameAt = performance.now();
    const captureFrameGap = (now: number) => {
      const stored: unknown = Reflect.get(
        window,
        "__tutorboardRasterFrameGaps",
      );
      if (Array.isArray(stored)) {
        stored.push(Math.max(0, now - previousFrameAt));
        if (stored.length > 600) stored.shift();
      }
      previousFrameAt = now;
      requestAnimationFrame(captureFrameGap);
    };
    requestAnimationFrame(captureFrameGap);
    const supported =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    Reflect.set(window, "__tutorboardRasterLongTaskSupported", supported);
    if (!supported) return;
    const observer = new PerformanceObserver((list) => {
      const stored: unknown = Reflect.get(
        window,
        "__tutorboardRasterLongTasks",
      );
      if (!Array.isArray(stored)) return;
      for (const entry of list.getEntries()) stored.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: true });
  });
}

test("@smoke bounds and coalesces large static raster decoding", async ({
  page,
}) => {
  await installLongTaskObserver(page);
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();

  const encodedBytes = await page.evaluate(
    async ({ count, height, width }) => {
      const canvas = document.createElement("canvas");
      canvas.height = height;
      canvas.width = width;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("2D canvas is unavailable.");
      context.fillStyle = "rgb(24, 94, 107)";
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) =>
            value === null
              ? reject(new Error("PNG encoding failed."))
              : resolve(value),
          "image/png",
        );
      });
      canvas.height = 1;
      canvas.width = 1;

      const frameGaps: unknown = Reflect.get(
        window,
        "__tutorboardRasterFrameGaps",
      );
      if (Array.isArray(frameGaps)) frameGaps.length = 0;
      const longTasks: unknown = Reflect.get(
        window,
        "__tutorboardRasterLongTasks",
      );
      if (Array.isArray(longTasks)) longTasks.length = 0;

      const files = Array.from(
        { length: count },
        (_value, index) =>
          new File([blob], `large-raster-${index + 1}.png`, {
            type: "image/png",
          }),
      );
      const pasteEvent = new Event("paste", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          items: files.map((file) => ({
            getAsFile: () => file,
            kind: "file",
            type: file.type,
          })),
        },
      });
      window.dispatchEvent(pasteEvent);
      return blob.size;
    },
    { count: rasterCount, height: rasterHeight, width: rasterWidth },
  );
  expect(encodedBytes).toBeLessThan(8 * 1024 * 1024);

  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  const stage = page.getByTestId("board-stage");
  await expect
    .poll(async () =>
      Number(
        (await stage.getAttribute("data-raster-decode-completed-count")) ?? 0,
      ),
    )
    .toBe(1);

  const metrics = {
    activeDecodedCount: Number(
      (await stage.getAttribute("data-raster-active-decoded-count")) ?? "NaN",
    ),
    activeEstimatedDecodedBytes: Number(
      (await stage.getAttribute(
        "data-raster-active-estimated-decoded-bytes",
      )) ?? "NaN",
    ),
    decodeStartedCount: Number(
      (await stage.getAttribute("data-raster-decode-started-count")) ?? "NaN",
    ),
    duplicateDecodeStartCount: Number(
      (await stage.getAttribute("data-raster-duplicate-decode-start-count")) ??
        "NaN",
    ),
    maxDecodeMs: Number(
      (await stage.getAttribute("data-raster-max-decode-ms")) ?? "NaN",
    ),
    peakEstimatedDecodedBytes: Number(
      (await stage.getAttribute("data-raster-peak-estimated-decoded-bytes")) ??
        "NaN",
    ),
  };
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const browserEvidence = await page.evaluate(() => {
    const rawFrameGaps: unknown = Reflect.get(
      window,
      "__tutorboardRasterFrameGaps",
    );
    const frameGaps = Array.isArray(rawFrameGaps)
      ? rawFrameGaps.filter(
          (value): value is number => typeof value === "number",
        )
      : [];
    const stored: unknown = Reflect.get(window, "__tutorboardRasterLongTasks");
    const durations = Array.isArray(stored)
      ? stored.filter((value): value is number => typeof value === "number")
      : [];
    return {
      frameGapCount: frameGaps.length,
      maxFrameGapMs: frameGaps.length === 0 ? 0 : Math.max(...frameGaps),
      longTasks: {
        count: durations.length,
        maxMs: durations.length === 0 ? 0 : Math.max(...durations),
        supported:
          Reflect.get(window, "__tutorboardRasterLongTaskSupported") === true,
      },
    };
  });

  expect(metrics.activeDecodedCount).toBe(1);
  expect(metrics.decodeStartedCount).toBe(1);
  expect(metrics.duplicateDecodeStartCount).toBe(0);
  expect(metrics.activeEstimatedDecodedBytes).toBeLessThanOrEqual(
    rasterCacheBudgetPerFixtureBytes,
  );
  expect(metrics.peakEstimatedDecodedBytes).toBeLessThanOrEqual(
    rasterCacheBudgetPerFixtureBytes,
  );
  expect(metrics.activeEstimatedDecodedBytes).toBeLessThan(
    previousFullDecodeBytes / 4,
  );
  expect(metrics.maxDecodeMs).toBeGreaterThanOrEqual(0);
  expect(browserEvidence.frameGapCount).toBeGreaterThan(0);
  expect(browserEvidence.maxFrameGapMs).toBeGreaterThanOrEqual(0);

  console.info(
    "RASTER_MEMORY_CACHE",
    JSON.stringify({
      ...metrics,
      previousFullDecodeBytes,
      rasterCacheBudgetPerFixtureBytes,
      browserEvidence,
      rasterCount,
      rasterHeight,
      rasterWidth,
    }),
  );

  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected board bounds.");
  await page.mouse.click(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height * 0.75,
    { button: "right" },
  );
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect
    .poll(async () =>
      Number(
        (await stage.getAttribute("data-raster-active-decoded-count")) ?? -1,
      ),
    )
    .toBe(0);
  await expect
    .poll(async () =>
      Number(
        (await stage.getAttribute(
          "data-raster-active-estimated-decoded-bytes",
        )) ?? -1,
      ),
    )
    .toBe(0);
});
