import { expect, test, type Page, type Locator } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

interface ZoomProfile {
  readonly frameGapsMs: readonly number[];
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly over50Ms: number;
  readonly transformerSyncEvents: number;
}

async function profileZoom(page: Page, stage: Locator): Promise<ZoomProfile> {
  await page.evaluate(() => {
    const state = { frames: [] as number[], last: 0, active: true };
    const scoped = window as Window & { __clearZoomProbe?: typeof state };
    scoped.__clearZoomProbe = state;
    window.__tutorBoardC37Trace = { events: [] };
    const frame = (at: number) => {
      if (!state.active) return;
      if (state.last !== 0 && state.frames.length < 512)
        state.frames.push(at - state.last);
      state.last = at;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let i = 0; i < 24; i += 1) await page.mouse.wheel(0, -45);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-viewport-zoom")))
    .toBeGreaterThan(5);
  for (let i = 0; i < 24; i += 1) await page.mouse.wheel(0, 45);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-viewport-zoom")))
    .toBeLessThan(1.001);
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  return page.evaluate(() => {
    const scoped = window as Window & {
      __clearZoomProbe?: {
        frames: number[];
        last: number;
        active: boolean;
      };
    };
    const state = scoped.__clearZoomProbe;
    if (state === undefined) throw new Error("Zoom probe was not started");
    state.active = false;
    delete scoped.__clearZoomProbe;
    const gaps = state.frames;
    const ordered = [...gaps].sort((left, right) => left - right);
    const trace = window.__tutorBoardC37Trace;
    delete window.__tutorBoardC37Trace;
    return {
      frameGapsMs: gaps,
      p95Ms: ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0,
      maxMs: ordered.at(-1) ?? 0,
      over50Ms: gaps.filter((gap) => gap > 50).length,
      transformerSyncEvents:
        trace?.events.filter(
          (event) => event.kind === "viewport-transformer-sync",
        ).length ?? 0,
    };
  });
}

test("@smoke clear/zoom frame probe", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.goto("/");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Missing board stage");
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5,
  );
  const empty = await profileZoom(page, stage);

  const images = await page.evaluate(() =>
    Array.from({ length: 10 }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("2D rendering is unavailable");
      ctx.fillStyle = `rgb(${index * 18},90,170)`;
      ctx.fillRect(0, 0, 512, 512);
      return canvas.toDataURL("image/png");
    }),
  );
  const heavy = createDenseBoardDocument({
    strokeCount: 3000,
    strokeGeometry: "varied",
    visibleStrokeCount: 800,
    largeStaticDataUrls: images,
  });
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(heavy)),
    mimeType: "application/json",
    name: "clear-zoom-profile.json",
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
  await page.mouse.click(
    bounds.x + bounds.width * 0.9,
    bounds.y + bounds.height * 0.85,
    { button: "right" },
  );
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(stage).toHaveAttribute("data-visible-object-count", "0");
  await expect(stage).toHaveAttribute("data-raster-active-decoded-count", "0");
  await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "0");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );

  const afterClear = await profileZoom(page, stage);
  await testInfo.attach("clear-zoom-frame-comparison", {
    body: JSON.stringify({
      source: "synthetic",
      empty,
      afterClear,
      fixture: { strokes: 3000, png: 10, zoom: "1x -> ~6.3x -> 1x" },
    }),
    contentType: "application/json",
  });
  expect(empty.frameGapsMs.length).toBeGreaterThan(0);
  expect(afterClear.frameGapsMs.length).toBeGreaterThan(0);
  expect(empty.transformerSyncEvents).toBe(0);
  expect(afterClear.transformerSyncEvents).toBe(0);
  await expect(stage).toHaveAttribute("data-visible-object-count", "0");
  await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "0");
});
