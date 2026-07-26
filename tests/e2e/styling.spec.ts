import { expect, test } from "@playwright/test";

test("edits the persisted style of a selected object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 250, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 390, bounds.y + 290, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 320, bounds.y + 235);

  const fill = page.getByRole("textbox", { name: "Заливка выделения" });
  await fill.fill("#336699");
  await expect(fill).toHaveValue("#336699");
  await page.getByRole("spinbutton", { name: "Толщина обводки" }).fill("6");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина обводки" }),
  ).toHaveValue("6");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина обводки" }),
  ).not.toHaveValue("6");
});
