import { expect, test } from "@playwright/test";

test("undoes and redoes a complete drawing gesture", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 240, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 380, bounds.y + 280, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("1/0");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("0/1");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("1/0");
});
