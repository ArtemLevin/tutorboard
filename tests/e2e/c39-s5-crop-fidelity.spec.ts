import { createRequire } from "node:module";

import { expect, test, type Browser } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  readonly PNG: {
    readonly sync: {
      readonly read: (bytes: Buffer) => {
        readonly width: number;
        readonly height: number;
        readonly data: Buffer;
      };
    };
  };
};

async function mountBoard(browser: Browser, a2: boolean) {
  const context = await browser.newContext({
    viewport: { width: 1240, height: 820 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript((enable) => {
    Reflect.set(window, "__tutorBoardC39S5A2", enable);
  }, a2);
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  const document = createDenseBoardDocument({
    strokeCount: 320,
    visibleStrokeCount: 320,
    staticCount: 10,
    gifCount: 0,
    strokeGeometry: "varied",
    zOrderPattern: "trailing",
  });
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    name: "s5-fidelity.tutorboard.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByTestId("object-count")).toHaveText(/^330 объект/u);
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  if (await settings.isVisible()) {
    await settings
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
  }
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-c39-s5-a2-enabled", String(a2));
  if (a2) {
    await expect
      .poll(async () =>
        Number(await stage.getAttribute("data-c39-s5-a2-candidate-count")),
      )
      .toBeGreaterThanOrEqual(80);
    await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "1", {
      timeout: 20_000,
    });
    await expect(stage).toHaveAttribute("data-c39-s5-a2-cache-failures", "0");
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  return { context, page, stage };
}

function compareScreenshots(a: Buffer, b: Buffer) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  expect([left.width, left.height]).toEqual([right.width, right.height]);
  let changed = 0;
  let worstChannel = 0;
  let sumDifference = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    const gap = Math.max(
      Math.abs(left.data[index]! - right.data[index]!),
      Math.abs(left.data[index + 1]! - right.data[index + 1]!),
      Math.abs(left.data[index + 2]! - right.data[index + 2]!),
      Math.abs(left.data[index + 3]! - right.data[index + 3]!),
    );
    if (gap > 0) changed += 1;
    worstChannel = Math.max(worstChannel, gap);
    sumDifference += gap;
  }
  return {
    changedPixels: changed,
    totalPixels: left.width * left.height,
    maxChannelDifference: worstChannel,
    averageMaxChannelDifference: sumDifference / (left.width * left.height),
  };
}

test("@c39-s5-fidelity experimental crop keeps the original pixels and hit interaction", async ({
  browser,
}, info) => {
  test.setTimeout(150_000);
  const control = await mountBoard(browser, false);
  const candidate = await mountBoard(browser, true);
  try {
    const baselinePixels = await control.stage.screenshot({
      animations: "disabled",
    });
    const cachedPixels = await candidate.stage.screenshot({
      animations: "disabled",
    });
    const comparison = compareScreenshots(baselinePixels, cachedPixels);
    console.info("C39_S5_S3_PIXEL_PARITY " + JSON.stringify(comparison));
    await info.attach("c39-s5-a0.png", {
      body: baselinePixels,
      contentType: "image/png",
    });
    await info.attach("c39-s5-a2.png", {
      body: cachedPixels,
      contentType: "image/png",
    });
    // Exact equality is the intended gate; preserve all evidence on failure.
    expect(comparison.changedPixels).toBe(0);

    for (const { page, stage } of [control, candidate]) {
      // Selection is executed by the real app event flow, including Konva
      // getIntersection on its original interactive shape nodes.
      await page.keyboard.press("v");
      const bounds = await stage.boundingBox();
      expect(bounds).not.toBeNull();
      if (bounds === null) continue;
      await page.mouse.click(bounds.x + 90, bounds.y + 182);
      await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
      await page.keyboard.press("Control+z");
      await expect(stage).toHaveAttribute(
        "data-wheel-cache-retained-runs",
        "0",
      );
    }
  } finally {
    await candidate.context.close();
    await control.context.close();
  }
});
