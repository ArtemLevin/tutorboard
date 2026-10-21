import { expect, test } from "@playwright/test";

test.skip(
  process.env.SMART_INK_RELEASE_GATE !== "disabled",
  "Runs against the dedicated production-gated bundle.",
);

test("keeps Smart Ink unavailable in the production release candidate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();

  const toolDock = page.getByRole("toolbar", { name: "Инструменты доски" });
  await expect(toolDock).toBeVisible();
  await toolDock.getByRole("button", { name: "ИИ-инструменты" }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Smart Ink (I)" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Smart Ink diagnostics")).toHaveCount(0);

  await page.keyboard.press("i");

  await expect(
    toolDock.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("interaction-state")).toHaveText("idle");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

for (const { mode, shortcut, activeAttribute, activeValue } of [
  {
    mode: "navigation",
    shortcut: null,
    activeAttribute: "data-pan-mode",
    activeValue: "true",
  },
  {
    mode: "selection",
    shortcut: "v",
    activeAttribute: "data-selection-mode",
    activeValue: "selection.select",
  },
] as const) {
  test(`does not enable gated Smart Ink after a canvas tap in ${mode} mode`, async ({
    page,
  }) => {
    await page.goto("/");
    const stage = page.getByTestId("board-stage");
    await expect(stage).toBeVisible();
    if (shortcut !== null) await page.keyboard.press(shortcut);

    await expect(stage).toHaveAttribute(activeAttribute, activeValue);
    await expect(stage).toHaveAttribute("data-drawing-mode", "none");

    const bounds = await stage.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("Canvas has no bounds.");

    await page.clock.install();
    await page.mouse.click(
      bounds.x + bounds.width * 0.55,
      bounds.y + bounds.height * 0.45,
    );
    // Single taps are dispatched after the 500 ms double-click window.
    await page.clock.runFor(550);

    await expect(stage).toHaveAttribute(activeAttribute, activeValue);
    await expect(stage).toHaveAttribute("data-drawing-mode", "none");
    await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
  });
}

test("keeps ordinary pen drawing available when Smart Ink is gated", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  await page.keyboard.press("p");
  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");

  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  await page.mouse.move(bounds.x + 240, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 360, bounds.y + 240, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
});
