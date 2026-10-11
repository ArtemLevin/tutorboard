import { expect, test, type Browser } from "@playwright/test";

import { createDenseBoardDocument } from "../fixtures/dense-board.js";

async function mount(
  browser: Browser,
  options: { readonly interleaveMedia?: boolean; readonly dpr?: 1 | 2 } = {},
) {
  const dpr = options.dpr ?? 1;
  const context = await browser.newContext({
    viewport: { width: 1240, height: 820 },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Reflect.set(window, "__tutorBoardC39S5A2", true);
  });
  await page.goto("/");
  const fixture = createDenseBoardDocument({
    strokeCount: 320,
    visibleStrokeCount: 320,
    staticCount: 10,
    gifCount: 0,
    strokeGeometry: "varied",
    zOrderPattern: "trailing",
  });
  const images = fixture.order.filter((id) => id.includes(":image:"));
  const strokes = fixture.order.filter((id) => id.includes(":stroke:"));
  const document = options.interleaveMedia
    ? {
        ...fixture,
        order: [
          ...strokes.slice(0, 90),
          images[0]!,
          ...strokes.slice(90),
          ...images.slice(1),
        ],
      }
    : fixture;
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByLabel("Импорт документа JSON").setInputFiles({
    buffer: Buffer.from(JSON.stringify(document)),
    mimeType: "application/json",
    name: "c39-s5-s4-lifecycle.tutorboard.json",
  });
  const stage = page.getByTestId("board-stage");
  await expect(page.getByTestId("object-count")).toHaveText(/^330 объект/u);
  const dialog = page.getByRole("dialog", { name: "Настройки доски" });
  if (await dialog.isVisible()) {
    await dialog
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
  }
  await expect(stage).toHaveAttribute("data-c39-s5-a2-requested", "true");
  await expect(stage).toHaveAttribute(
    "data-c39-s5-a2-enabled",
    String(dpr === 1),
  );
  await expect(stage).toHaveAttribute(
    "data-c39-s5-a2-raster-supported",
    String(dpr === 1),
  );
  if (dpr === 1) {
    await expect
      .poll(() =>
        stage
          .getAttribute("data-c39-s5-a2-candidate-count")
          .then((value) => Number(value)),
      )
      .toBeGreaterThanOrEqual(80);
    await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "1", {
      timeout: 30_000,
    });
  } else {
    await expect(stage).toHaveAttribute("data-c39-s5-a2-candidate-count", "0");
    // Baseline may retain a legacy wheel cache; A2 has no shared lease.
    await expect(stage).toHaveAttribute("data-c39-s5-a2-retained-bytes", "0");
  }
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  return { context, page, stage };
}

test("@c39-s5-lifecycle pen-image-pen order, partial eraser and actual undo/redo survive cache invalidation", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { context, page, stage } = await mount(browser, {
    interleaveMedia: true,
  });
  try {
    // The cache must be live *before* the first actual edit.
    expect(
      Number(await stage.getAttribute("data-c39-s5-a2-retained-bytes")),
    ).toBeGreaterThan(0);
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("No BoardStage");
    await page.getByRole("button", { name: "Рисование" }).click();
    await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();
    await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
    // Match the proven upper-canvas coordinates used by server-sync E2E;
    // the lower viewport can overlap persistent floating controls.
    const y = bounds.y + 180;
    const xStart = bounds.x + 620;
    const xEnd = bounds.x + 730;
    await page.mouse.move(xStart, y);
    await page.mouse.down();
    await expect(stage).toHaveAttribute("data-drawing", "true");
    // Exercise real pointer drawing, asserting the committed document
    // below rather than a transient renderer-frame diagnostic.
    await page.mouse.move(xStart + 36, y, { steps: 5 });
    await page.mouse.move(xEnd, y, { steps: 20 });
    await page.mouse.up();
    await expect(page.getByTestId("object-count")).toHaveText("331 объекта");

    await page.keyboard.press("x");
    await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
    const eraseX = (xStart + xEnd) / 2;
    await page.mouse.move(eraseX, y - 28);
    await page.mouse.down();
    await page.mouse.move(eraseX, y + 28, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId("object-count")).toHaveText("334 объекта");

    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("object-count")).toHaveText("331 объекта");
    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByTestId("object-count")).toHaveText("334 объекта");
    await expect(page.getByTestId("persistence-status")).toHaveText(
      "Сохранено локально",
    );

    const bytes = Number(
      await stage.getAttribute("data-c39-s5-a2-retained-bytes"),
    );
    expect(bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(
      Number(await stage.getAttribute("data-wheel-cache-retained-runs")),
    ).toBeLessThanOrEqual(1);

    await page.reload();
    await expect(page.getByTestId("object-count")).toHaveText("334 объекта", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("board-stage")).toHaveAttribute(
      "data-c39-s5-a2-enabled",
      "true",
    );
    // After reload the UI displays the local storage *mode* label, while
    // the document count above proves the persisted eraser fragments exist.
    await expect(page.getByTestId("persistence-status")).toHaveText(
      "Локальное сохранение",
    );
  } finally {
    await context.close();
  }
});

