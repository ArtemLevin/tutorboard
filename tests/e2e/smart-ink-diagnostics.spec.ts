import { expect, test } from "@playwright/test";

test("keeps Smart Ink diagnostics off the canvas during recognition", async ({
  page,
}) => {
  await page.goto("/");
  const diagnostics = page.getByRole("complementary", {
    name: "Диагностика Smart Ink",
  });
  await expect(diagnostics).toHaveCount(0);

  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }

  await page.keyboard.press("i");
  const center = {
    x: bounds.x + bounds.width * 0.52,
    y: bounds.y + bounds.height * 0.42,
  };
  const radius = 58;
  await page.mouse.move(center.x + radius, center.y);
  await page.mouse.down();
  for (let index = 1; index <= 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    await page.mouse.move(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    );
  }
  await page.mouse.up();

  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(diagnostics).toHaveCount(0);
});
