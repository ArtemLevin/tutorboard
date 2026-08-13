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

test("keeps Shapes grouped inside Drawing without a separate trigger", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Фигуры" })).toHaveCount(0);
  await page.getByRole("button", { name: "Рисование" }).click();
  const menu = page.getByRole("menu", { name: "Меню рисования" });
  await expect(
    menu.getByRole("menuitemradio", { name: "Прямоугольник (R)" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitemradio", { name: "Эллипс (E)" }),
  ).toBeVisible();
  await menu
    .getByRole("menuitemradio", { name: "Правильный многоугольник (N)" })
    .click();

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
