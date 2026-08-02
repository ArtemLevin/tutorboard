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
  if (first === undefined)
    throw new Error("Stroke requires at least one point.");
  const clientPoint = { x: box.x + first.x, y: box.y + first.y };
  await page.mouse.move(clientPoint.x, clientPoint.y);
  await page.mouse.down();
  await expect(boardStage).toHaveAttribute("data-drawing", "true");
  for (const point of rest) {
    await page.mouse.move(box.x + point.x, box.y + point.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(boardStage).toHaveAttribute("data-drawing", "false");
}

test.describe("Mathpix proxy browser composition", () => {
  test("recognizes captured ink and builds the provider-derived plot", async ({
    page,
  }) => {
    let proxyRequest: Record<string, unknown> | null = null;
    await page.route("**/api/v1/math-ink/recognize", async (route) => {
      proxyRequest = route.request().postDataJSON() as Record<string, unknown>;
      const recognitionId = proxyRequest.recognitionId;
      if (typeof recognitionId !== "string") {
        throw new Error("Recognition request has no ID.");
      }
      await route.fulfill({
        body: JSON.stringify({
          candidates: [
            { confidence: 0.99, expression: "x^2+1", format: "latex" },
          ],
          diagnostics: [],
          provider: "mathpix",
          providerRequestId: "mathpix:e2e",
          providerVersion: "mock-1",
          requestId: recognitionId,
          schemaVersion: "tutorboard.math-ink-proxy-result/0.1",
          status: "recognized",
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await page.goto("/");
    const handwrittenTool = page.getByRole("button", {
      name: "Рукописная функция (F)",
    });
    await handwrittenTool.click();
    await expect(handwrittenTool).toHaveAttribute("aria-pressed", "true");

    await drawStroke(page, [
      { x: 75, y: 220 },
      { x: 125, y: 170 },
      { x: 175, y: 220 },
    ]);
    await expect(page.getByText("Штрихов: 1")).toBeVisible();

    await page.getByRole("button", { name: "Распознать" }).click();
    const expression = page.getByRole("textbox", { name: "Функция y =" });
    await expect(expression).toHaveValue("x^2+1");
    expect(proxyRequest).toMatchObject({
      schemaVersion: "tutorboard.math-ink-request/0.1",
      strokes: [expect.objectContaining({ id: expect.any(String) })],
    });
    await expect(page.getByTestId("object-count")).toContainText("1 объекта");

    const build = page.getByRole("button", { name: "Построить график" });
    await expect(build).toBeEnabled();
    await build.click();
    await expect(page.getByText("math.coordinate-plot")).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("1 объекта");
  });
});
