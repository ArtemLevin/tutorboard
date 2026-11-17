import { expect, type Page } from "@playwright/test";

/**
 * Reveal the hover-only tool dock from a fresh pointer entry.
 *
 * After a canvas gesture or page reload the pointer may still occupy the old
 * toggle position without firing pointerenter on the replacement React tree.
 * Move outside the bottom-centered dock first, then enter its toggle.
 * This exercises the public UI contract and verifies accessible controls.
 */
export async function revealBoardToolDock(page: Page): Promise<void> {
  const toggle = page.getByRole("button", {
    name: /^(Развернуть|Свернуть) инструменты$/u,
  });
  await expect(toggle).toBeVisible();
  await page.mouse.move(8, 8);
  await toggle.hover();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("toolbar", { name: "Инструменты доски" }),
  ).toBeVisible();
}
