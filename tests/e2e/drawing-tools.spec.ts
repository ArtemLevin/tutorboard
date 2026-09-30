import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});

async function canvasPoint(page: Page, xRatio: number, yRatio: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  return {
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio,
  };
}

test("uses distinct physical shortcuts for line, lasso and primary colors", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");

  await page.keyboard.press("l");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.line");
  await expect(stage).toHaveAttribute("data-selection-mode", "none");

  await page.keyboard.press("Shift+v");
  await expect(stage).toHaveAttribute("data-selection-mode", "selection.lasso");
  await expect(stage).toHaveAttribute("data-drawing-mode", "none");

  await page.keyboard.press("p");
  await page.keyboard.press("2");
  await expect(
    page.getByRole("button", { name: "Цвет: Красный" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("applies and releases Shift constraints without pointer movement", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const count = page.getByTestId("object-count");
  await page.keyboard.press("l");

  const start = await canvasPoint(page, 0.35, 0.35);
  const end = await canvasPoint(page, 0.58, 0.52);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });

  await expect(stage).toHaveAttribute("data-drawing-constraint", "none");
  await page.keyboard.down("Shift");
  await expect(stage).not.toHaveAttribute("data-drawing-constraint", "none");
  await page.keyboard.up("Shift");
  await expect(stage).toHaveAttribute("data-drawing-constraint", "none");

  await page.keyboard.down("Shift");
  await expect(stage).not.toHaveAttribute("data-drawing-constraint", "none");
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await expect(count).toHaveText("1 объекта");
  await expect(stage).toHaveAttribute("data-drawing", "false");
  await expect(stage).toHaveAttribute("data-drawing-constraint", "none");
});

test("creates one normalized primitive per completed gesture", async ({
  page,
}) => {
  const count = page.getByTestId("object-count");
  await expect(count).toHaveText("0 объекта");
  await page.keyboard.press("r");

  const start = await canvasPoint(page, 0.72, 0.42);
  const end = await canvasPoint(page, 0.55, 0.25);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();

  await expect(count).toHaveText("1 объекта");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing",
    "false",
  );
});

test(
  "creates a visible pen dot from a stationary tap",
  { tag: "@smoke" },
  async ({ page }) => {
    const count = page.getByTestId("object-count");
    const stage = page.getByTestId("board-stage");
    await page.keyboard.press("p");
    const point = await canvasPoint(page, 0.46, 0.4);
    await page.mouse.click(point.x, point.y);

    await expect(count).toHaveText("1 объекта");
    await expect(stage).toHaveAttribute("data-drawing", "false");

    await page.keyboard.press("Control+z");
    await expect(count).toHaveText("0 объекта");
  },
);

