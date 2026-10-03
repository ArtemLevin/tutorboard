import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("edits the persisted style of a selected object", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("r");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 250, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 390, bounds.y + 290, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Выделение" }).click();
  await page.getByRole("menuitemradio", { name: "Выделение (V)" }).click();
  const objectPoint = { x: bounds.x + 280, y: bounds.y + 180 };
  await page.mouse.click(objectPoint.x, objectPoint.y);
  await rightDoubleClickAt(page, objectPoint);

  await expect(
    page.getByRole("button", {
      name: /Заливка: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
    }),
  ).toHaveCount(5);
  await expect(
    page.getByRole("button", {
      name: /Цвет: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
    }),
  ).toHaveCount(5);

  const blueFill = page.getByRole("button", { name: "Заливка: Синий" });
  await blueFill.click();
  await expect(blueFill).toHaveAttribute("aria-pressed", "true");

  const greenStroke = page.getByRole("button", { name: "Цвет: Зелёный" });
  await greenStroke.click();
  await expect(greenStroke).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("spinbutton", { name: "Толщина инструмента" }).fill("6");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина инструмента" }),
  ).toHaveValue("6");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина инструмента" }),
  ).not.toHaveValue("6");
});

test("keeps numeric stroke width authoritative after style presets", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("p");

  const width = page.getByRole("spinbutton", { name: "Толщина инструмента" });
  const styleTrigger = page.getByRole("button", { name: /Стиль линии:/ });

  await styleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Толстая" }).click();
  await expect(width).toHaveValue("6");

  await width.fill("1");
  await expect(width).toHaveValue("1");

  await styleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Волнистая" }).click();
  await expect(width).toHaveValue("1");

  await styleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Маркер" }).click();
  await expect(width).toHaveValue("10");

  await width.fill("3");
  await expect(width).toHaveValue("3");

  await styleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Точка-пунктир" }).click();
  await expect(width).toHaveValue("3");
});
