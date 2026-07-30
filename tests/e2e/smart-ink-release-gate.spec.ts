import { expect, test } from "@playwright/test";

test.skip(
  process.env.SMART_INK_RELEASE_GATE !== "disabled",
  "Runs against the dedicated production-gated bundle.",
);

test(
  "keeps Smart Ink unavailable in the production release candidate",
  async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("application", {
        name: "Бесконечное полотно TutorBoard",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Smart Ink (I)" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Smart Ink diagnostics")).toHaveCount(0);

    await page.keyboard.press("i");

    await expect(
      page.getByLabel("Подсказка по навигации").getByText("Навигация"),
    ).toBeVisible();
    await expect(page.getByTestId("interaction-state")).toHaveText("idle");
    await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  },
);
