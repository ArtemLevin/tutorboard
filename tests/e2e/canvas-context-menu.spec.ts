import { expect, test } from "@playwright/test";

test("uses the empty-canvas context menu for text, paste and clearing", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  const openMenuAt = async (x: number, y: number) => {
    await page.mouse.click(bounds.x + x, bounds.y + y, { button: "right" });
    await expect(page.getByRole("menu", { name: "Меню холста" })).toBeVisible();
  };

  await openMenuAt(360, 220);
  await expect(page.getByRole("menuitem", { name: "Вставить" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Текст" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("first-object-position")).toHaveText(
    "Объект: 360, 220",
  );

  await page.keyboard.press("Control+c");
  await openMenuAt(580, 300);
  await page.getByRole("menuitem", { name: "Вставить" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");

  await openMenuAt(760, 380);
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Очистить холст?" });
  await expect(dialog).toContainText("Будут удалены все объекты (2)");
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");

  await openMenuAt(760, 380);
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
});

test("keeps right-drag canvas panning separate from the context menu", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.move(bounds.x + 500, bounds.y + 300);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(bounds.x + 570, bounds.y + 350, { steps: 5 });
  await page.mouse.up({ button: "right" });

  await expect(page.getByRole("menu", { name: "Меню холста" })).toHaveCount(0);
  await expect(page.getByTestId("viewport-offset")).toHaveText("x 70 · y 50");
});

test("copies a selected object from its right-click menu", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height * 0.38,
  };

  await page.keyboard.press("r");
  await page.mouse.move(center.x - 70, center.y - 50);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.keyboard.press("v");
  const contour = { x: center.x - 70, y: center.y };
  await page.mouse.click(contour.x, contour.y);
  await page.mouse.click(contour.x, contour.y, { button: "right" });

  const selectionMenu = page.getByRole("menu", { name: "Меню выделения" });
  await expect(selectionMenu).toBeVisible();
  await selectionMenu.getByRole("menuitem", { name: "Копировать" }).click();
  await expect(page.getByText("Скопировано: 1")).toBeVisible();

  await page.mouse.click(bounds.x + 120, bounds.y + 120, { button: "right" });
  const canvasMenu = page.getByRole("menu", { name: "Меню холста" });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole("menuitem", { name: "Вставить" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
});
