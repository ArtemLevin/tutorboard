import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("automatically accepts and undoes Smart Ink on the main canvas", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }

  await page.keyboard.press("i");
  const center = {
    x: bounds.x + bounds.width * 0.58,
    y: bounds.y + bounds.height * 0.48,
  };
  const radius = 62;
  await page.mouse.move(center.x + radius, center.y);
  await page.mouse.down();
  for (let index = 1; index <= 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    await page.mouse.move(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    );
  }
  await page.mouse.up();

  await expect(
    page.getByRole("complementary", {
      name: "Предложение Smart Ink",
    }),
  ).toHaveCount(0);
  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");
  await expect(
    page.getByRole("complementary", {
      name: "Предложение Smart Ink",
    }),
  ).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("1/1");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("transforms a figure created by Smart Ink", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }

  await page.keyboard.press("i");
  const center = {
    x: bounds.x + bounds.width * 0.55,
    y: bounds.y + bounds.height * 0.45,
  };
  const radius = 58;
  await page.mouse.move(center.x + radius, center.y);
  await page.mouse.down();
  for (let index = 1; index <= 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    await page.mouse.move(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    );
  }
  await page.mouse.up();
  await expect(page.getByText("drawing.ellipse")).toBeVisible();

  await page.keyboard.press("v");
  const contourOffset = radius / Math.sqrt(2);
  const contour = {
    x: center.x + contourOffset,
    y: center.y + contourOffset,
  };
  await page.mouse.click(contour.x, contour.y);
  await rightDoubleClickAt(page, contour);
  await page
    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })
    .click();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1, 1 · Поворот: 15°",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1, 1 · Поворот: 0°",
  );
});

test("keeps unrecognized Smart Ink silently as the original stroke", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.keyboard.press("i");
  const points = [
    [320, 220],
    [360, 180],
    [390, 260],
    [430, 195],
    [465, 275],
    [505, 210],
  ] as const;
  await page.mouse.move(bounds.x + points[0][0], bounds.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 3 });
  }
  await page.mouse.up();

  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
  await expect(
    page.getByText("Smart Ink: фигура не распознана, исходный штрих сохранён."),
  ).toHaveCount(0);
});
