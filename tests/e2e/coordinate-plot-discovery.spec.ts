import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("discovers formulas, creates a parameter and uses localized view controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();

  const editor = page.getByTestId("coordinate-plot-editor");
  const functionsTab = editor.getByRole("tab", { name: "Функции" });
  const formula = editor.getByLabel("Формула явной функции");
  await expect(functionsTab).toHaveAttribute("aria-selected", "true");
  await expect(formula).toBeFocused();
  await expect(editor.getByText(/Тригонометрические функции используют радианы/)).toBeVisible();

  await formula.fill("x");
  await formula.selectText();
  await editor.getByRole("button", { name: "Вставить sin" }).click();
  await expect(formula).toHaveValue("sin(x)");
  await formula.press("End");
  await editor.getByRole("button", { name: "Вставить pi" }).click();
  await expect(formula).toHaveValue("sin(x)pi");

  await formula.fill("k*sin(x)");
  const createParameter = editor.getByRole("button", {
    name: "Создать параметр «k»",
  });
  await expect(createParameter).toBeVisible();
  await createParameter.click();

  const parametersTab = editor.getByRole("tab", { name: "Параметры (1)" });
  await expect(parametersTab).toHaveAttribute("aria-selected", "true");
  const parameterName = editor.getByLabel(/Имя параметра/);
  await expect(parameterName).toHaveValue("k");
  await expect(parameterName).toBeFocused();

  const viewTab = editor.getByRole("tab", { name: "Вид" });
  await viewTab.focus();
  await viewTab.press("Home");
  await expect(functionsTab).toBeFocused();
  await viewTab.click();

  await expect(editor.getByText("X: от")).toBeVisible();
  await expect(editor.getByText("Y: до")).toBeVisible();
  const legendPosition = editor.getByLabel("Положение легенды");
  await expect(legendPosition).toContainText("Сверху справа");

  await functionsTab.click();
  const lineStyle = editor.getByLabel("Стиль линии");
  await expect(lineStyle).toContainText("Сплошная");
  await expect(lineStyle).toContainText("Штриховая");

  await editor.getByRole("button", { name: "Сохранить" }).click();
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
            readonly parameters?: readonly { readonly name: string }[];
            readonly series?: readonly { readonly expression?: string }[];
          };
          readonly kind?: string;
        }
      >
    >;
  };
  const plot = Object.values(document.objects).find(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  expect(plot?.definition?.parameters).toEqual([
    expect.objectContaining({ name: "k" }),
  ]);
  expect(plot?.definition?.series?.[0]).toMatchObject({
    expression: "k*sin(x)",
  });
});
