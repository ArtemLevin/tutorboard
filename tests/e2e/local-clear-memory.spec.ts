import { expect, test } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

test("@smoke clear releases prepared JSON memory and preserves Undo/Redo and subsequent saving", async ({
  page,
  browserName,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  // Chromium exposes precise heap measurements through CDP. Firefox runs
  // the same document/Undo/save workflow without this unsupported probe.
  const cdp =
    browserName === "chromium"
      ? await page.context().newCDPSession(page)
      : null;
  const heapBytes = async (): Promise<number> => {
    if (cdp === null) throw new Error("Heap probe requires Chromium CDP");
    await cdp.send("HeapProfiler.collectGarbage");
    const metrics = await cdp.send("Performance.getMetrics");
    const value = metrics.metrics.find(
      ({ name }) => name === "JSHeapUsedSize",
    )?.value;
    if (value === undefined) throw new Error("JS heap metric is unavailable");
    return value;
  };
  await cdp?.send("Performance.enable");
  const baselineBytes = cdp === null ? null : await heapBytes();
  const pngs = await page.evaluate(() =>
    Array.from({ length: 10 }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("2D canvas is unavailable");
      context.fillStyle = `rgb(${index * 20},70,130)`;
      context.fillRect(0, 0, 512, 512);
      context.fillStyle = "white";
      context.fillRect(index * 15, 80, 100, 250);
      return canvas.toDataURL("image/png");
    }),
  );
  const boardDocument = createDenseBoardDocument({
    strokeCount: 3000,
    strokeGeometry: "varied",
    visibleStrokeCount: 800,
    largeStaticDataUrls: pngs,
  });
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(boardDocument)),
    mimeType: "application/json",
    name: "clear-memory.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText("3010 объекта");
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  if (await settings.isVisible())
    await settings
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const stage = page.getByTestId("board-stage");
  const box = await stage.boundingBox();
  if (box === null) throw new Error("Board stage is unavailable");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  for (let revision = 0; revision < 16; revision += 1) {
    const previousHistory = await page
      .getByTestId("history-depth")
      .textContent();
    if (previousHistory === null)
      throw new Error("History diagnostic is unavailable");
    await page.mouse.wheel(0, revision % 2 === 0 ? -25 : 25);
    await expect(page.getByTestId("history-depth")).not.toHaveText(
      previousHistory,
    );
    await expect(page.getByTestId("persistence-status")).toHaveText(
      "Сохранено локально",
    );
  }
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.85, {
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  // Track the renderer itself: clearing must dispose the old Konva scene,
  // not merely detach its objects from a still-retained GPU surface.
  await stage.evaluate((element) => {
    element.dataset.preClearResourceGeneration = "old";
  });
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(stage).not.toHaveAttribute(
    "data-pre-clear-resource-generation",
    "old",
  );
  await expect(stage).toHaveAttribute("data-visible-object-count", "0");
  await expect(stage).toHaveAttribute("data-raster-active-decoded-count", "0");
  await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "0");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  if (baselineBytes !== null) {
    const clearedBytes = await heapBytes();
    await testInfo.attach("local-clear-memory", {
      body: JSON.stringify({
        baselineBytes,
        clearedBytes,
        historyDepth: await page.getByTestId("history-depth").textContent(),
      }),
      contentType: "application/json",
    });
    // Allows the original document retained by Undo and browser overhead.
    // The former 16 cached full JSON snapshots exceed this margin (>80 MiB
    // retained in the original reproduction, ~28 MiB after the fix).
    expect(clearedBytes - baselineBytes).toBeLessThan(48 * 1024 * 1024);
  }
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("3010 объекта");
  await expect(stage).not.toHaveAttribute("data-visible-object-count", "0");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await page.keyboard.press("r");
  await page.mouse.move(box.x + 180, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 380, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
});
