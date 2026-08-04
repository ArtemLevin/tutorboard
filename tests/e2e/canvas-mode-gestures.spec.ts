import { expect, test } from "@playwright/test";

test("switches quick modes from empty-canvas primary gestures", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");

  const panButton = page.getByRole("button", { name: "Перемещение (H)" });
  const aiButton = page.getByRole("button", { name: "ИИ-инструменты" });
  const selectionButton = page.getByRole("button", { name: "Выделение" });

  await expect(panButton).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(bounds.x + 280, bounds.y + 190);
  await expect(aiButton).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("h");
  await expect(panButton).toHaveAttribute("aria-pressed", "true");
  await page.mouse.dblclick(bounds.x + 520, bounds.y + 310);
  await expect(selectionButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});
