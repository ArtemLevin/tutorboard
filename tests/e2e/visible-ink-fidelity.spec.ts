import { expect, test } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

test("@smoke keeps visible ink cache at full physical resolution when zoomed in", async ({
  page,
}) => {
  // The browser's native idle scheduler is intentionally nondeterministic.
  // Here we assert cache fidelity rather than benchmark idle scheduling.
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback) =>
      window.setTimeout(
        () => callback({ didTimeout: false, timeRemaining: () => 50 }),
        0,
      );
    window.cancelIdleCallback = (id) => window.clearTimeout(id);
  });
  await page.goto("/");
  const document = createDenseBoardDocument({
    strokeCount: 120,
    staticCount: 0,
  });
  document.viewport = { offset: { x: 0, y: 0 }, zoom: 2 };
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "zoomed-ink.tutorboard.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText("120 объекта");
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  if (await settings.isVisible()) {
    await settings
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
  }

  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-wheel-cache-prepared", "true");
  await expect(stage).toHaveAttribute(
    "data-wheel-cache-retained-runs",
    /[1-9]/,
  );
  const pixelRatio = Number(
    await stage.getAttribute("data-wheel-cache-pixel-ratio"),
  );
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  // Native Konva shape coordinates are in world units. DPR-only caching
  // produces visibly enlarged pixels in the zoomed-in working viewport.
  expect(pixelRatio).toBeGreaterThanOrEqual(2 * dpr);

  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected board canvas bounds.");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -190);
  await expect(stage).toHaveAttribute(
    "data-wheel-cache-last-wheel-used-prepared",
    "true",
  );
});
