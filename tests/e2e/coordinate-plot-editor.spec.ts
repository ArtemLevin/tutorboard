import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("creates and persists explicit and parametric plot series", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();

  await page.getByLabel("Формула явной функции").fill("x^3-2*x");
  await page.getByRole("button", { name: "+ Параметрическая" }).click();
  await page.getByLabel("Параметрическая формула x").fill("2*cos(t)");
  await page.getByLabel("Параметрическая формула y").fill("2*sin(t)");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Изменения сохранены")).toBeVisible();

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
