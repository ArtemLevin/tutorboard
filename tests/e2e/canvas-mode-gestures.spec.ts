import { expect, test, type Page } from "@playwright/test";

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  return { x: bounds.x + x, y: bounds.y + y };
}

async function selectPen(page: Page): Promise<void> {
  const drawingMenu = page.getByRole("button", { name: "Рисование" });
  await drawingMenu.click();
  await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing-mode",
    "drawing.pen",
  );
}

async function slowDoubleClick(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(380);
  await page.mouse.click(point.x, point.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
});

test("does not change tools after clicks on an empty canvas", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const first = await stagePoint(page, 280, 190);
  const second = await stagePoint(page, 520, 310);
  const third = await stagePoint(page, 710, 240);

  await expect(stage).toHaveAttribute("data-pan-mode", "true");
  await page.mouse.click(first.x, first.y);
  await expect(stage).toHaveAttribute("data-pan-mode", "true");
  await expect(stage).toHaveAttribute("data-drawing-mode", "none");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await selectPen(page);
  await page.mouse.click(second.x, second.y);
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.keyboard.press("v");
  await expect(stage).toHaveAttribute("data-selection-mode", /selection\./);
  await page.mouse.click(third.x, third.y);
  await expect(stage).toHaveAttribute("data-drawing-mode", "none");
  await expect(stage).toHaveAttribute("data-selection-mode", /selection\./);
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("keeps a realistic slow double click in the active tool", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const first = await stagePoint(page, 360, 260);
  const second = await stagePoint(page, 620, 360);

  await selectPen(page);
  await slowDoubleClick(page, first);
  await expect(stage).toHaveAttribute("data-selection-mode", "none");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.keyboard.press("i");
  await page.mouse.move(second.x, second.y);
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.smart-ink");
  await slowDoubleClick(page, first);
  await expect(stage).toHaveAttribute("data-selection-mode", "none");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.smart-ink");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("shows a compact dot for pen cursors and keeps crosshair for shape tools", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");

  await selectPen(page);
  await expect(stage).toHaveAttribute("data-cursor-kind", "pen-dot");
  const penCursor = await stage.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(penCursor).toContain("url(");
  expect(penCursor).toContain("4 4, crosshair");

  const point = await stagePoint(page, 480, 260);
  await page.mouse.click(point.x, point.y);
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await expect(stage).toHaveAttribute("data-cursor-kind", "pen-dot");

  await page.keyboard.press("r");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.rectangle");
  await expect(stage).toHaveAttribute("data-cursor-kind", "crosshair");
  await expect(stage).toHaveCSS("cursor", "crosshair");
});

test("keeps drag gestures in their active tools", async ({ page }) => {
  const stage = page.getByTestId("board-stage");
  const start = await stagePoint(page, 260, 260);
  const finish = await stagePoint(page, 430, 350);

  await selectPen(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.keyboard.press("v");
  await expect(stage).toHaveAttribute("data-selection-mode", /selection\./);
  const marqueeStart = await stagePoint(page, 650, 180);
  const marqueeFinish = await stagePoint(page, 790, 320);
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(marqueeFinish.x, marqueeFinish.y, { steps: 6 });
  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-selection-mode", /selection\./);
  await expect(stage).toHaveAttribute("data-drawing-mode", "none");
});

test("preserves click placement for text tools", async ({ page }) => {
  const stage = page.getByTestId("board-stage");
  const drawingMenu = page.getByRole("button", { name: "Рисование" });
  await drawingMenu.click();
  await page.getByRole("menuitemradio", { name: "Текст (T)" }).click();
  await page
    .getByRole("textbox", { name: "Содержимое текста" })
    .fill("Проверка текста");

  const point = await stagePoint(page, 540, 280);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(600);

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.text");
});
