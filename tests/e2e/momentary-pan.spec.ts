import { expect, test } from "@playwright/test";

test("@smoke holds Space to pan and restores the pen after pointer release", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  await page.keyboard.press("p");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");

  const before = await page.getByTestId("viewport-offset").textContent();
  await page.keyboard.down("Space");
  await expect(stage).toHaveAttribute("data-pan-mode", "true");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.move(bounds.x + 320, bounds.y + 220);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 440, bounds.y + 280, { steps: 5 });
  await page.keyboard.up("Space");
  await expect(stage).toHaveAttribute("data-pan-mode", "true");
  await page.mouse.up();

  await expect(stage).toHaveAttribute("data-pan-mode", "false");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  await expect(page.getByTestId("viewport-offset")).not.toHaveText(
    before ?? "",
  );
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("@smoke Space respects text input and clears after window blur", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await page.keyboard.press("t");
  const input = page.getByRole("textbox", { name: "Содержимое текста" });
  await input.focus();
  await page.keyboard.down("Space");
  await expect(stage).toHaveAttribute("data-pan-mode", "false");
  await page.keyboard.up("Space");

  await stage.focus();
  await page.keyboard.down("Space");
  await expect(stage).toHaveAttribute("data-pan-mode", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(stage).toHaveAttribute("data-pan-mode", "false");
  await page.keyboard.up("Space");
});
