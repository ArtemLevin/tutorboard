import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

import { readFile } from "node:fs/promises";

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

async function localRevisionCount(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(async (name) => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB open failed"));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("revisions", "readonly");
        const countRequest = transaction.objectStore("revisions").count();
        countRequest.onerror = () =>
          reject(countRequest.error ?? new Error("Revision count failed"));
        countRequest.onsuccess = () => {
          database.close();
          resolve(countRequest.result);
        };
      };
    });
  }, databaseName);
}

test("discovers, persists, restores, duplicates and exports a production coordinate plot", async ({
  page,
}) => {
  await resetLocalDatabase(page);

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await openCoordinatePlotEditorByRightDoubleClick(page);
  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue("2*x+a");
  await expect(editor.getByLabel("Ползунок параметра a")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Расширенные настройки графика" }),
  ).toBeHidden();
  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  await expect(advancedEditor).toBeVisible();
  const persistenceStatus = page.getByTestId("persistence-status");
  const navigation = page.getByRole("toolbar", {
    name: "Навигация координатной плоскости",
  });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("radio", { name: "Только ось X" }).click();
  await expect(
    navigation.getByRole("radio", { name: "Только ось X" }),
  ).toHaveAttribute("aria-checked", "true");

  await advancedEditor.getByRole("tab", { name: "Вид" }).click();
  const xMinimum = advancedEditor.getByLabel("Минимальная граница X");
  const yMinimum = advancedEditor.getByLabel("Минимальная граница Y");
  const yMaximum = advancedEditor.getByLabel("Максимальная граница Y");
  const initialXMinimum = Number(await xMinimum.inputValue());
  const initialYMinimum = Number(await yMinimum.inputValue());
  await navigation.getByRole("button", { name: "Приблизить график" }).click();
  await expect
    .poll(async () => Number(await xMinimum.inputValue()))
    .not.toBe(initialXMinimum);
  await expect(yMinimum).toHaveValue(String(initialYMinimum));
  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();
  await navigation
    .getByRole("button", { name: "Вместить все графики" })
    .click();
  await expect(
    advancedEditor.getByTestId("renderer-status-help"),
  ).toContainText("Лимит детализации");

  const stage = page.locator(".konvajs-content");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const plotPoint = {
    x: stageBox!.x + stageBox!.width / 2 - 100,
    y: stageBox!.y + stageBox!.height / 2 + 80,
  };
  await page.mouse.move(plotPoint.x, plotPoint.y);
  await expect(stage).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(plotPoint.x + 24, plotPoint.y + 12);
  await expect(stage).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(stage).toHaveCSS("cursor", "grab");
  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();

  if (test.info().project.name === "chromium") {
    const beforePinchX = Number(await xMinimum.inputValue());
    const beforePinchY = Number(await yMinimum.inputValue());
    const beforePinchYSpan = Number(await yMaximum.inputValue()) - beforePinchY;
    await page.evaluate(({ x, y }) => {
      const target =
        window.document.querySelector<HTMLElement>(".konvajs-content");
      if (target === null) throw new Error("Konva stage is missing");
      const touch = (identifier: number, clientX: number, clientY: number) =>
        new Touch({ identifier, target, clientX, clientY });
      const start = [touch(1, x - 50, y), touch(2, x + 50, y)];
      const moved = [touch(1, x - 95, y + 10), touch(2, x + 95, y + 10)];
      target.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          changedTouches: start,
          targetTouches: start,
          touches: start,
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          changedTouches: moved,
          targetTouches: moved,
          touches: moved,
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          changedTouches: moved,
          targetTouches: [],
          touches: [],
        }),
      );
    }, plotPoint);
    await expect
      .poll(async () => Number(await xMinimum.inputValue()))
      .not.toBe(beforePinchX);
    await expect
      .poll(async () => Number(await yMinimum.inputValue()))
      .not.toBe(beforePinchY);
    await expect
      .poll(async () => {
        const currentMinimum = Number(await yMinimum.inputValue());
        const currentMaximum = Number(await yMaximum.inputValue());
        return Math.abs(currentMaximum - currentMinimum - beforePinchYSpan);
      })
      .toBeLessThan(1e-8);
  }
  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();
  await advancedEditor.getByRole("tab", { name: "Функции" }).click();
  await expect(persistenceStatus).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );

  await advancedEditor.getByText("Краткая справка по формулам").click();
  await expect(
    advancedEditor.getByText(/Тригонометрические функции используют радианы/),
  ).toBeVisible();

  const firstFormula = advancedEditor.getByLabel("Формула явной функции");
  await firstFormula.fill("x");
  await firstFormula.selectText();
  await advancedEditor.getByRole("button", { name: "Вставить sin" }).click();
  await expect(firstFormula).toHaveValue("sin(x)");

  await firstFormula.fill("b*x^2");
  await advancedEditor
    .getByRole("button", { name: "Создать параметр «b»" })
    .click();
  const parametersTab = advancedEditor.getByRole("tab", {
    name: "Параметры (2)",
  });
  await expect(parametersTab).toHaveAttribute("aria-selected", "true");
  const addedParameterName = advancedEditor
    .locator("[data-parameter-name]")
    .last();
  await expect(addedParameterName).toHaveValue("b");
  await expect(addedParameterName).toBeFocused();

  await advancedEditor.getByRole("tab", { name: "Функции" }).click();
  await expect(advancedEditor.getByLabel("Стиль линии")).toContainText(
    "Сплошная",
  );
  await expect(advancedEditor.getByLabel("Стиль линии")).toContainText(
    "Штриховая",
  );

  await advancedEditor.getByRole("button", { name: "+ Явная функция" }).click();
  await advancedEditor.getByLabel("Формула явной функции").fill("2*x+1");

  await editor
    .getByRole("button", { name: "+ Параметрическая кривая" })
    .click();
  await advancedEditor.getByLabel("Параметрическая формула x").fill("3*cos(t)");
  await advancedEditor.getByLabel("Параметрическая формула y").fill("3*sin(t)");

  await advancedEditor.getByLabel("Показывать График 2").uncheck();
  await advancedEditor.getByRole("tab", { name: "Вид" }).click();
  await expect(advancedEditor.getByText("X: от")).toBeVisible();
  await expect(advancedEditor.getByText("Y: до")).toBeVisible();
  await expect(advancedEditor.getByLabel("Положение легенды")).toContainText(
    "Сверху справа",
  );
  await advancedEditor.getByLabel("Минимальная граница X").fill("-18");
  await advancedEditor.getByLabel("Максимальная граница X").fill("24");
  await advancedEditor.getByLabel("Минимальная граница Y").fill("-9");
  await advancedEditor.getByLabel("Максимальная граница Y").fill("11");

  const revisionCountBeforeSave = await localRevisionCount(page);
  await advancedEditor.getByRole("button", { name: "Сохранить" }).click();
  await expect
    .poll(() => localRevisionCount(page))
    .toBeGreaterThan(revisionCountBeforeSave);
  await expect(persistenceStatus).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );
  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам" })
    .click();
  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.getByRole("button", { name: "math.coordinate-plot" }).click();
  await openCoordinatePlotEditorByRightDoubleClick(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue("b*x^2");
  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  await expect(advancedEditor).toBeVisible();
  await expect(
    advancedEditor.getByLabel("Показывать График 2"),
  ).not.toBeChecked();

  await advancedEditor.getByRole("tab", { name: "Вид" }).click();
  await expect(advancedEditor.getByLabel("Минимальная граница X")).toHaveValue(
    "-18",
  );
  await expect(advancedEditor.getByLabel("Максимальная граница X")).toHaveValue(
    "24",
  );
  await expect(advancedEditor.getByLabel("Минимальная граница Y")).toHaveValue(
    "-9",
  );
  await expect(advancedEditor.getByLabel("Максимальная граница Y")).toHaveValue(
    "11",
  );

  await advancedEditor.getByRole("tab", { name: "Параметры (2)" }).click();
  const restoredParameterNames = advancedEditor.locator(
    "[data-parameter-name]",
  );
  await expect(restoredParameterNames).toHaveCount(2);
  await expect(restoredParameterNames.nth(0)).toHaveValue("a");
  await expect(restoredParameterNames.nth(1)).toHaveValue("b");

  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам" })
    .click();
  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );

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
            readonly coordinateViewport?: Record<string, unknown>;
            readonly parameters?: readonly {
              readonly id: string;
              readonly name: string;
            }[];
            readonly series?: readonly {
              readonly expression?: string;
              readonly id: string;
              readonly kind: string;
              readonly visible: boolean;
              readonly xExpression?: string;
              readonly yExpression?: string;
            }[];
          };
          readonly id: string;
          readonly kind: string;
        }
      >
    >;
  };
  const plots = Object.values(document.objects).filter(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  expect(plots).toHaveLength(2);
  for (const plot of plots) {
    expect(plot.definition?.coordinateViewport).toMatchObject({
      xMax: 24,
      xMin: -18,
      yMax: 11,
      yMin: -9,
    });
    expect(plot.definition?.series).toEqual([
      expect.objectContaining({
        expression: "b*x^2",
        kind: "explicit",
        visible: true,
      }),
      expect.objectContaining({
        expression: "2*x+1",
        kind: "explicit",
        visible: false,
      }),
      expect.objectContaining({
        kind: "parametric",
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      }),
    ]);
    expect(plot.definition?.parameters).toEqual([
      expect.objectContaining({ name: "a" }),
      expect.objectContaining({ name: "b" }),
    ]);
  }
  expect(plots[0]?.id).not.toBe(plots[1]?.id);
  expect(plots[0]?.definition?.series?.map(({ id }) => id)).toEqual(
    plots[1]?.definition?.series?.map(({ id }) => id),
  );
  expect(plots[0]?.definition?.parameters?.map(({ id }) => id)).toEqual(
    plots[1]?.definition?.parameters?.map(({ id }) => id),
  );
});
