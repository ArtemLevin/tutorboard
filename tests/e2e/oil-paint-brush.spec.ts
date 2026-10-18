import { expect, test } from "@playwright/test";

test("@smoke oil paint brush previews, commits and restores a stroke", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const objects = page.getByTestId("object-count");
  await expect(stage).toBeVisible();

  await page.keyboard.press("p");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  const styleTrigger = page.getByRole("button", { name: /Стиль линии:/ });
  await styleTrigger.click();
  await page.getByRole("menuitemradio", { name: "Масляная кисть" }).click();
  await expect(styleTrigger).toHaveAttribute("aria-label", /Масляная кисть/);
  await expect(stage).toHaveAttribute("data-wet-ink-stroke-style", "oil-paint");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина инструмента" }),
  ).toHaveValue("12");

  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Canvas is missing");
  await page.mouse.move(bounds.x + 235, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 410, bounds.y + 315, { steps: 18 });
  await expect(stage).toHaveAttribute("data-wet-ink-active", "true");
  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  await expect(objects).toHaveText("1 объекта");

  await page.keyboard.press("Control+z");
  await expect(objects).toHaveText("0 объекта");
  await page.keyboard.press("Control+Shift+z");
  await expect(objects).toHaveText("1 объекта");
  await page.reload();
  await expect(objects).toHaveText("1 объекта");
});
