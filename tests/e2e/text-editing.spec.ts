import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test(
  "edits existing multiline text as one committed history item",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("board-stage")).toBeVisible();
    await page.getByRole("button", { name: "Рисование" }).click();
    await page.getByRole("menuitemradio", { name: "Текст (T)" }).click();
    await page
      .getByRole("textbox", { name: "Содержимое текста" })
      .fill("Before");
    const bounds = await page.getByTestId("board-stage").boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("Canvas has no bounds.");
    await page.mouse.click(bounds.x + 320, bounds.y + 240);
    const placementEditor = page.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await expect(placementEditor).toBeVisible();
    await placementEditor.press("Control+Enter");
    await expect(placementEditor).toHaveCount(0);
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");
    await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
    const textPoint = { x: bounds.x + 330, y: bounds.y + 250 };
    await rightDoubleClickAt(page, textPoint);

    const editor = page.getByRole("textbox", {
      name: "Редактор выбранного текста",
    });
    await expect(editor).toHaveValue("Before");
    await editor.fill("Первая строка");
    await editor.press("Enter");
    await editor.type("Вторая строка");
    const editedText = "Первая строка\nВторая строка";
    await expect(editor).toHaveValue(editedText);
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");

    await editor.press("Shift+Enter");
    await expect(editor).toHaveValue(editedText);
    await expect(page.getByTestId("history-depth")).toHaveText("2/0");

    await page.keyboard.press("Control+z");
    await expect(
      page.getByRole("textbox", { name: "Редактор выбранного текста" }),
    ).toHaveValue("Before");
    await expect(page.getByTestId("history-depth")).toHaveText("1/1");

    await page.keyboard.press("Control+Shift+z");
    await expect(
      page.getByRole("textbox", { name: "Редактор выбранного текста" }),
    ).toHaveValue(editedText);
    await expect(page.getByTestId("history-depth")).toHaveText("2/0");
  },
);

test(
  "edits a new text draft directly on the board before one-step commit",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("board-stage")).toBeVisible();
    await page.keyboard.press("t");
    const bounds = await page.getByTestId("board-stage").boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("Canvas has no bounds.");

    await page.mouse.click(bounds.x + 360, bounds.y + 260);
    const editor = page.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await expect(editor).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("0");

    await editor.fill(String.raw`$x^2 + \alpha$`);
    await expect(editor).toHaveValue(String.raw`$x^2 + \alpha$`);
    await expect(page.getByTestId("object-count")).toContainText("0");

    await editor.press("Enter");
    await expect(editor).toHaveValue(String.raw`$x^2 + \alpha$` + "\n");
    await editor.press("Shift+Enter");
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("object-count")).toContainText("1");
    await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");

    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("object-count")).toContainText("0");
  },
);

test("cancels an unsaved text draft with Escape and switches to selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.keyboard.press("t");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.click(bounds.x + 420, bounds.y + 300);
  const editor = page.getByRole("textbox", {
    name: "Редактор текста на доске",
  });
  await expect(editor).toBeVisible();
  await editor.fill("Черновик");

  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toContainText("0");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-selection-mode",
    "selection.select",
  );
});


test(
  "keeps text editing IME-safe and cancels an existing draft without history",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("board-stage")).toBeVisible();
    await page.keyboard.press("t");
    const bounds = await page.getByTestId("board-stage").boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("Canvas has no bounds.");

    await page.mouse.click(bounds.x + 380, bounds.y + 280);
    const placementEditor = page.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await placementEditor.fill("IME draft");
    await placementEditor.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent("compositionstart", {
          bubbles: true,
          data: "あ",
        }),
      );
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          isComposing: true,
          key: "Enter",
          shiftKey: true,
        }),
      );
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          isComposing: true,
          key: "Escape",
        }),
      );
    });
    await expect(placementEditor).toBeVisible();
    await expect(page.getByTestId("object-count")).toContainText("0");
    await expect(page.getByTestId("board-stage")).toHaveAttribute(
      "data-drawing-mode",
      "drawing.text",
    );

    await placementEditor.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: "あ",
        }),
      );
    });
    await placementEditor.press("Shift+Enter");
    await expect(placementEditor).toHaveCount(0);
    await expect(page.getByTestId("object-count")).toContainText("1");
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");

    const textPoint = { x: bounds.x + 390, y: bounds.y + 290 };
    await rightDoubleClickAt(page, textPoint);
    const selectedEditor = page.getByRole("textbox", {
      name: "Редактор выбранного текста",
    });
    await expect(selectedEditor).toHaveValue("IME draft");
    await selectedEditor.fill("Unsaved change");
    await selectedEditor.press("Escape");
    await expect(selectedEditor).toHaveValue("IME draft");
    await expect(page.getByTestId("history-depth")).toHaveText("1/0");
  },
);
