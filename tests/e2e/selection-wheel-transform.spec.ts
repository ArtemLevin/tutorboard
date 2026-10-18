import { expect, test } from "@playwright/test";

test("@smoke Alt-wheel scales selection, Shift-wheel rotates it, and plain wheel zooms the canvas", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  const rect = await stage.boundingBox();
  if (rect === null) throw new Error("Missing board stage");

  await page.keyboard.press("r");
  await page.mouse.move(rect.x + 280, rect.y + 190);
  await page.mouse.down();
  await page.mouse.move(rect.x + 440, rect.y + 310, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.keyboard.press("v");
  await page.mouse.click(rect.x + 355, rect.y + 240);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");

  const initialZoom = await stage.getAttribute("data-viewport-zoom");
  const initialHistory = await page.getByTestId("history-depth").textContent();
  await page.mouse.move(rect.x + 355, rect.y + 240);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -90);
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("history-depth")).not.toHaveText(
    initialHistory ?? "",
  );
  await expect(stage).toHaveAttribute("data-viewport-zoom", initialZoom ?? "1");

  const afterScale = await page.getByTestId("history-depth").textContent();
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -90);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("history-depth")).not.toHaveText(
    afterScale ?? "",
  );
  await expect(stage).toHaveAttribute("data-viewport-zoom", initialZoom ?? "1");

  const afterRotation = await page.getByTestId("history-depth").textContent();
  await page.keyboard.press("+");
  await expect(page.getByTestId("history-depth")).not.toHaveText(
    afterRotation ?? "",
  );

  await page.mouse.wheel(0, -90);
  await expect(stage).not.toHaveAttribute(
    "data-viewport-zoom",
    initialZoom ?? "1",
  );
});
