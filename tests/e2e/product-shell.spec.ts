import { expect, test } from "@playwright/test";

test("navigates the offline product shell routes", async ({ page }) => {
  await page.goto("/#/documents");
  await expect(page.getByRole("heading", { name: "Документы" })).toBeVisible();
  await expect(page.getByText("TutorBoard canvas")).toBeVisible();

  await page.getByRole("link", { name: "Настройки" }).click();
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.getByText("documentSnapshots")).toBeVisible();

  await page.getByRole("link", { name: "Диагностика" }).click();
  await expect(
    page.getByRole("heading", { name: "Диагностика" }),
  ).toBeVisible();
  await expect(page.getByText("BoardDocument")).toBeVisible();

  await page.getByRole("link", { name: "Доска" }).click();
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});
