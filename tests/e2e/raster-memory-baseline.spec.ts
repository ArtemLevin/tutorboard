import { expect, test, type Page } from "@playwright/test";
const rasterWidth = 4_096;
const rasterHeight = 3_072;
const rasterCount = 2;
const expectedDecodedBytes = rasterWidth * rasterHeight * 4 * rasterCount;

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, "__tutorboardRasterLongTasks", []);
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

test("@smoke captures duplicate full-resolution decode baseline for large raster images", async ({
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
    .toBe(rasterCount);

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
  const longTaskEvidence = await page.evaluate(() => {
    const stored: unknown = Reflect.get(window, "__tutorboardRasterLongTasks");
    const durations = Array.isArray(stored)
      ? stored.filter((value): value is number => typeof value === "number")
      : [];
    return {
      count: durations.length,
      maxMs: durations.length === 0 ? 0 : Math.max(...durations),
      supported:
        Reflect.get(window, "__tutorboardRasterLongTaskSupported") === true,
    };
  });

  expect(metrics.activeDecodedCount).toBe(rasterCount);
  expect(metrics.decodeStartedCount).toBe(rasterCount);
  expect(metrics.duplicateDecodeStartCount).toBeGreaterThanOrEqual(1);
  expect(metrics.activeEstimatedDecodedBytes).toBeGreaterThanOrEqual(
    expectedDecodedBytes,
  );
  expect(metrics.peakEstimatedDecodedBytes).toBeGreaterThanOrEqual(
    expectedDecodedBytes,
  );
  expect(metrics.maxDecodeMs).toBeGreaterThanOrEqual(0);

  console.info(
    "RASTER_MEMORY_BASELINE",
    JSON.stringify({
      ...metrics,
      expectedDecodedBytes,
      longTaskEvidence,
      rasterCount,
      rasterHeight,
      rasterWidth,
    }),
  );
});
