import { expect, test } from "@playwright/test";

test("automatically accepts and undoes Smart Ink on the main canvas", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }

  await page.getByRole("button", { name: "Smart Ink (I)" }).click();
  const center = {
    x: bounds.x + bounds.width * 0.58,
    y: bounds.y + bounds.height * 0.48,
  };
  const radius = 62;
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

  await expect(
    page.getByRole("complementary", {
      name: "Предложение Smart Ink",
    }),
  ).toHaveCount(0);
  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");
  await expect(
    page.getByRole("complementary", {
      name: "Предложение Smart Ink",
    }),
  ).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("1/1");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("drawing.ellipse")).toBeVisible();
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});
