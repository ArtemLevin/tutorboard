import { expect, type Page } from "@playwright/test";

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export async function stageCenter(page: Page): Promise<ScreenPoint> {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export async function rightDoubleClickAt(
  page: Page,
  point: ScreenPoint,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(70);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
  point?: ScreenPoint,
): Promise<void> {
  await rightDoubleClickAt(page, point ?? (await stageCenter(page)));
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();
}
