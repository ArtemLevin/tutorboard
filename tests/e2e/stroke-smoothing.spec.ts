import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  return { x: bounds.x + x, y: bounds.y + y };
}

test("keeps a smoothed freehand stroke transformable at high zoom", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Перо (P)" }).click();
  const samples = [
    [260, 320],
    [300, 270],
    [350, 310],
    [410, 250],
    [470, 300],
  ] as const;
  const first = await stagePoint(page, samples[0][0], samples[0][1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of samples.slice(1)) {
    const point = await stagePoint(page, x, y);
    await page.mouse.move(point.x, point.y, { steps: 6 });
  }
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const settingsPoint = await stagePoint(page, 350, 310);
  await page.mouse.click(settingsPoint.x, settingsPoint.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, settingsPoint);
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();

  const zoomPoint = await stagePoint(page, 380, 290);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  for (let index = 0; index < 18; index += 1) {
    await page.mouse.wheel(0, -240);
  }
  await expect(page.getByTestId("viewport-zoom")).not.toHaveText("100%");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );

  await page
    .getByRole("button", { name: "Увеличить выделение на 10%" })
    .click();
  await page
    .getByRole("button", {
      name: "Повернуть выделение на 15 градусов",
    })
    .click();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 15°",
  );
});
