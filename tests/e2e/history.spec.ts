import { expect, test } from "@playwright/test";

test(
  "undoes and redoes a complete drawing gesture",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
  await page.getByRole("button", { name: "Развернуть инструменты" }).hover();
    await expect(
      page.getByRole("application", {
        name: "Бесконечное полотно TutorBoard",
      }),
    ).toBeVisible();

    await page.keyboard.press("r");
    const bounds = await page.getByTestId("board-stage").boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) {
      throw new Error("Canvas has no bounds.");
    }
    await page.mouse.move(bounds.x + 240, bounds.y + 180);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 380, bounds.y + 280, { steps: 5 });
    await page.mouse.up();

    await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");

    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
    await expect(page.getByTestId("history-depth")).toHaveText("0/1");

    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");
  },
);

test(
  "limits retained gestures through settings and restores the preference after reload",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
  await page.getByRole("button", { name: "Развернуть инструменты" }).hover();
    await page.getByRole("button", { name: "Настройки доски" }).click();
    const select = page.getByRole("combobox", {
      name: "Количество сохраняемых действий Undo",
    });
    await expect(select).toHaveValue("5");
    await select.selectOption("10");
    await page.getByRole("button", { name: "Закрыть настройки доски" }).click();

    await page.keyboard.press("r");
    const stage = page.getByTestId("board-stage");
    const bounds = await stage.boundingBox();
    if (bounds === null) throw new Error("Canvas has no bounds.");
    for (let i = 0; i < 7; i += 1) {
      await page.mouse.move(bounds.x + 120 + i * 18, bounds.y + 180);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 180 + i * 18, bounds.y + 225, {
        steps: 3,
      });
      await page.mouse.up();
    }
    await expect(page.getByTestId("history-depth")).toHaveText("7/0");

    await page.getByRole("button", { name: "Настройки доски" }).click();
    await select.selectOption("3");
    await expect(page.getByTestId("history-depth")).toHaveText("3/0");
    await expect(page.getByTestId("object-count")).toHaveText("7 объекта");
    await page.getByRole("button", { name: "Закрыть настройки доски" }).click();

    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Control+z");
    await expect(page.getByTestId("object-count")).toHaveText("4 объекта");
    await expect(page.getByTestId("history-depth")).toHaveText("0/3");
    await page.reload();
    await page.getByRole("button", { name: "Настройки доски" }).click();
    await expect(select).toHaveValue("3");
  },
);
