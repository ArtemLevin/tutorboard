import { expect, type Page } from "@playwright/test";

/** Expand board tools via the accessible keyboard toggle on every browser. */
export async function expandBoardToolDock(page: Page): Promise<void> {
  const toggle = page.locator(".board-tool-dock-toggle");
  const toolbar = page.locator("#board-tool-dock-toolbar");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.press("Enter");
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toolbar).toBeVisible();
}
