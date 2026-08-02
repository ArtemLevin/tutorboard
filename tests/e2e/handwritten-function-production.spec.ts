import { expect, test, type Page } from "@playwright/test";

async function drawStroke(
  page: Page,
  points: readonly { readonly x: number; readonly y: number }[],
): Promise<void> {
  const canvas = page.locator(".konvajs-content").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("TutorBoard canvas has no layout box.");
  const [first, ...rest] = points;
  if (first === undefined)
    throw new Error("Stroke requires at least one point.");
  await page.mouse.move(box.x + first.x, box.y + first.y);
  await page.mouse.down();
  for (const point of rest) {
    await page.mouse.move(box.x + point.x, box.y + point.y, { steps: 4 });
  }
  await page.mouse.up();
}

test.describe("handwritten function production workflow", () => {
  test("preserves ink, builds a plot, supports undo and reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Рукописная функция (F)" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Рукописная функция (F)" }).click();
    await drawStroke(page, [
      { x: 160, y: 500 },
      { x: 210, y: 450 },
      { x: 260, y: 500 },
    ]);
    await drawStroke(page, [
      { x: 280, y: 445 },
      { x: 325, y: 485 },
      { x: 280, y: 535 },
    ]);

    await expect(page.getByText("Штрихов: 2")).toBeVisible();
    await page.getByRole("button", { name: "Сохранить штрихи" }).click();
    await expect(page.getByText("Штрихи сохранены")).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("2 объекта");

    const expression = page.getByRole("textbox", { name: "Функция y =" });
    await expression.fill("a*x^2+b");
    await expect(page.getByText("a, b")).toBeVisible();
    const build = page.getByRole("button", { name: "Построить график" });
    await expect(build).toBeEnabled();
    await build.click();

    await expect(page.getByTestId("object-count")).toContainText("1 объекта");
    await expect(page.getByText("math.coordinate-plot")).toBeVisible();

    await page.getByRole("button", { name: "Отменить (Ctrl+Z)" }).click();
    await expect(page.getByTestId("object-count")).toContainText("2 объекта");
    await expect(page.getByText("drawing.pen-stroke")).toHaveCount(2);

    await page
      .getByRole("button", { name: "Повторить (Ctrl+Shift+Z)" })
      .click();
    await expect(page.getByText("math.coordinate-plot")).toBeVisible();
    await expect(page.getByTestId("persistence-status")).toContainText(
      "Сохранено локально",
      { timeout: 15_000 },
    );

    await page.reload();
    await expect(page.getByText("math.coordinate-plot")).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("1 объекта");
  });
});
