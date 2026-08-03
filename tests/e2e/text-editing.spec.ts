import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("edits text as one committed history item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Текст (T)" }).click();
  await page.getByRole("textbox", { name: "Содержимое текста" }).fill("Before");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.click(bounds.x + 320, bounds.y + 240);
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const textPoint = { x: bounds.x + 330, y: bounds.y + 250 };
  await page.mouse.click(textPoint.x, textPoint.y);
  await rightDoubleClickAt(page, textPoint);

  const editor = page.getByRole("textbox", {
    name: "Редактор выбранного текста",
  });
  const editedText = String.raw`$x^2 + \alpha_1$`;
  await expect(editor).toHaveValue("Before");
  await editor.fill(editedText);
  await editor.blur();
  await expect(editor).toHaveValue(editedText);

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("textbox", { name: "Редактор выбранного текста" }),
  ).toHaveValue("Before");
});
