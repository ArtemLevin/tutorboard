import { expect, test } from "@playwright/test";

test("@smoke full reset after reversible clear", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Board stage unavailable");

  const openClearDialog = async () => {
    await page.mouse.click(
      bounds.x + bounds.width * 0.85,
      bounds.y + bounds.height * 0.8,
      { button: "right" },
    );
    await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  };

  await page.keyboard.press("r");
  await page.mouse.move(bounds.x + 180, bounds.y + 250);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 310, bounds.y + 305, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");

  await openClearDialog();
  await page.getByRole("radio", { name: /Обычная очистка/ }).check();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("history-depth")).not.toHaveText("0/0");

  // The context menu must still offer reset on a visually empty board.
  await openClearDialog();
  await expect(
    page.getByRole("radio", { name: /Полный сброс \(по умолчанию\)/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Обычная очистка/ }),
  ).toBeDisabled();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Восстановить удалённые объекты через Undo нельзя",
  );
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(page.getByTestId("history-depth")).toHaveText("0/0");
  await expect(stage).toHaveAttribute("data-visible-object-count", "0");
  await expect(stage).toHaveAttribute("data-wheel-cache-retained-runs", "0");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("0/0");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  await page.keyboard.press("r");
  await page.mouse.move(bounds.x + 200, bounds.y + 240);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 340, bounds.y + 285, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});
