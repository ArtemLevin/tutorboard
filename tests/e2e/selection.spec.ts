import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();

  const draw = async (
    tool: "Прямоугольник (R)" | "Эллипс (E)" | "Текст (T)",
    start: { x: number; y: number },
    finish = start,
  ) => {
    await page.getByRole("button", { name: tool }).click();
    const from = await stagePoint(page, start.x, start.y);
    const to = await stagePoint(page, finish.x, finish.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", { x: 300, y: 200 }, { x: 400, y: 300 });
  await draw("Эллипс (E)", { x: 500, y: 200 }, { x: 560, y: 260 });
  await draw("Текст (T)", { x: 650, y: 250 });
  await page.getByRole("button", { name: "Выделение (V)" }).click();
});

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  return { x: bounds.x + x, y: bounds.y + y };
}

test("selects and moves an object with a zoom-independent world delta", async ({
  page,
}) => {
  const start = await stagePoint(page, 350, 250);
  const finish = await stagePoint(page, 420, 290);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("first-object-position")).toHaveText(
    "Объект: 370, 240",
  );
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-selecting",
    "false",
  );
});

test("supports additive selection, lock and delete", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 250);
  await page.mouse.click(rectangle.x, rectangle.y);
  const focus = await stagePoint(page, 530, 230);
  await page.keyboard.down("Shift");
  await page.mouse.click(focus.x, focus.y);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");

  await page
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await expect(page.getByText("Перемещение заблокировано")).toBeVisible();
  await page
    .getByRole("button", { name: "Разблокировать", exact: true })
    .click();
  await page.getByRole("button", { name: "Удалить" }).click();

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("selects objects with a marquee and cancels preview with Escape", async ({
  page,
}) => {
  const start = await stagePoint(page, 250, 150);
  const finish = await stagePoint(page, 700, 350);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
});
