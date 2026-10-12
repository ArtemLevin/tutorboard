import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
});

async function penEvent(
  page: Page,
  kind:
    | "pointerdown"
    | "pointermove"
    | "pointerup"
    | "pointercancel"
    | "lostpointercapture",
  pointerId: number,
  button: number,
  buttons: number,
) {
  await page.evaluate(
    ({ kind, pointerId, button, buttons }) => {
      const container = document.querySelector<HTMLElement>(".konvajs-content");
      if (container === null) throw new Error("Missing Konva stage container");
      // Browser dispatchEvent does not register synthetic pointers with the UA's
      // pointer-capture system. Let the real Konva session receive and handle
      // synthetic events while keeping the rest of the runtime unchanged.
      // Konva.Stage.container() is the parent of .konvajs-content.
      // Synthetic pointer IDs cannot be captured by the browser itself.
      const stageContainer = container.parentElement;
      if (stageContainer === null) throw new Error("Missing Konva parent");
      for (const element of [container, stageContainer]) {
        element.setPointerCapture = () => {};
        element.releasePointerCapture = () => {};
      }
      const bounds = container.getBoundingClientRect();
      const target = kind === "pointerdown" ? container : window;
      target.dispatchEvent(
        new PointerEvent(kind, {
          bubbles: true,
          pointerId,
          pointerType: "pen",
          isPrimary: true,
          button,
          buttons,
          pressure: buttons === 0 ? 0 : 0.7,
          clientX: bounds.left + 320,
          clientY: bounds.top + 220,
        }),
      );
    },
    { kind, pointerId, button, buttons },
  );
}

test("@smoke third pen profile saves and restores without altering the classic A/B shortcut", async ({
  page,
}) => {
  await page.keyboard.press("p");
  const width = page.getByRole("spinbutton", { name: "Толщина инструмента" });
  await expect(width).toBeVisible();
  await page.getByRole("button", { name: "Применить стиль пера В" }).click();
  await expect(width).toHaveValue("2");
  await width.fill("5.5");
  await width.press("Tab");
  await page.getByRole("button", { name: "Стиль В" }).click();
  await page.keyboard.press("Shift+p");
  await page.getByRole("button", { name: "Применить стиль пера В" }).click();
  await expect(width).toHaveValue("5.5");
  await page
    .getByRole("checkbox", { name: "Кнопка стилуса временно включает ластик" })
    .check();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Применить стиль пера В" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Применить стиль пера В" }).click();
  await expect(width).toHaveValue("5.5");
  await expect(
    page.getByRole("checkbox", {
      name: "Кнопка стилуса временно включает ластик",
    }),
  ).toBeChecked();
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("@smoke a pen barrel button temporarily erases and safely restores the pen", async ({
  page,
}) => {
  await page.keyboard.press("p");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");
  // Opt-in is intentionally disabled on a fresh device.
  await penEvent(page, "pointerdown", 71, 2, 2);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "false");
  await penEvent(page, "pointerup", 71, 2, 0);

  await page
    .getByRole("checkbox", { name: "Кнопка стилуса временно включает ластик" })
    .check();
  await penEvent(page, "pointerdown", 72, 2, 2);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "true");
  await penEvent(page, "pointermove", 72, -1, 2);
  await penEvent(page, "pointerup", 72, 2, 0);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "false");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");

  await penEvent(page, "pointerdown", 73, 5, 32);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "true");
  await penEvent(page, "pointercancel", 73, -1, 0);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "false");

  await penEvent(page, "pointerdown", 74, 2, 2);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "true");
  await penEvent(page, "lostpointercapture", 74, -1, 0);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "false");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");

  await penEvent(page, "pointerdown", 75, 2, 2);
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(stage).toHaveAttribute("data-stylus-eraser-active", "false");
});
