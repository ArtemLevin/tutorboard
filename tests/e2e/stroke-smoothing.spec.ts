import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  return { x: bounds.x + x, y: bounds.y + y };
}

async function drawFastStroke(
  page: Page,
  samples: readonly (readonly [number, number])[],
) {
  const first = await stagePoint(page, samples[0]![0], samples[0]![1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of samples.slice(1)) {
    const point = await stagePoint(page, x, y);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
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

  await page.keyboard.press("p");
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

  await page.keyboard.press("v");
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

test("draws fast curves when getCoalescedEvents is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.defineProperty(PointerEvent.prototype, "getCoalescedEvents", {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("p");
  await drawFastStroke(page, [
    [250, 270],
    [310, 225],
    [380, 270],
    [320, 315],
    [255, 360],
    [330, 405],
    [405, 360],
  ]);
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
});

test("consults the coalesced-event API during freehand input", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = PointerEvent.prototype.getCoalescedEvents;
    Reflect.defineProperty(window, "__tutorboardCoalescedCalls", {
      configurable: true,
      value: 0,
      writable: true,
    });
    Reflect.defineProperty(PointerEvent.prototype, "getCoalescedEvents", {
      configurable: true,
      value(this: PointerEvent) {
        const current = Reflect.get(
          window,
          "__tutorboardCoalescedCalls",
        ) as number;
        Reflect.set(window, "__tutorboardCoalescedCalls", current + 1);
        return typeof original === "function" ? original.call(this) : [];
      },
      writable: true,
    });
  });
  await page.goto("/");
  await page.keyboard.press("p");
  await drawFastStroke(page, [
    [260, 320],
    [300, 260],
    [350, 330],
    [410, 250],
    [470, 320],
  ]);
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  const calls = await page.evaluate(
    () => Reflect.get(window, "__tutorboardCoalescedCalls") as number,
  );
  expect(calls).toBeGreaterThan(0);
});
