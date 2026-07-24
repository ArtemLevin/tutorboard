import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});

async function canvasPoint(page: Page, xRatio: number, yRatio: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  return {
    x: bounds.x + bounds.width * xRatio,
    y: bounds.y + bounds.height * yRatio,
  };
}

test("creates one normalized primitive per completed gesture", async ({
  page,
}) => {
  const count = page.getByTestId("object-count");
  await expect(count).toHaveText("4 объекта");
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();

  const start = await canvasPoint(page, 0.72, 0.72);
  const end = await canvasPoint(page, 0.55, 0.55);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();

  await expect(count).toHaveText("5 объекта");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing",
    "false",
  );
});

test("Escape and tool switching discard runtime preview", async ({ page }) => {
  const count = page.getByTestId("object-count");
  const stage = page.getByTestId("board-stage");
  await page.getByRole("button", { name: "Эллипс (E)" }).click();

  const start = await canvasPoint(page, 0.55, 0.6);
  const end = await canvasPoint(page, 0.7, 0.72);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await expect(stage).toHaveAttribute("data-drawing", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(count).toHaveText("4 объекта");
  await expect(stage).toHaveAttribute("data-drawing", "false");

  await page.getByRole("button", { name: "Линия (L)" }).click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.getByRole("button", { name: "Перо (P)" }).dispatchEvent("click");
  await page.mouse.up();

  await expect(count).toHaveText("4 объекта");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  await expect(stage).toHaveAttribute("data-drawing", "false");
});

test("creates pen and text objects through their tools", async ({ page }) => {
  const count = page.getByTestId("object-count");
  await page.getByRole("button", { name: "Перо (P)" }).click();
  const start = await canvasPoint(page, 0.5, 0.62);
  const end = await canvasPoint(page, 0.68, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(count).toHaveText("5 объекта");

  await page.getByRole("button", { name: "Текст (T)" }).click();
  await page
    .getByRole("textbox", { name: "Содержимое текста" })
    .fill("Угол ABC");
  const textPoint = await canvasPoint(page, 0.62, 0.75);
  await page.mouse.click(textPoint.x, textPoint.y);

  await expect(count).toHaveText("6 объекта");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
});
