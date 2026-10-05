import { expect, test, type Page } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

interface DenseBoardProfile {
  reset(): void;
  snapshot(): { readonly rasterDraws: number; readonly rafCallbacks: number };
  waitFrames(count: number): Promise<void>;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let rasterDraws = 0;
    let rafCallbacks = 0;
    const draw: unknown = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype,
      "drawImage",
    )?.value;
    if (typeof draw !== "function")
      throw new Error("Canvas drawImage is unavailable");
    const request = window.requestAnimationFrame.bind(window);
    CanvasRenderingContext2D.prototype.drawImage = function (
      image: CanvasImageSource,
      ...coordinates: number[]
    ) {
      if (
        image instanceof HTMLImageElement &&
        image.src.startsWith("data:image/png")
      )
        rasterDraws += 1;
      Reflect.apply(draw, this, [image, ...coordinates]);
    };
    window.requestAnimationFrame = (callback) =>
      request((timestamp) => {
        rafCallbacks += 1;
        callback(timestamp);
      });
    Reflect.set(window, "__denseBoardProfile", {
      reset: () => {
        rasterDraws = 0;
        rafCallbacks = 0;
      },
      snapshot: () => ({ rasterDraws, rafCallbacks }),
      async waitFrames(count: number) {
        for (let frame = 0; frame < count; frame += 1)
          await new Promise(request);
      },
    });
  });
});

async function waitFrames(page: Page, count = 8) {
  await page.evaluate(
    (frames) =>
      (
        Reflect.get(window, "__denseBoardProfile") as DenseBoardProfile
      ).waitFrames(frames),
    count,
  );
}

async function resetProfile(page: Page) {
  await page.evaluate(() =>
    (Reflect.get(window, "__denseBoardProfile") as DenseBoardProfile).reset(),
  );
}

async function snapshot(page: Page) {
  return page.evaluate(() =>
    (
      Reflect.get(window, "__denseBoardProfile") as DenseBoardProfile
    ).snapshot(),
  );
}

async function importBoard(
  page: Page,
  document: ReturnType<typeof createDenseBoardDocument>,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "dense-board.tutorboard.json",
  });
  await expect(page.getByTestId("object-count")).toHaveText(
    new RegExp(`^${document.order.length} объект`, "u"),
  );
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  if (await settings.isVisible()) {
    await settings
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
  }
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
}

test("@smoke drawing over 300 strokes and 10 images keeps committed rasters out of preview redraws", async ({
  page,
}) => {
  const document = createDenseBoardDocument();
  await importBoard(page, document);
  await expect
    .poll(async () => (await snapshot(page)).rasterDraws)
    .toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "Рисование" }).click();
  await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected board bounds");
  const y = bounds.y + bounds.height * 0.72;
  await page.mouse.move(bounds.x + 180, y);
  await page.mouse.down();
  await expect(stage).toHaveAttribute("data-wet-ink-active", "true");
  await waitFrames(page);
  await resetProfile(page);
  await page.mouse.move(bounds.x + 650, y + 20, { steps: 24 });
  await waitFrames(page);
  expect((await snapshot(page)).rasterDraws).toBe(0);
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("311 объекта");
  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("310 объекта");
});

test("@smoke eight GIFs share one loop, stop on clear and resume on undo", async ({
  page,
}) => {
  await importBoard(
    page,
    createDenseBoardDocument({ gifCount: 8, staticCount: 0, strokeCount: 0 }),
  );
  await waitFrames(page, 30);
  await resetProfile(page);
  await waitFrames(page, 60);
  const active = await snapshot(page);
  // One coordinator plus Konva's batched Layer draw per display frame, with
  // margin for pending setup/measurement-boundary work. Eight loops exceeded 500.
  expect(active.rafCallbacks).toBeGreaterThanOrEqual(60);
  expect(active.rafCallbacks).toBeLessThanOrEqual(140);
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Expected board bounds");
  await page.mouse.click(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height * 0.75,
    { button: "right" },
  );
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Ожидает сохранения",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  await waitFrames(page);
  await resetProfile(page);
  await waitFrames(page, 20);
  expect((await snapshot(page)).rafCallbacks).toBe(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("8 объекта");
  await waitFrames(page, 30);
  await resetProfile(page);
  await waitFrames(page, 20);
  expect((await snapshot(page)).rafCallbacks).toBeGreaterThanOrEqual(20);
});
