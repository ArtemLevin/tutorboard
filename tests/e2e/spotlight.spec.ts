import { expect, test } from "@playwright/test";

test("@smoke spotlight follows cursor without changing board", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();

  const history = await page.getByTestId("history-depth").textContent();
  const objectCount = await page.getByTestId("object-count").textContent();
  await page.keyboard.press("Shift+k");
  await expect(
    page.getByRole("button", { name: "Фонарь (Shift+K)" }),
  ).toHaveAttribute("aria-pressed", "true");

  const mask = page.getByTestId("board-spotlight-overlay");
  await expect(mask).toBeVisible();
  await expect(stage).toHaveAttribute("data-spotlight-active", "true");
  await expect(stage).toHaveAttribute("data-cursor-kind", "hidden");
  await expect(mask).toHaveAttribute("data-spotlight-radius", "170");
  await expect(mask).toHaveAttribute("data-spotlight-dim", "75");
  await expect(mask).toHaveCSS("pointer-events", "none");

  const box = await stage.boundingBox();
  if (box === null) throw new Error("Missing canvas bounds");
  await page.mouse.move(box.x + 240, box.y + 190);
  await expect(mask).toHaveCSS("--spotlight-x", "240px");
  await expect(mask).toHaveCSS("--spotlight-y", "190px");

  await page.mouse.click(box.x + 240, box.y + 190);
  const objectCounter = page.getByTestId("object-count");
  await expect(objectCounter).toHaveText(objectCount ?? "");
  const historyCounter = page.getByTestId("history-depth");
  await expect(historyCounter).toHaveText(history ?? "");

  const radius = page.getByRole("slider", { name: "Диаметр фонаря" });
  const dim = page.getByRole("slider", { name: "Затемнение фонаря" });
  await radius.focus();
  await radius.press("ArrowRight");
  await dim.focus();
  await dim.press("ArrowRight");
  await expect(mask).toHaveAttribute("data-spotlight-radius", "180");
  await expect(mask).toHaveAttribute("data-spotlight-dim", "80");

  await stage.focus();
  await page.getByRole("button", { name: "Фонарь (Shift+K)" }).click();
  await expect(mask).toHaveCount(0);
  await stage.focus();
  await page.keyboard.press("Shift+k");
  await expect(mask).toHaveAttribute("data-spotlight-radius", "180");
  await page.reload();
  await expect(page.getByTestId("board-spotlight-overlay")).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toHaveText(objectCount ?? "");
});

test("@smoke spotlight in lesson mode preserves history", async ({ page }) => {
  await page.goto("/");
  const initial = await page.getByTestId("history-depth").textContent();
  await page.getByRole("button", { name: "Режим занятия" }).click();
  const lesson = page.getByRole("toolbar", {
    name: "Инструменты режима занятия",
  });
  const lessonSpotlight = lesson.getByRole("button", {
    name: "Фонарь — режим занятия",
  });
  await lessonSpotlight.click();
  await expect(page.getByTestId("board-spotlight-overlay")).toBeVisible();
  await expect(lessonSpotlight).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(lesson).toHaveCount(0);
  const spotlightButton = page.getByRole("button", {
    name: "Фонарь (Shift+K)",
  });
  await expect(spotlightButton).toHaveAttribute("aria-pressed", "true");
  const historyCounter = page.getByTestId("history-depth");
  await expect(historyCounter).toHaveText(initial ?? "");
});
