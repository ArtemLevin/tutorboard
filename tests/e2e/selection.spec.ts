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
  await expect(page.getByText("Трансформация заблокирована")).toBeVisible();
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

test("scales and rotates a selected figure with undo support", async ({
  page,
}) => {
  const rectangle = await stagePoint(page, 350, 250);
  await page.mouse.click(rectangle.x, rectangle.y);
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );

  await page
    .getByRole("button", { name: "Увеличить выделение на 10%" })
    .click();
  await page
    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })
    .click();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 15°",
  );

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 0°",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1, 1 · Поворот: 0°",
  );
});

test("selects a figure contour directly from another tool", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  const contour = await stagePoint(page, 300, 250);
  await page.mouse.click(contour.x, contour.y);

  await expect(
    page.getByRole("button", { name: "Выделение (V)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();
});

test("right drag switches to canvas movement and pans the viewport", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const start = await stagePoint(page, 650, 430);
  const finish = await stagePoint(page, 720, 480);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-panning",
    "true",
  );
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up({ button: "right" });

  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("viewport-offset")).toHaveText("x 70 · y 50");
  await expect(page.getByTestId("object-count")).toHaveText("3 объекта");
});

test("applies all seven line styles to a selected figure", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 250);
  await page.mouse.click(rectangle.x, rectangle.y);
  for (const label of [
    "Тонкая",
    "Толстая",
    "Пунктирная",
    "Точка-пунктир",
    "Волнистая",
    "Карандаш",
    "Ручка",
  ]) {
    const option = page.getByRole("button", { name: `Стиль линии: ${label}` });
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }
});
