import { expect, test } from "@playwright/test";

test("manages visibility, z-order and user groups from the settings sheet", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  const draw = async (tool: "Прямоугольник (R)" | "Эллипс (E)", x: number) => {
    await page.keyboard.press(tool === "Прямоугольник (R)" ? "r" : "e");
    await page.mouse.move(bounds.x + x, bounds.y + 160);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 100, bounds.y + 260, { steps: 4 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", 220);
  await draw("Эллипс (E)", 440);

  await page.getByRole("button", { name: "Настройки доски" }).click();
  let settings = page.getByRole("dialog", { name: "Настройки доски" });
  const layerList = settings.locator(".board-settings-layers");
  await expect(layerList.getByRole("listitem")).toHaveCount(2);
  await layerList
    .getByRole("button", { name: /Скрыть object:/ })
    .first()
    .click();
  await expect(
    layerList.getByRole("button", { name: /Показать object:/ }),
  ).toHaveCount(1);
  await layerList.getByRole("button", { name: /Показать object:/ }).click();
  await layerList
    .getByRole("button", { name: /На задний план object:/ })
    .first()
    .click();
  await settings
    .getByRole("button", { name: "Закрыть настройки доски" })
    .click();

  await page.keyboard.press("v");
  await page.mouse.click(bounds.x + 270, bounds.y + 210);
  await page.keyboard.down("Shift");
  await page.mouse.click(bounds.x + 490, bounds.y + 210);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");

  await page.getByRole("button", { name: "Настройки доски" }).click();
  settings = page.getByRole("dialog", { name: "Настройки доски" });
  await settings.getByRole("button", { name: "Сгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("1 групп");
  await settings.getByRole("button", { name: "Разгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("0 групп");
});
