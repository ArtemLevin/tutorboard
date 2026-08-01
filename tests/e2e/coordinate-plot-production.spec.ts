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

test("discovers, persists, restores, duplicates and exports a production coordinate plot", async ({
  page,
}) => {
  await resetLocalDatabase(page);

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  await expect(editor).toBeVisible();

  await editor.getByText("Краткая справка по формулам").click();
  await expect(
    editor.getByText(/Тригонометрические функции используют радианы/),
  ).toBeVisible();

  const firstFormula = editor.getByLabel("Формула явной функции");
  await firstFormula.fill("x");
  await firstFormula.selectText();
  await editor.getByRole("button", { name: "Вставить sin" }).click();
  await expect(firstFormula).toHaveValue("sin(x)");

  await firstFormula.fill("a*x^2");
  await editor.getByRole("button", { name: "Создать параметр «a»" }).click();
  const parametersTab = editor.getByRole("tab", { name: "Параметры (1)" });
  await expect(parametersTab).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByLabel(/Имя параметра/)).toHaveValue("a");
  await expect(editor.getByLabel(/Имя параметра/)).toBeFocused();

  await editor.getByRole("tab", { name: "Функции" }).click();
  await expect(editor.getByLabel("Стиль линии")).toContainText("Сплошная");
  await expect(editor.getByLabel("Стиль линии")).toContainText("Штриховая");

  await editor.getByRole("button", { name: "+ Явная функция" }).click();
  await editor.getByLabel("Формула явной функции").fill("2*x+1");

  await editor
    .getByRole("button", { name: "+ Параметрическая кривая" })
    .click();
  await editor.getByLabel("Параметрическая формула x").fill("3*cos(t)");
  await editor.getByLabel("Параметрическая формула y").fill("3*sin(t)");

  await editor.getByLabel("Показывать График 2").uncheck();
  await editor.getByRole("tab", { name: "Вид" }).click();
  await expect(editor.getByText("X: от")).toBeVisible();
  await expect(editor.getByText("Y: до")).toBeVisible();
  await expect(editor.getByLabel("Положение легенды")).toContainText(
    "Сверху справа",
  );
  await editor.getByLabel("Минимальная граница X").fill("-18");
  await editor.getByLabel("Максимальная граница X").fill("24");
  await editor.getByLabel("Минимальная граница Y").fill("-9");
  await editor.getByLabel("Максимальная граница Y").fill("11");

  await editor.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );
  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.getByRole("button", { name: "math.coordinate-plot" }).click();
  await page.keyboard.press("Enter");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue("a*x^2");
  await expect(editor.getByLabel("Показывать График 2")).not.toBeChecked();

  await editor.getByRole("tab", { name: "Вид" }).click();
  await expect(editor.getByLabel("Минимальная граница X")).toHaveValue("-18");
  await expect(editor.getByLabel("Максимальная граница X")).toHaveValue("24");
  await expect(editor.getByLabel("Минимальная граница Y")).toHaveValue("-9");
  await expect(editor.getByLabel("Максимальная граница Y")).toHaveValue("11");

  await editor.getByRole("tab", { name: "Параметры (1)" }).click();
  await expect(editor.getByLabel(/Имя параметра/)).toHaveValue("a");

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
        expression: "a*x^2",
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
