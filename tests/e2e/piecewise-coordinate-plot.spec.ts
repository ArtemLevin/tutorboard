import { expect, test } from "@playwright/test";

import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

test("creates three branches and a distinct point through the plot editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Развернуть инструменты" }).hover();
  await page.getByRole("button", { name: "Математика" }).click();
  await page
    .getByRole("menuitemradio", { name: "Координатная плоскость (G)" })
    .click();
  await openCoordinatePlotEditorByRightDoubleClick(page);

  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  const branches = editor.getByRole("list", {
    name: "Графики на координатной плоскости",
  });
  await expect(branches.locator("li")).toHaveCount(1);

  await editor.getByRole("button", { name: "+ Кусочная" }).click();
  await expect(branches.locator("li")).toHaveCount(2);

  await editor.getByLabel("Точка разбиения кусочной функции").fill("2");
  await editor.getByRole("button", { name: "+ Кусочная" }).click();
  await expect(branches.locator("li")).toHaveCount(3);

  await editor.getByLabel("Точка разбиения кусочной функции").fill("0");
  await editor.getByRole("button", { name: "+ Точка" }).click();
  await expect(branches.locator("li")).toHaveCount(4);

  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  const advanced = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  await expect(
    advanced.getByRole("button", { name: "Удалить всю кусочную функцию" }),
  ).toBeVisible();
  await expect(advanced.getByLabel("Включить левый конец ветви")).toBeChecked();
  await expect(
    advanced.getByLabel("Включить правый конец ветви"),
  ).toBeChecked();
  await advanced.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );
});
