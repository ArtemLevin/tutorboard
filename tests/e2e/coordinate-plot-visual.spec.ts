import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

import { expect, test } from "@playwright/test";

const databaseName = "tutorboard-local-v1";

async function resetLocalDatabase(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB deletion failed"));
      request.onblocked = () => reject(new Error("IndexedDB deletion blocked"));
    });
  }, databaseName);
  await page.reload();
}

test("coordinate plot editor visual matrix", async ({ page }, testInfo) => {
  await resetLocalDatabase(page);
  const mathTools = page.getByRole("button", { name: "Математика" });
  await expect(mathTools).toBeVisible();
  await mathTools.click();
  await page
    .getByRole("menuitemradio", { name: "Координатная плоскость (G)" })
    .click();
  await openCoordinatePlotEditorByRightDoubleClick(page);

  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue("2*x+a");
  await expect(editor.getByLabel("Ползунок параметра a")).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Навигация координатной плоскости" }),
  ).toBeVisible();

  const mobile = testInfo.project.name.includes("mobile");
  if (mobile) {
    const viewport = page.viewportSize();
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThanOrEqual(1);
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
    expect(box!.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 2);
  }

  await expect(page).toHaveScreenshot("coordinate-plot-functions.png", {
    fullPage: true,
  });

  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  await expect(advancedEditor).toBeVisible();
  await advancedEditor.getByRole("tab", { name: "Вид" }).click();
  await expect(
    advancedEditor.getByTestId("renderer-status-help"),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("coordinate-plot-view-statuses.png", {
    fullPage: true,
  });

  if (!mobile) {
    await advancedEditor.getByRole("tab", { name: "Функции" }).click();
    for (let index = 0; index < 11; index += 1) {
      await advancedEditor
        .getByRole("button", { name: "+ Явная функция" })
        .click();
    }
    await advancedEditor.getByRole("button", { name: "Сохранить" }).click();
    await advancedEditor
      .getByRole("button", { name: "К базовым настройкам", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Закрыть редактор графика" })
      .click();
    await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
    await expect(page).toHaveScreenshot("coordinate-plot-bounded-legend.png", {
      fullPage: true,
    });
  }
});
