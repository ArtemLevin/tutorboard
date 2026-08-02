import { expect, test, type Page } from "@playwright/test";

async function drawStroke(
  page: Page,
  points: readonly { readonly x: number; readonly y: number }[],
): Promise<void> {
  const canvas = page.locator(".konvajs-content").first();
  const boardStage = page.getByTestId("board-stage");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("TutorBoard canvas has no layout box.");
  const [first, ...rest] = points;
  if (first === undefined) {
    throw new Error("Stroke requires at least one point.");
  }
  for (const point of points) {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= box.width ||
      point.y >= box.height
    ) {
      throw new Error("Stroke point is outside the TutorBoard canvas.");
    }
  }
  const clientPoint = { x: box.x + first.x, y: box.y + first.y };
  const targetsCanvas = await canvas.evaluate(
    (element, point) =>
      element.contains(document.elementFromPoint(point.x, point.y)),
    clientPoint,
  );
  if (!targetsCanvas) {
    throw new Error("Stroke start is covered by another interface element.");
  }
  await page.mouse.move(clientPoint.x, clientPoint.y);
  await page.mouse.down();
  await expect(boardStage).toHaveAttribute("data-drawing", "true");
  for (const point of rest) {
    await page.mouse.move(box.x + point.x, box.y + point.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(boardStage).toHaveAttribute("data-drawing", "false");
}

test.describe("handwritten function production workflow", () => {
  test("preserves ink, builds a plot, supports undo and reload", async ({
    page,
  }) => {
    await page.goto("/");
    const handwrittenTool = page.getByRole("button", {
      name: "Рукописная функция (F)",
    });
    await expect(handwrittenTool).toBeVisible();

    await handwrittenTool.click();
    await expect(handwrittenTool).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("complementary", { name: "Рукописная функция" }),
    ).toBeVisible();

    await drawStroke(page, [
      { x: 70, y: 220 },
      { x: 120, y: 170 },
      { x: 170, y: 220 },
    ]);
    await expect(page.getByText("Штрихов: 1")).toBeVisible();

    await drawStroke(page, [
      { x: 190, y: 165 },
      { x: 235, y: 205 },
      { x: 190, y: 255 },
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
