import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("manages visibility, z-order and user groups from the layers UI", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  const draw = async (tool: "Прямоугольник (R)" | "Эллипс (E)", x: number) => {
    await page.getByRole("button", { name: tool }).click();
    await page.mouse.move(bounds.x + x, bounds.y + 200);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 100, bounds.y + 300, { steps: 4 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", 220);
  await draw("Эллипс (E)", 440);

  const layers = page.getByRole("complementary", { name: "Слои" });
  await expect(layers.getByRole("listitem")).toHaveCount(2);
  await layers
    .getByRole("button", { name: /Скрыть object:/ })
    .first()
    .click();
  await expect(
    layers.getByRole("button", { name: /Показать object:/ }),
  ).toHaveCount(1);
  await layers.getByRole("button", { name: /Показать object:/ }).click();
  await layers
    .getByRole("button", { name: /На задний план object:/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 270, bounds.y + 250);
  await page.keyboard.down("Shift");
  await page.mouse.click(bounds.x + 490, bounds.y + 250);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await rightDoubleClickAt(page, { x: bounds.x + 490, y: bounds.y + 250 });

  await page.getByRole("button", { name: "Сгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("1 групп");
  await page.getByRole("button", { name: "Разгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("0 групп");
});
