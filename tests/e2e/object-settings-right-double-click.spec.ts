import { expect, test } from "@playwright/test";

import {
  openCoordinatePlotEditorByRightDoubleClick,
  rightDoubleClickBoardCenter,
} from "./coordinate-plot-interaction";

test("opens figure and graph settings only after a right-button double-click", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await page.mouse.move(center.x - 70, center.y - 50);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(
    page.getByRole("complementary", { name: "Выделенные объекты" }),
  ).toBeHidden();

  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(
    page.getByRole("complementary", { name: "Выделенные объекты" }),
  ).toBeHidden();
  await page.waitForTimeout(60);
  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(
    page.getByRole("complementary", { name: "Выделенные объекты" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть настройки объекта" }).click();

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();

  await openCoordinatePlotEditorByRightDoubleClick(page);
});

test("a right drag remains board panning", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  const before = await page.getByTestId("viewport-offset").textContent();
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  await page.mouse.move(bounds.x + 40, bounds.y + 40);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(bounds.x + 140, bounds.y + 100, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByTestId("viewport-offset")).not.toHaveText(
    before ?? "",
  );
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();

  await rightDoubleClickBoardCenter(page);
});
