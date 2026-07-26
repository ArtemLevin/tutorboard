import { expect, test } from "@playwright/test";

test("supports keyboard movement, shortcut help and focus restoration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("toolbar", { name: "Управление полотном" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 300, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 400, bounds.y + 300);
  await page.mouse.up();
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 350, bounds.y + 250);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByTestId("first-object-position")).toHaveText(
    "Объект: 301, 210",
  );

  const shortcuts = page.getByRole("button", { name: "Горячие клавиши" });
  await shortcuts.click();
  await expect(
    page.getByRole("dialog", { name: "Горячие клавиши" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Горячие клавиши" }),
  ).toBeHidden();
  await expect(shortcuts).toBeFocused();
});
