import { expect, test } from "@playwright/test";

test("@smoke holds Shift+X for erasing and restores the pen after pointer release", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  await page.keyboard.press("p");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");

  await page.keyboard.down("Shift");
  await page.keyboard.down("x");
  await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.move(bounds.x + 320, bounds.y + 210);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 410, bounds.y + 260, { steps: 4 });
  await page.keyboard.up("x");
  await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await page.keyboard.up("Shift");

  await page.keyboard.press("x");
  await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
});

test("@smoke Shift+X remains temporary when Shift is released first", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  await page.keyboard.press("p");
  await page.keyboard.down("Shift");
  await page.keyboard.down("x");
  await expect(stage).toHaveAttribute("data-drawing-mode", "editing.eraser");
  await page.keyboard.up("Shift");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await page.keyboard.up("x");
});
