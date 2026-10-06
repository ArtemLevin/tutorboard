import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

const rasterWidth = 4_096;
const rasterHeight = 3_072;
const rasterCount = 2;
const expectedDecodedBytes = rasterWidth * rasterHeight * 4 * rasterCount;

function largeCompressiblePng(): Buffer {
  const png = new PNG({ height: rasterHeight, width: rasterWidth });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 24;
    png.data[offset + 1] = 94;
    png.data[offset + 2] = 107;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

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

  const raster = largeCompressiblePng();
  expect(raster.byteLength).toBeLessThan(8 * 1024 * 1024);

  await page.getByRole("button", { name: "Медиа" }).click();
  await page.getByLabel("Вставить изображения").setInputFiles(
    Array.from({ length: rasterCount }, (_value, index) => ({
      buffer: raster,
      mimeType: "image/png",
      name: `large-raster-${index + 1}.png`,
    })),
  );

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
