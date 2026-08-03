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

export async function createCoordinatePlot(page: Page): Promise<void> {
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByRole("button", { name: "Математика" }).click();
  await page
    .getByRole("menuitem", { name: "Координатная плоскость (G)" })
    .click();
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

async function coordinatePlotEntryPoints(page: Page): Promise<ScreenPoint[]> {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const point = (xRatio: number, yRatio: number): ScreenPoint => ({
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio,
  });
  return [
    point(0.5, 0.5),
    point(0.65, 0.35),
    point(0.5, 0.35),
    point(0.65, 0.6),
    point(0.35, 0.35),
    point(0.35, 0.6),
  ];
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
  point?: ScreenPoint,
): Promise<void> {
  const editor = page.getByRole("complementary", {
    name: "Редактор координатной плоскости",
  });
  const points =
    point === undefined ? await coordinatePlotEntryPoints(page) : [point];

  for (const candidate of points) {
    await rightDoubleClickAt(page, candidate);
    try {
      await editor.waitFor({ state: "visible", timeout: 750 });
      return;
    } catch {
      // Continue through stage points covered by responsive overlays.
    }
  }

  await expect(editor).toBeVisible();
}
