import { expect, test } from "@playwright/test";

test("opens a semantic catalog solid in the lazy 3D editor", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");

  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.42,
  );

  await page.getByRole("button", { name: "Открыть в 3D" }).click();
  const editor = page.getByRole("dialog", { name: "Куб" });
  await expect(editor).toBeVisible();
  await expect(editor.getByText("0 / 3")).toBeVisible();
  await expect(
    editor.getByRole("button", {
      name: "Отобразить выбранное сечение на доске",
    }),
  ).toBeDisabled();

  await editor.getByRole("button", { name: "Ортографическая" }).click();
  await expect(
    editor.getByRole("button", { name: "Перспективная" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Учебная задача" }).click();
  await expect(
    editor.getByRole("heading", { name: "Учебные сценарии" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Начать" }).first().click();
  await expect(
    editor.getByText("Прогноз → построение → объяснение → проверка"),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Начать прогноз" }).click();
  await expect(
    editor.getByRole("heading", { name: "Сначала предположите" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Проверить прогноз" }).click();
  await expect(
    editor.getByRole("heading", { name: "Постройте сечение по граням" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Закрыть 3D-окно" }).click();
  await expect(editor).toBeHidden();
});
