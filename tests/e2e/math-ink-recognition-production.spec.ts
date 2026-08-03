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

const providers = [
  {
    id: "paddleocr",
    label: /PaddleOCR Formula Recognition/u,
  },
  {
    id: "local-ocr-llm",
    label: /Локальная OCR-LLM/u,
  },
  {
    id: "yandex-ai-studio",
    label: /Yandex Cloud OCR/u,
  },
] as const;

for (const provider of providers) {
  test(`recognizes captured ink through ${provider.id}`, async ({ page }) => {
    let gatewayRequest: Record<string, unknown> | null = null;
    await page.route(
      "**/api/v1/formula-recognition/recognize",
      async (route) => {
        gatewayRequest = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
        const recognitionId = gatewayRequest.recognitionId;
        if (typeof recognitionId !== "string") {
          throw new Error("Recognition request has no ID.");
        }
        await route.fulfill({
          body: JSON.stringify({
            candidates: [
              { confidence: 0.99, expression: "x^2+1", format: "latex" },
            ],
            diagnostics: [],
            provider: provider.id,
            providerRequestId: `${provider.id}:e2e`,
            providerVersion: "mock-1",
            requestId: recognitionId,
            schemaVersion: "tutorboard.formula-recognition-result/1",
            status: "recognized",
          }),
          contentType: "application/json",
          status: 200,
        });
      },
    );

    await page.goto("/#/settings");
    await expect(
      page.getByRole("heading", {
        name: "Распознавание математических формул",
      }),
    ).toBeVisible();
    await page.getByRole("radio", { name: provider.label }).click();
    await page.getByRole("link", { name: "Доска" }).click();

    await page.keyboard.press("f");
    await expect(
      page.getByRole("button", { name: "ИИ-инструменты" }),
    ).toHaveAttribute("aria-pressed", "true");

    const recognize = page.getByRole("button", { name: "Распознать" });
    if ((await recognize.count()) === 0) {
      if (process.env.MATH_INK_E2E_REQUIRED === "true") {
        throw new Error(
          "The formula recognition production gate requires automatic recognition.",
        );
      }
      test.skip(
        true,
        "Automatic formula recognition is disabled in this build.",
      );
      return;
    }

    await drawStroke(page, [
      { x: 75, y: 220 },
      { x: 125, y: 170 },
      { x: 175, y: 220 },
    ]);
    await expect(page.getByText("Штрихов: 1")).toBeVisible();

    await recognize.click();
    const expression = page.getByRole("textbox", { name: "Функция y =" });
    await expect(expression).toHaveValue("x^(2)+1");
    expect(gatewayRequest).toMatchObject({
      image: {
        data: expect.any(String),
        height: expect.any(Number),
        mimeType: "image/png",
        width: expect.any(Number),
      },
      provider: provider.id,
      schemaVersion: "tutorboard.formula-recognition-request/1",
      source: {
        pointCount: expect.any(Number),
        strokeCount: 1,
      },
    });
    await expect(page.getByTestId("object-count")).toContainText("1 объекта");

    const build = page.getByRole("button", { name: "Построить график" });
    await expect(build).toBeEnabled();
    await build.click();
    await expect(page.getByText("math.coordinate-plot")).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("1 объекта");
  });
}
