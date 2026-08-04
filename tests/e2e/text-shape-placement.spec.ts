import { expect, test } from "@playwright/test";

async function openTextShapePanel(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение GeometryOS" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Построение через GeometryOS" }),
  ).toBeVisible();
}

test("places an abbreviated catalog shape at the clicked board position", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");

  await openTextShapePanel(page);
  await page.getByLabel("Запрос GeometryOS").fill("кон");
  await expect(
    page.getByRole("button", { name: "Конус", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await expect(page.getByTestId("geometry-prompt-status")).toContainText(
    "Выбрано построение «Конус»",
  );

  await page.mouse.click(
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.42,
  );

  await expect(page.getByTestId("object-count")).toHaveText("9 объекта");
  await expect(page.getByTestId("group-count")).toHaveText("1 групп");
  await expect(
    page.getByRole("region", { name: "Первичные настройки выделения" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Автоматически называть вершины" }),
  ).toBeChecked();

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("offers triangle constructions after a vertex click", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width * 0.58,
    y: bounds.y + bounds.height * 0.4,
  };

  await openTextShapePanel(page);
  await page.getByLabel("Запрос GeometryOS").fill("треугольник");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId("object-count")).toHaveText("9 объекта");

  await page.mouse.click(center.x - 86, center.y + 60);
  const actions = page.getByRole("group", {
    name: "Построения из вершины A",
  });
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Высота" }).click();

  await expect(page.getByTestId("object-count")).toHaveText("12 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");
});