test("@c39-s5-lifecycle 48 wheel sessions, clear, undo and unmount release all raster leases", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { context, page, stage } = await mount(browser);
  try {
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("No BoardStage");
    await page.mouse.move(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.5,
    );
    let previousWheelStart = Number(
      await stage.getAttribute("data-wheel-cache-last-wheel-start-ms"),
    );
    for (let index = 0; index < 48; index += 1) {
      await page.mouse.wheel(0, index % 2 === 0 ? -150 : 150);
      await expect
        .poll(async () =>
          Number(
            await stage.getAttribute("data-wheel-cache-last-wheel-start-ms"),
          ),
        )
        .toBeGreaterThan(previousWheelStart);
      previousWheelStart = Number(
        await stage.getAttribute("data-wheel-cache-last-wheel-start-ms"),
      );
      await expect(stage).toHaveAttribute(
        "data-wheel-gif-pause-active",
        "false",
        { timeout: 10_000 },
      );
      expect(
        Number(await stage.getAttribute("data-wheel-cache-retained-runs")),
        "at most one raster should remain prepared",
      ).toBeLessThanOrEqual(1);
      expect(
        Number(await stage.getAttribute("data-c39-s5-a2-retained-bytes")),
      ).toBeLessThanOrEqual(16 * 1024 * 1024);
    }
    await page.mouse.click(
      bounds.x + bounds.width * 0.75,
      bounds.y + bounds.height * 0.75,
      { button: "right" },
    );
    await page.getByRole("menuitem", { name: "Очистить холст" }).click();
    await page.getByRole("button", { name: "Очистить", exact: true }).click();
    await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
    await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "0");
    await expect(stage).toHaveAttribute("data-c39-s5-a2-retained-bytes", "0");

    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("object-count")).toHaveText("330 объекта");
    await expect(page.getByTestId("persistence-status")).toHaveText(
      "Сохранено локально",
    );
    await page.reload();
    await expect(page.getByTestId("object-count")).toHaveText("330 объекта", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("board-stage")).toHaveAttribute(
      "data-c39-s5-a2-enabled",
      "true",
    );
  } finally {
    await context.close();
  }
});

test("@c39-s5-lifecycle DPR2 uses baseline renderer without any A2 lease after wheel", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { context, page, stage } = await mount(browser, { dpr: 2 });
  try {
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("No BoardStage");
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    for (let index = 0; index < 4; index += 1) {
      await page.mouse.wheel(0, index % 2 === 0 ? 150 : -150);
    }
    await expect(stage).toHaveAttribute("data-c39-s5-a2-candidate-count", "0");
    await expect(stage).toHaveAttribute("data-c39-s5-a2-retained-bytes", "0");
    await expect(page.getByTestId("object-count")).toHaveText("330 объекта");
  } finally {
    await context.close();
  }
});

test("@c39-s5-lifecycle DPR transition releases A2 leases without re-enabling native cache", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { context, page, stage } = await mount(browser);
  try {
    expect(
      Number(await stage.getAttribute("data-c39-s5-a2-retained-bytes")),
    ).toBeGreaterThan(0);
    // This simulates the DPR value read by the renderer after moving between
    // displays. It tests cache invalidation, not physical device resizing.
    const changed = await page.evaluate(() =>
      Reflect.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: 2,
      }),
    );
    expect(changed).toBe(true);
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("No BoardStage");
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.wheel(0, 120);
    await expect(stage).toHaveAttribute(
      "data-c39-s5-a2-raster-supported",
      "false",
    );
    await expect(stage).toHaveAttribute(
      "data-c39-s5-a2-candidate-count",
      "0",
    );
    await expect(stage).toHaveAttribute(
      "data-wheel-cache-retained-runs",
      "0",
    );
    await expect(stage).toHaveAttribute(
      "data-c39-s5-a2-retained-bytes",
      "0",
    );
    await expect(page.getByTestId("object-count")).toHaveText("330 объекта");
  } finally {
    await context.close();
  }
});
