import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
});

test("@smoke saves up to five favorite tool shortcuts and restores them after reload", async ({
  page,
}) => {
  const toolbar = page.getByRole("toolbar", { name: "Инструменты доски" });
  await expect(
    toolbar.getByRole("button", { name: /Избранное: Перо/ }),
  ).toBeVisible();
  await toolbar.getByRole("button", { name: "Избранное", exact: true }).click();
  const favorites = page.getByRole("menu", {
    name: "Меню избранных инструментов",
  });
  await expect(
    favorites.getByRole("menuitemcheckbox", { name: "Линия" }),
  ).toHaveAttribute("aria-checked", "true");

  await favorites.getByRole("menuitemcheckbox", { name: "Линия" }).click();
  await favorites.getByRole("menuitemcheckbox", { name: "Эллипс" }).click();
  await favorites.getByRole("menuitemcheckbox", { name: "Текст" }).click();
  await favorites
    .getByRole("menuitemcheckbox", { name: "Прямоугольник" })
    .click();
  await expect(
    favorites.getByRole("menuitemcheckbox", { name: "Smart Ink" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(favorites).toHaveCount(0);
  await expect(
    toolbar.getByRole("button", { name: /Избранное: Эллипс/ }),
  ).toBeVisible();
  await toolbar.getByRole("button", { name: /Избранное: Эллипс/ }).click();
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing-mode",
    "drawing.ellipse",
  );
  await page.reload();
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: /Избранное: Эллипс/ }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: /Избранное: Линия/ }),
  ).toHaveCount(0);
});

test("@smoke saves two pen styles, switches instantly, and keeps classic color shortcuts", async ({
  page,
}) => {
  await page.keyboard.press("p");
  const width = page.getByRole("spinbutton", {
    name: "Толщина инструмента",
  });
  await expect(width).toBeVisible();
  await width.fill("4.5");
  await width.press("Tab");
  await page.getByRole("button", { name: "Стиль А" }).click();

  await page.getByRole("button", { name: "Применить стиль пера Б" }).click();
  await expect(width).toHaveValue("6");
  await page.getByRole("button", { name: "Применить стиль пера А" }).click();
  await expect(width).toHaveValue("4.5");
  await page.keyboard.press("Shift+p");
  await expect(width).toHaveValue("6");

  // Standard numeric color shortcut continues to update the active pen.
  await page.keyboard.press("1");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-drawing-mode",
    "drawing.pen",
  );
  await page.reload();
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await page.getByRole("button", { name: "Применить стиль пера А" }).click();
  await expect(width).toHaveValue("4.5");
  await page.getByRole("button", { name: "Применить стиль пера Б" }).click();
  await expect(width).toHaveValue("6");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("favorites persist as device UI preferences without BoardDocument commands", async ({
  page,
}) => {
  const before = await page.getByTestId("object-count").textContent();
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Прямоугольник" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("object-count")).toHaveText(before ?? "");
  const stored = await page.evaluate(() =>
    localStorage.getItem("tutorboard.quick-tools/1"),
  );
  expect(stored).not.toBeNull();
  const preferences = JSON.parse(stored ?? "{}") as {
    schemaVersion?: string;
    favorites?: string[];
  };
  expect(preferences.schemaVersion).toBe("tutorboard.quick-tools/1");
  expect(preferences.favorites).toContain("drawing.rectangle");
});
