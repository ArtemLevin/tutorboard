import { expect, test } from "@playwright/test";

test("@smoke teacher can teach with compact tools and restore chrome", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();

  const objectCount = await page.getByTestId("object-count").textContent();
  await page.getByRole("button", { name: "Режим занятия" }).click();
  const lesson = page.getByRole("toolbar", {
    name: "Инструменты режима занятия",
  });
  await expect(lesson).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Инструменты доски" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Закладки областей" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Перо — режим занятия" }).click();
  await page
    .getByRole("button", { name: "Лазерная указка — режим занятия" })
    .click();
  await expect(
    page.getByRole("button", { name: "Лазерная указка — режим занятия" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(lesson).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Лазерная указка (K)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("object-count")).toHaveText(objectCount ?? "");
});

test("@smoke lesson mode is ephemeral across reload and usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Режим занятия" }).click();

  const lesson = page.getByRole("toolbar", {
    name: "Инструменты режима занятия",
  });
  await expect(lesson).toBeVisible();
  const bounds = await lesson.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(391);
  await page.getByRole("button", { name: "Завершить режим занятия" }).click();
  await expect(lesson).toHaveCount(0);
  await page.getByRole("button", { name: "Режим занятия" }).click();
  await page.reload();
  await expect(lesson).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Режим занятия" }),
  ).toBeVisible();
});
