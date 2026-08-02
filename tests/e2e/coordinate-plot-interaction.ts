import { expect, type Page } from "@playwright/test";

export async function rightDoubleClickBoardCenter(page: Page): Promise<void> {
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.waitForTimeout(60);
  await page.mouse.click(point.x, point.y, { button: "right" });
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
): Promise<void> {
  await rightDoubleClickBoardCenter(page);
  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  await expect(editor).toBeVisible();
}
