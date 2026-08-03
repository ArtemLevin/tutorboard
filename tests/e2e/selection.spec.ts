import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", { name: "Бесконечное полотно TutorBoard" }),
  ).toBeVisible();

  const draw = async (
    tool: "Прямоугольник (R)" | "Эллипс (E)" | "Текст (T)",
    start: { x: number; y: number },
    finish = start,
  ) => {
    await page.keyboard.press(
      tool === "Прямоугольник (R)" ? "r" : tool === "Эллипс (E)" ? "e" : "t",
    );
    const from = await stagePoint(page, start.x, start.y);
    const to = await stagePoint(page, finish.x, finish.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", { x: 300, y: 160 }, { x: 400, y: 260 });
  await draw("Эллипс (E)", { x: 500, y: 160 }, { x: 560, y: 220 });
  await draw("Текст (T)", { x: 650, y: 210 });
  await page.keyboard.press("v");
});

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  return { x: bounds.x + x, y: bounds.y + y };
}

async function dragMarquee(page: Page) {
  const start = await stagePoint(page, 250, 110);
  const finish = await stagePoint(page, 700, 310);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-selecting",
    "true",
  );
  return { finish, start };
}

test("selects and moves an object with a zoom-independent world delta", async ({
  page,
}) => {
  const start = await stagePoint(page, 350, 210);
  await page.mouse.click(start.x, start.y);
  const finish = await stagePoint(page, 420, 250);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("first-object-position")).toHaveText(
    "Объект: 370, 200",
  );
});

test("supports additive selection, lock and delete", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  const ellipse = await stagePoint(page, 530, 190);
  await page.keyboard.down("Shift");
  await page.mouse.click(ellipse.x, ellipse.y);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await rightDoubleClickAt(page, ellipse);

  await page
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Разблокировать", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Разблокировать", exact: true })
    .click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("selects objects with a marquee", async ({ page }) => {
  await dragMarquee(page);
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
});

test("cancels a marquee preview with Escape", async ({ page }) => {
  await dragMarquee(page);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("scales and rotates a selected figure with undo support", async ({
  page,
}) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await rightDoubleClickAt(page, rectangle);
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

test("uses the explicit selection tool for an existing figure", async ({
  page,
}) => {
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Фигуры" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("v");
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, rectangle);
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();
});

test("right drag switches to canvas movement and pans the viewport", async ({
  page,
}) => {
  await page.keyboard.press("r");
  const start = await stagePoint(page, 650, 350);
  const finish = await stagePoint(page, 720, 400);
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
});

test("chooses all eight line styles from a popover", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await rightDoubleClickAt(page, rectangle);
  const menu = page.getByRole("menu", { name: "Стиль линии" });
  for (const label of [
    "Тонкая",
    "Толстая",
    "Пунктирная",
    "Точка-пунктир",
    "Волнистая",
    "Карандаш — скетчбук",
    "Ручка — скетчбук",
    "Маркер",
  ]) {
    await page.getByRole("button", { name: /^Стиль линии:/ }).click();
    await expect(menu).toBeVisible();
    await page.getByRole("menuitemradio", { name: label }).click();
    await expect(menu).toHaveCount(0);
  }
});

test("selects selectively with a freeform lasso", async ({ page }) => {
  await page.getByRole("button", { name: "Лассо (L)" }).click();
  const traceLasso = async (
    points: readonly (readonly [number, number])[],
    modifier?: "Alt" | "Shift",
  ) => {
    if (modifier !== undefined) await page.keyboard.down(modifier);
    const first = await stagePoint(page, points[0]![0], points[0]![1]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      const point = await stagePoint(page, x, y);
      await page.mouse.move(point.x, point.y, { steps: 3 });
    }
    await page.mouse.up();
    if (modifier !== undefined) await page.keyboard.up(modifier);
  };
  await traceLasso([
    [250, 110],
    [610, 110],
    [610, 300],
    [250, 300],
    [250, 110],
  ]);
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await traceLasso(
    [
      [600, 400],
      [760, 400],
      [760, 100],
      [600, 100],
      [600, 400],
    ],
    "Shift",
  );
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
});
