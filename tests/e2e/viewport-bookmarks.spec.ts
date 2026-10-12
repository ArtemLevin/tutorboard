import { expect, test } from "@playwright/test";

test("@smoke bookmarks a viewport and restores it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByTestId("board-stage").hover();
  await page.mouse.wheel(0, -430);
  await expect(page.getByTestId("viewport-zoom")).not.toHaveText("100%");
  const initialOffset = await page.getByTestId("viewport-offset").textContent();
  const initialZoom = await page.getByTestId("viewport-zoom").textContent();

  await page.getByRole("button", { name: "Закладки областей" }).click();
  await page.getByRole("textbox", { name: "Название новой области" }).fill("Теория");
  await page.getByRole("button", { name: "Сохранить область" }).click();
  await page.getByRole("button", { name: "Закладки областей" }).click();
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await page.getByRole("button", { name: "Центрировать доску" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Закладки областей" }).click();
  await page.getByRole("button", { name: "Перейти: Теория" }).click();
  await expect(page.getByTestId("viewport-offset")).toHaveText(initialOffset ?? "");
  await expect(page.getByTestId("viewport-zoom")).toHaveText(initialZoom ?? "");

  await page.reload();
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByRole("button", { name: "Закладки областей" }).click();
  await expect(page.getByRole("button", { name: "Перейти: Теория" })).toBeVisible();
  await page.getByRole("button", { name: "Переименовать: Теория" }).click();
  await page.getByRole("textbox", { name: "Новое название: Теория" }).fill("Домашняя работа");
  await page.getByRole("button", { name: "Сохранить название: Теория" }).click();
  await expect(page.getByRole("button", { name: "Перейти: Домашняя работа" })).toBeVisible();
  await page.getByRole("button", { name: "Удалить: Домашняя работа" }).click();
  await expect(page.getByRole("button", { name: "Перейти: Домашняя работа" })).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("@smoke saves bookmark preferences separately from board document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByRole("button", { name: "Закладки областей" }).click();
  await page.getByRole("button", { name: "Сохранить область" }).click();
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).find(([key]) =>
      key.startsWith("tutorboard.viewport-bookmarks/1:"),
    ),
  );
  expect(stored?.[1]).toContain("tutorboard.viewport-bookmarks/1");
  expect(stored?.[1]).not.toContain("BoardDocument");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});
