import { expect, test } from "@playwright/test";

async function openTextShapePanel(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Построение по тексту" }),
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
  await page.getByLabel("Текст построения").fill("кон");
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

  await expect(page.getByTestId("object-count")).toHaveText("10 объекта");
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
  await page.getByLabel("Текст построения").fill("треугольник");
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

test("adds an automatically named point with Shift-click on a contour", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width * 0.58,
    y: bounds.y + bounds.height * 0.4,
  };

  await openTextShapePanel(page);
  await page.getByLabel("Текст построения").fill("треугольник");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId("object-count")).toHaveText("9 объекта");

  await page.keyboard.down("Shift");
  await page.mouse.click(center.x + 49, center.y - 6);
  await page.keyboard.up("Shift");

  await expect(page.getByTestId("object-count")).toHaveText("11 объекта");
  await expect(page.getByText("На контуре добавлена точка D")).toBeAttached();
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("9 объекта");
});

test("changes generated figure size, rotation and label position", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");

  await openTextShapePanel(page);
  await page.getByLabel("Текст построения").fill("конус");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.42,
  );

  await page
    .getByRole("button", { name: "Увеличить выделение на 10%" })
    .click();
  await page
    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })
    .click();
  await page
    .getByRole("button", { name: "Сдвинуть названия вершин вправо" })
    .click();

  await expect(page.getByTestId("object-count")).toHaveText("10 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("4/0");
});
