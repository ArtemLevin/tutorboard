import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
});

test("opens every grouped menu exclusively and restores focus after Escape", async ({
  page,
}) => {
  const groups = [
    ["Выделение", "Меню выделения"],
    ["Рисование", "Меню рисования"],
    ["Математика", "Меню математики"],
    ["ИИ-инструменты", "Меню ИИ"],
    ["Медиа", "Меню медиа"],
  ] as const;

  for (const [triggerName, menuName] of groups) {
    const trigger = page.getByRole("button", { name: triggerName });
    await trigger.click();
    await expect(page.getByRole("menu", { name: menuName })).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(1);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }

  const mediaTrigger = page.getByRole("button", { name: "Медиа" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(mediaTrigger).toBeFocused();
});

test("hides the Shapes trigger while preserving keyboard shape tools", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Фигуры" })).toHaveCount(0);
  await page.keyboard.press("n");

  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.polygon");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.move(bounds.x + 300, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 460, bounds.y + 320, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
});

test("shows an ephemeral laser trail while dragging without adding board objects", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Лазерная указка (K)" }).click();
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.move(bounds.x + 420, bounds.y + 220);

  await expect(stage).toHaveAttribute("data-laser-active", "true");
  await expect(stage).toHaveAttribute("data-laser-visible", "true");
  await expect(stage).toHaveAttribute("data-laser-trail-points", "0");

  await page.mouse.down({ button: "left" });
  await page.mouse.move(bounds.x + 480, bounds.y + 250, { steps: 4 });
  await page.mouse.move(bounds.x + 540, bounds.y + 210, { steps: 4 });
  await expect(stage).not.toHaveAttribute("data-laser-trail-points", "0");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");

  await page.mouse.up({ button: "left" });
  await expect(stage).not.toHaveAttribute("data-laser-trail-points", "0");
  await expect(stage).toHaveAttribute("data-laser-trail-points", "0", {
    timeout: 2_000,
  });

  await page.keyboard.press("h");
  await expect(stage).toHaveAttribute("data-laser-active", "false");
  await expect(stage).toHaveAttribute("data-laser-visible", "false");
});

test("@smoke auto-dismisses Smart Ink settings until the tool is switched", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const settings = page.getByRole("region", {
    name: "Первичные настройки инструмента",
  });

  await page.keyboard.press("i");
  await expect(settings).toBeVisible();
  await expect(settings).toHaveCount(0, { timeout: 5_000 });
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.smart-ink");

  await page.keyboard.press("p");
  await expect(settings).toBeVisible();
  await page.keyboard.press("i");
  await expect(settings).toBeVisible();
  await expect(settings).toHaveCount(0, { timeout: 5_000 });
});

test("@smoke keeps the desktop tool chooser compact and fully functional", async ({
  page,
}) => {
  const toolbar = page.getByRole("toolbar", { name: "Инструменты доски" });
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  if (toolbarBox === null) throw new Error("Tool dock has no bounds.");
  expect(toolbarBox.height).toBeLessThanOrEqual(52);

  const drawing = page.getByRole("button", { name: "Рисование" });
  const buttonBox = await drawing.boundingBox();
  expect(buttonBox).not.toBeNull();
  if (buttonBox === null) throw new Error("Tool button has no bounds.");
  expect(buttonBox.width).toBe(40);
  expect(buttonBox.height).toBe(40);

  await drawing.click();
  const menu = page.getByRole("menu", { name: "Меню рисования" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  if (menuBox === null) throw new Error("Tool menu has no bounds.");
  expect(menuBox.width).toBeLessThanOrEqual(300);
  await menu.getByRole("menuitemradio", { name: /Перо/ }).click();
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing-mode",
    "drawing.pen",
  );
});

test("@smoke retains touch-size controls without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const toolbar = page.getByRole("toolbar", { name: "Инструменты доски" });
  await expect(toolbar).toBeVisible();

  const button = toolbar.getByRole("button", { name: "Выделение" });
  const buttonBox = await button.boundingBox();
  expect(buttonBox).not.toBeNull();
  if (buttonBox === null) throw new Error("Mobile tool button has no bounds.");
  expect(buttonBox.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);

  await button.click();
  await expect(
    page.getByRole("menu", { name: "Меню выделения" }),
  ).toBeVisible();
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(pageOverflow).toBe(false);
});

test(
  "@smoke reopens Smart Ink settings on repeated activation and waits for pointer release",
  async ({ page }) => {
    const settings = page.getByRole("region", {
      name: "Первичные настройки инструмента",
    });
    await page.clock.install();
    const activate = async () => {
      await page.getByRole("button", { name: "ИИ-инструменты" }).click();
      await page.getByRole("menuitemradio", { name: "Smart Ink (I)" }).click();
    };
    await activate();
    await expect(settings).toBeVisible();
    await page.clock.fastForward(2_100);
    await expect(settings).toHaveCount(0);

    await activate();
    await expect(settings).toBeVisible();
      const opacity = page.getByRole("slider", {
        name: "Прозрачность инструмента",
      });
    const box = await opacity.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) throw new Error("Opacity slider has no bounds.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.fastForward(2_100);
    await expect(settings).toBeVisible();
    await page.mouse.up();
    await page.clock.fastForward(2_100);
    await expect(settings).toHaveCount(0);
});
