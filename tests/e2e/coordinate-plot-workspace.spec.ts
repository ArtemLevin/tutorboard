import { expect, test } from "@playwright/test";

import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

test("guides formula entry, graph selection and domain editing", async ({
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
  await expect(editor.getByText("Шаг 1")).toBeVisible();
  await expect(editor.getByText("Шаг 2")).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "+ Добавить функцию" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Разделить ветвь" }),
  ).toBeHidden();

  await editor.getByRole("button", { name: "Показать график" }).click();
  await expect(editor).toHaveAttribute("data-preview-mode", "true");
  await editor.getByRole("button", { name: "Полный редактор" }).click();
  await expect(editor).toHaveAttribute("data-preview-mode", "false");

  const expression = editor.getByLabel("Математическое выражение графика");
  await expect(expression).toHaveValue("y = 2*x+a");
  await editor.getByRole("button", { name: "y=x^2" }).click();
  await expect(expression).toHaveValue("y = x^2");

  await editor.getByText("Область определения", { exact: true }).click();
  await editor.getByLabel("Левая граница x").fill("-2");
  await editor.getByLabel("Правая граница x").fill("3");
  await expect(editor.getByLabel("Левая граница x")).toHaveValue("-2");
  await expect(editor.getByLabel("Правая граница x")).toHaveValue("3");

  await editor.getByRole("button", { name: "+ Добавить функцию" }).click();
  const graphList = editor.getByRole("list", {
    name: "Графики на координатной плоскости",
  });
  await expect(graphList.locator("li")).toHaveCount(2);
  await expect(expression).toHaveValue("y = x");
  await graphList.locator("li").first().getByRole("button").first().click();
  await expect(expression).toHaveValue("y = x^2");

  await editor.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );
});
