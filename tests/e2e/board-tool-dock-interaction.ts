import { expect, type Page } from "@playwright/test";

/** Open hover-driven tools deterministically after reload, drawing or focus changes. */
export async function expandBoardToolDock(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Развернуть инструменты" });
  if (await toggle.isVisible()) {
    await toggle.hover();
    if (await toggle.isVisible()) await toggle.press("Enter");
  }
  await expect(
    page.getByRole("toolbar", { name: "Инструменты доски" }),
  ).toBeVisible();
}
