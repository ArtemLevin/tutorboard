import { expect, test } from "@playwright/test";

import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

test("opens figure and graph settings only after a right-button double-click", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height * 0.35,
  };
  const selectionSettings = page.getByRole("region", {
    name: "Первичные настройки выделения",
  });

  await page.keyboard.press("r");
  await page.mouse.move(center.x - 70, center.y - 50);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(selectionSettings).toBeHidden();
  const contour = { x: center.x - 70, y: center.y };

  await page.mouse.click(contour.x, contour.y, { button: "right" });
  await expect(selectionSettings).toBeHidden();
  await page.waitForTimeout(60);
  await page.mouse.click(contour.x, contour.y, { button: "right" });
  await expect(selectionSettings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selectionSettings).toBeHidden();

  await page.keyboard.press("g");
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
  const before = await page.getByTestId("viewport-offset").textContent();
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const start = {
    x: bounds.x + bounds.width * 0.45,
    y: bounds.y + bounds.height * 0.4,
  };
  const finish = { x: start.x + 100, y: start.y + 60 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await expect(stage).toHaveAttribute("data-panning", "true");
  await page.mouse.up({ button: "right" });
  await expect(page.getByTestId("viewport-offset")).not.toHaveText(
    before ?? "",
  );
  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
});