test(
  "erases mixed editable objects in one gesture with live preview and one undo",
  { tag: "@smoke" },
  async ({ page }) => {
    const count = page.getByTestId("object-count");
    const stage = page.getByTestId("board-stage");

    await page.keyboard.press("r");
    const rectangleStart = await canvasPoint(page, 0.25, 0.3);
    const rectangleEnd = await canvasPoint(page, 0.4, 0.48);
    await page.mouse.move(rectangleStart.x, rectangleStart.y);
    await page.mouse.down();
    await page.mouse.move(rectangleEnd.x, rectangleEnd.y, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.press("l");
    const lineStart = await canvasPoint(page, 0.46, 0.39);
    const lineEnd = await canvasPoint(page, 0.62, 0.39);
    await page.mouse.move(lineStart.x, lineStart.y);
    await page.mouse.down();
    await page.mouse.move(lineEnd.x, lineEnd.y, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.press("t");
    const textPoint = await canvasPoint(page, 0.7, 0.37);
    await page.mouse.click(textPoint.x, textPoint.y);
    const editor = page.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await editor.fill("erase me");
    await editor.press("Shift+Enter");
    await expect(count).toHaveText("3 объекта");

    await page.keyboard.press("x");
    await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
    const eraserSize = page.getByRole("slider", { name: "Размер ластика" });
    await expect(eraserSize).toHaveValue("24");
    await eraserSize.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "48";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(eraserSize).toHaveValue("48");

    const eraseStart = await canvasPoint(page, 0.2, 0.39);
    const eraseEnd = await canvasPoint(page, 0.82, 0.39);
    await page.mouse.move(eraseStart.x, eraseStart.y);
    await page.mouse.down();
    await page.mouse.move(eraseEnd.x, eraseEnd.y, { steps: 16 });

    // The durable document is unchanged while the live eraser preview is active.
    await expect(count).toHaveText("3 объекта");
    await expect(stage).toHaveAttribute("data-drawing", "true");

    await page.mouse.up();
    await expect(count).toHaveText("0 объекта");

    await page.keyboard.press("Control+z");
    await expect(count).toHaveText("3 объекта");
  },
);

test(
  "partially erases a pen stroke and undoes the gesture atomically",
  { tag: "@smoke" },
  async ({ page }) => {
    const count = page.getByTestId("object-count");
    const stage = page.getByTestId("board-stage");
  
    await page.keyboard.press("p");
    const left = await canvasPoint(page, 0.35, 0.45);
    const right = await canvasPoint(page, 0.65, 0.45);
    await page.mouse.move(left.x, left.y);
    await page.mouse.down();
    await page.mouse.move(right.x, right.y, { steps: 20 });
    await page.mouse.up();
    await expect(count).toHaveText("1 объекта");
  
    await page.keyboard.press("x");
    await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
    const eraseTop = await canvasPoint(page, 0.5, 0.38);
    const eraseBottom = await canvasPoint(page, 0.5, 0.52);
    await page.mouse.move(eraseTop.x, eraseTop.y);
    await expect(stage).toHaveAttribute("data-eraser-visible", "true");
    await page.mouse.down();
    await page.mouse.move(eraseBottom.x, eraseBottom.y, { steps: 8 });
    await page.mouse.up();
  
    await expect(count).toHaveText("2 объекта");
    await page.keyboard.press("Control+z");
    await expect(count).toHaveText("1 объекта");
  },
);
test("Escape and tool switching discard runtime preview", async ({ page }) => {
  const count = page.getByTestId("object-count");
  const stage = page.getByTestId("board-stage");
  await page.keyboard.press("e");

  const start = await canvasPoint(page, 0.55, 0.3);
  const end = await canvasPoint(page, 0.7, 0.42);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await expect(stage).toHaveAttribute("data-drawing", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(count).toHaveText("0 объекта");
  await expect(stage).toHaveAttribute("data-drawing", "false");

  await page.keyboard.press("l");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.keyboard.press("p");
  await page.mouse.up();

  await expect(count).toHaveText("0 объекта");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  await expect(stage).toHaveAttribute("data-drawing", "false");
});

test(
  "creates pen and text objects through their tools",
  { tag: "@smoke" },
  async ({ page }) => {
    const count = page.getByTestId("object-count");
    await page.keyboard.press("p");
    const start = await canvasPoint(page, 0.5, 0.32);
    const end = await canvasPoint(page, 0.68, 0.2);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
    await expect(count).toHaveText("1 объекта");

    await page.getByRole("button", { name: "Рисование" }).click();
    await page.getByRole("menuitemradio", { name: "Текст (T)" }).click();
    await page
      .getByRole("textbox", { name: "Содержимое текста" })
      .fill("Угол ABC");
    const textPoint = await canvasPoint(page, 0.62, 0.4);
    await page.mouse.click(textPoint.x, textPoint.y);
    const textEditor = page.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await expect(textEditor).toBeVisible();
    await textEditor.press("Control+Enter");
    await expect(textEditor).toHaveCount(0);

    await expect(count).toHaveText("2 объекта");
    await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  },
);

test("draws inside a filled figure and selects it through the contour", async ({
  page,
}) => {
  const count = page.getByTestId("object-count");
  await page.keyboard.press("e");
  const outerStart = await canvasPoint(page, 0.35, 0.25);
  const outerEnd = await canvasPoint(page, 0.65, 0.65);
  await page.mouse.move(outerStart.x, outerStart.y);
  await page.mouse.down();
  await page.mouse.move(outerEnd.x, outerEnd.y, { steps: 5 });
  await page.mouse.up();
  await expect(count).toHaveText("1 объекта");

  const innerStart = await canvasPoint(page, 0.47, 0.4);
  const innerEnd = await canvasPoint(page, 0.54, 0.5);
  await page.mouse.move(innerStart.x, innerStart.y);
  await page.mouse.down();
  await page.mouse.move(innerEnd.x, innerEnd.y, { steps: 4 });
  await page.mouse.up();

  await expect(count).toHaveText("2 объекта");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing-mode",
    "drawing.ellipse",
  );
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.keyboard.press("v");
  const outerContour = await canvasPoint(page, 0.65, 0.45);
  await page.mouse.click(outerContour.x, outerContour.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
});
