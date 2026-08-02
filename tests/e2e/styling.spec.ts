import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("edits the persisted style of a selected object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 250, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 390, bounds.y + 290, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const objectPoint = { x: bounds.x + 320, y: bounds.y + 235 };
  await page.mouse.click(objectPoint.x, objectPoint.y);
  await rightDoubleClickAt(page, objectPoint);

  await expect(
    page.getByRole("button", {
      name: /Заливка: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
    }),
  ).toHaveCount(5);
  await expect(
    page.getByRole("button", {
      name: /Обводка: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
    }),
  ).toHaveCount(5);

  const blueFill = page.getByRole("button", { name: "Заливка: Синий" });
  await blueFill.click();
  await expect(blueFill).toHaveAttribute("aria-pressed", "true");

  const greenStroke = page.getByRole("button", { name: "Обводка: Зелёный" });
  await greenStroke.click();
  await expect(greenStroke).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("spinbutton", { name: "Толщина обводки" }).fill("6");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина обводки" }),
  ).toHaveValue("6");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина обводки" }),
  ).not.toHaveValue("6");
});
