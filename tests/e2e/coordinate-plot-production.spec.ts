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

test("persists, restores, duplicates and exports a production coordinate plot", async ({
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

  await page.getByLabel("Формула явной функции").fill("a*x^2");
  await page.getByRole("button", { name: "Добавить параметр" }).click();

  await page.getByRole("button", { name: "+ y=f(x)" }).click();
  await page.getByLabel("Формула явной функции").fill("2*x+1");

  await page.getByRole("button", { name: "+ Параметрическая" }).click();
  await page.getByLabel("Параметрическая формула x").fill("3*cos(t)");
  await page.getByLabel("Параметрическая формула y").fill("3*sin(t)");

  await page.getByLabel("Показывать График 2").uncheck();
  await page.getByLabel("Граница xMin").fill("-18");
  await page.getByLabel("Граница xMax").fill("24");
  await page.getByLabel("Граница yMin").fill("-9");
  await page.getByLabel("Граница yMax").fill("11");

  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Сохранено локально|Сохранено повторно/,
  );
  await page.getByRole("button", { name: "Закрыть редактор графика" }).click();

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.getByRole("button", { name: "math.coordinate-plot" }).click();
  await page.keyboard.press("Enter");
  await expect(editor).toBeVisible();
  await expect(page.getByLabel("Формула явной функции")).toHaveValue("a*x^2");
  await expect(page.getByLabel("Граница xMin")).toHaveValue("-18");
  await expect(page.getByLabel("Граница xMax")).toHaveValue("24");
  await expect(page.getByLabel("Граница yMin")).toHaveValue("-9");
  await expect(page.getByLabel("Граница yMax")).toHaveValue("11");
  await expect(page.getByLabel("Показывать График 2")).not.toBeChecked();

  await page.getByText(/^Параметры \(1\)$/).click();
  await expect(page.getByLabel("Имя параметра")).toHaveValue("a");

  await page.getByRole("button", { name: "Закрыть редактор графика" }).click();
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
