import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("edits text as one committed history item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByRole("button", { name: "Рисование" }).click();
  await page.getByRole("menuitemradio", { name: "Текст (T)" }).click();
  await page.getByRole("textbox", { name: "Содержимое текста" }).fill("Before");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.click(bounds.x + 320, bounds.y + 240);
  await page.getByRole("button", { name: "Выделение" }).click();
  await page.getByRole("menuitemradio", { name: "Выделение (V)" }).click();
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

test("edits a new text draft directly on the board before one-step commit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("t");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.click(bounds.x + 360, bounds.y + 260);
  const editor = page.getByRole("textbox", {
    name: "Редактор текста на доске",
  });
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("object-count")).toContainText("0");

  await editor.fill(String.raw`$x^2 + \alpha$`);
  await expect(editor).toHaveValue(String.raw`$x^2 + \alpha$`);
  await expect(page.getByTestId("object-count")).toContainText("0");

  await editor.press("Control+Enter");
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toContainText("1");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toContainText("0");
});

test("cancels an unsaved text draft with Escape and switches to selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("t");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.click(bounds.x + 420, bounds.y + 300);
  const editor = page.getByRole("textbox", {
    name: "Редактор текста на доске",
  });
  await expect(editor).toBeVisible();
  await editor.fill("Черновик");

  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toContainText("0");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-selection-mode",
    "selection.select",
  );
});
