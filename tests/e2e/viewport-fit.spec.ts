import { expect, test } from "@playwright/test";

test("@smoke fits all board objects and then the current selection", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.keyboard.press("r");
  const rectangle = async (x: number, y: number) => {
    await page.mouse.move(bounds.x + x, bounds.y + y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 100, bounds.y + y + 90, {
      steps: 4,
    });
    await page.mouse.up();
  };
  await rectangle(270, 200);
  await rectangle(920, 530);
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");

  await page.keyboard.press("v");
  await page.mouse.click(bounds.x + 280, bounds.y + 220);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");

  await page.keyboard.press("Shift+h");
  const full = await page.getByTestId("viewport-zoom").textContent();
  expect(full).not.toBeNull();

  await page.keyboard.press("Shift+f");
  await expect(page.getByTestId("viewport-zoom")).not.toHaveText(full ?? "");
  const selected = await page.getByTestId("viewport-zoom").textContent();
  expect(parseInt(selected ?? "0", 10)).toBeGreaterThan(
    parseInt(full ?? "0", 10),
  );
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
});

test("@smoke exposes safe fit controls and handles an empty board", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  const before = await page.getByTestId("viewport-offset").textContent();
  await page.getByRole("button", { name: "Настройки доски" }).click();
  await expect(
    page.getByRole("button", { name: "Показать выделенное" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Показать всё" }).click();
  await expect(page.getByTestId("viewport-offset")).toHaveText(before ?? "");
});
