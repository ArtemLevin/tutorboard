import { expect, test } from "@playwright/test";

test("@smoke spotlight follows the pointer and never mutates the board", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();

  const history = await page.getByTestId("history-depth").textContent();
  const objectCount = await page.getByTestId("object-count").textContent();
  await page.getByRole("button", { name: "Фонарь (Shift+K)" }).click();

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
  await expect
    .poll(() =>
      mask.evaluate((element) => element.style.getPropertyValue("--spotlight-x")),
    )
    .toBe("240px");
  await expect
    .poll(() =>
      mask.evaluate((element) => element.style.getPropertyValue("--spotlight-y")),
    )
    .toBe("190px");

  await page.mouse.click(box.x + 240, box.y + 190);
  await expect(page.getByTestId("object-count")).toHaveText(objectCount ?? "");
  await expect(page.getByTestId("history-depth")).toHaveText(history ?? "");

  const radius = page.getByRole("slider", { name: "Диаметр фонаря" });
  const dim = page.getByRole("slider", { name: "Затемнение фонаря" });
  await radius.focus();
  await radius.press("ArrowRight");
  await dim.focus();
  await dim.press("ArrowRight");
  await expect(mask).toHaveAttribute("data-spotlight-radius", "180");
  await expect(mask).toHaveAttribute("data-spotlight-dim", "80");

  await stage.focus();
  await page.keyboard.press("k");
  await expect(mask).toHaveCount(0);
  await page.keyboard.press("Shift+k");
  await expect(mask).toHaveAttribute("data-spotlight-radius", "180");
  await page.reload();
  await expect(page.getByTestId("board-spotlight-overlay")).toHaveCount(0);
  await expect(page.getByTestId("object-count")).toHaveText(objectCount ?? "");
});

test("@smoke spotlight works in lesson mode without changing document history", async ({
  page,
}) => {
  await page.goto("/");
  const initial = await page.getByTestId("history-depth").textContent();
  await page.getByRole("button", { name: "Режим занятия" }).click();
  const lesson = page.getByRole("toolbar", {
    name: "Инструменты режима занятия",
  });
  await lesson.getByRole("button", { name: "Фонарь — режим занятия" }).click();
  await expect(page.getByTestId("board-spotlight-overlay")).toBeVisible();
  await expect(
    lesson.getByRole("button", { name: "Фонарь — режим занятия" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(lesson).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Фонарь (Shift+K)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("history-depth")).toHaveText(initial ?? "");
});
