import { expect, test } from "@playwright/test";

test("copies, pastes, cuts and restores one selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("r");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  const start = { x: bounds.x + 260, y: bounds.y + 180 };
  const finish = { x: bounds.x + 380, y: bounds.y + 280 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 4 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Выделение" }).click();
  await page.getByRole("menuitemradio", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 260, bounds.y + 230);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(page.getByText("Вставлено: 1")).toBeVisible();

  await page.keyboard.press("Control+x");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
});
