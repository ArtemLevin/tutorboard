import { expect, test } from "@playwright/test";

test("loads the TutorBoard foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "TutorBoard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Границы архитектуры" }),
  ).toBeVisible();
});
