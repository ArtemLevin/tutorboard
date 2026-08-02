import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("creates and persists explicit and parametric plot series", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await openCoordinatePlotEditorByRightDoubleClick(page);
  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  await expect(editor).toBeVisible();

  const editorZIndex = await editor.evaluate((element) =>
    Number.parseInt(getComputedStyle(element).zIndex, 10),
  );
  const diagnosticsZIndex = await page
    .getByRole("complementary", { name: "Диагностика Smart Ink" })
    .evaluate((element) =>
      Number.parseInt(getComputedStyle(element).zIndex, 10),
    );
  expect(editorZIndex).toBeGreaterThan(diagnosticsZIndex);

  await editor.getByLabel("Формула явной функции").fill("x^3-2*x");
  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  await expect(advancedEditor).toBeVisible();
  await advancedEditor
    .getByRole("button", { name: "+ Параметрическая кривая" })
    .click();
  await advancedEditor.getByLabel("Параметрическая формула x").fill("2*cos(t)");
  await advancedEditor.getByLabel("Параметрическая формула y").fill("2*sin(t)");
  await advancedEditor.getByRole("button", { name: "Сохранить" }).click();
  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам", exact: true })
    .click();
  await expect(advancedEditor).toBeHidden();
  await expect(editor.getByText("Изменения сохранены")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const document = JSON.parse(await readFile(path, "utf8")) as {
    readonly objects: Readonly<
      Record<
        string,
        {
          readonly definition?: {
            readonly series?: readonly {
              readonly expression?: string;
              readonly kind?: string;
              readonly xExpression?: string;
              readonly yExpression?: string;
            }[];
          };
          readonly kind?: string;
        }
      >
    >;
  };
  const plot = Object.values(document.objects).find(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  expect(plot?.definition?.series).toEqual([
    expect.objectContaining({ expression: "x^3-2*x", kind: "explicit" }),
    expect.objectContaining({
      kind: "parametric",
      xExpression: "2*cos(t)",
      yExpression: "2*sin(t)",
    }),
  ]);
});
