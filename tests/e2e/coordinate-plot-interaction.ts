import { expect, type Page } from "@playwright/test";

async function dispatchRightClick(
  page: Page,
  pointerId: number,
): Promise<void> {
  await page.evaluate((id) => {
    const container = document.querySelector<HTMLElement>(".konvajs-content");
    if (container === null) throw new Error("Expected Konva stage container");
    const bounds = container.getBoundingClientRect();
    const clientX = bounds.left + bounds.width / 2;
    const clientY = bounds.top + bounds.height / 2;
    for (const [type, buttons] of [
      ["pointerdown", 2],
      ["pointerup", 0],
    ] as const) {
      container.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 2,
          buttons,
          cancelable: true,
          clientX,
          clientY,
          pointerId: id,
          pointerType: "mouse",
        }),
      );
    }
  }, pointerId);
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
): Promise<void> {
  await dispatchRightClick(page, 41);
  await page.waitForTimeout(60);
  await dispatchRightClick(page, 42);
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();
}