import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  return { x: bounds.x + x, y: bounds.y + y };
}

async function drawStroke(page: Page): Promise<void> {
  const points = [
    [220, 300],
    [265, 245],
    [320, 275],
    [375, 225],
    [430, 285],
    [485, 245],
  ] as const;
  const first = await stagePoint(page, points[0][0], points[0][1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    const point = await stagePoint(page, x, y);
    await page.mouse.move(point.x, point.y, { steps: 5 });
  }
}

test("renders active ink on the transient layer and records latency", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const prototype = PointerEvent.prototype as PointerEvent & {
      getPredictedEvents?: () => PointerEvent[];
    };
    const original = prototype.getPredictedEvents;
    Reflect.set(window, "__tutorboardPredictedCalls", 0);
    Reflect.defineProperty(prototype, "getPredictedEvents", {
      configurable: true,
      value(this: PointerEvent) {
        const calls = Reflect.get(
          window,
          "__tutorboardPredictedCalls",
        ) as number;
        Reflect.set(window, "__tutorboardPredictedCalls", calls + 1);
        return typeof original === "function" ? original.call(this) : [];
      },
      writable: true,
    });
  });
  await page.goto("/");
  await page.keyboard.press("p");
  await drawStroke(page);

  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-wet-ink-active", "true");
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-wet-ink-frame-count")) ?? 0),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-wet-ink-latency-count")) ?? 0),
    )
    .toBeGreaterThan(0);
  const p95 = Number(
    (await stage.getAttribute("data-wet-ink-latency-p95-ms")) ?? "NaN",
  );
  expect(Number.isFinite(p95)).toBe(true);
  expect(p95).toBeLessThan(1_000);
  const predictedCalls = await page.evaluate(
    () => Reflect.get(window, "__tutorboardPredictedCalls") as number,
  );
  expect(predictedCalls).toBeGreaterThan(0);

  await page.mouse.up();
  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
});

test("draws through the predicted-event fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.defineProperty(PointerEvent.prototype, "getPredictedEvents", {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });
  await page.goto("/");
  await page.keyboard.press("p");
  await drawStroke(page);
  await page.mouse.up();

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-wet-ink-active",
    "false",
  );
});
