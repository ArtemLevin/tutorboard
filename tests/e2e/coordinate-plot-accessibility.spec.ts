import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

import { expect, test } from "@playwright/test";

test("protects a dirty plot draft and restores focus after discard", async ({
  page,
}) => {
  await page.goto("/");

  const workspace = page.getByRole("region", {
    name: "Рабочая область доски",
  });
  await page.keyboard.press("g");
  await openCoordinatePlotEditorByRightDoubleClick(page);

  const editor = page.getByTestId("coordinate-plot-editor");
  const formula = page.getByLabel("Формула явной функции");
  await expect(editor).toBeVisible();
  await expect(formula).toBeFocused();

  await formula.fill("x^4+1");
  await page.keyboard.press("Escape");

  const confirmation = page.getByRole("alertdialog", {
    name: "Несохранённые изменения",
  });
  await expect(confirmation).toBeVisible();

  await page.getByRole("button", { name: "Продолжить редактирование" }).click();
  await expect(confirmation).toBeHidden();
  await expect(formula).toHaveValue("x^4+1");
  await expect(formula).toBeFocused();

  await page.getByRole("button", { name: "Закрыть редактор графика" }).click();
  await page.getByRole("button", { name: "Закрыть без сохранения" }).click();

  await expect(editor).toBeHidden();
  await expect(workspace).toBeFocused();
});

test("saves a plot with Ctrl+Enter and closes cleanly with Escape", async ({
  page,
}) => {
  await page.goto("/");

  const workspace = page.getByRole("region", {
    name: "Рабочая область доски",
  });
  await page.keyboard.press("g");
  await openCoordinatePlotEditorByRightDoubleClick(page);

  const editor = page.getByTestId("coordinate-plot-editor");
  const formula = page.getByLabel("Формула явной функции");
  await formula.fill("sin(x)");

  await page.keyboard.press("Control+Enter");
  await expect(editor.getByText("Изменения сохранены")).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Сохранить" }),
  ).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(workspace).toBeFocused();
});

test("exposes formula diagnostics through ARIA relationships", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("g");
  await openCoordinatePlotEditorByRightDoubleClick(page);
  const formula = page.getByLabel("Формула явной функции");
  await formula.fill("q*x");

  await expect(formula).toHaveAttribute("aria-invalid", "true");
  const issueId = await formula.getAttribute("aria-describedby");
  expect(issueId).toBeTruthy();
  await expect(page.locator(`#${issueId}`)).not.toBeEmpty();
});
