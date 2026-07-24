import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});

test("pans the viewport without changing object world coordinates", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const offset = page.getByTestId("viewport-offset");
  const objectPosition = page.getByTestId("first-object-position");
  const initialOffset = await offset.textContent();
  const initialObjectPosition = await objectPosition.textContent();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 90,
    bounds.y + bounds.height / 2 - 45,
  );
  await page.mouse.up();

  await expect(offset).not.toHaveText(initialOffset ?? "");
  await expect(objectPosition).toHaveText(initialObjectPosition ?? "");
});

test("zooms at the pointer and keeps BoardDocument coordinates unchanged", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const zoom = page.getByTestId("viewport-zoom");
  const objectPosition = page.getByTestId("first-object-position");
  const initialObjectPosition = await objectPosition.textContent();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.4,
  );
  await page.mouse.wheel(0, -320);

  await expect(zoom).not.toHaveText("100%");
  await expect(objectPosition).toHaveText(initialObjectPosition ?? "");
});

test("cancels a pan preview on Escape", async ({ page }) => {
  const stage = page.getByTestId("board-stage");
  const offset = page.getByTestId("viewport-offset");
  const initialOffset = await offset.textContent();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 120,
    bounds.y + bounds.height / 2 + 60,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(offset).toHaveText(initialOffset ?? "");
  await expect(stage).toHaveAttribute("data-panning", "false");
});

test("supports temporary Space pan when the hand tool is disabled", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const offset = page.getByTestId("viewport-offset");
  const initialOffset = await offset.textContent();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.getByRole("button", { name: /Перемещение/ }).click();
  await page.keyboard.down("Space");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 70,
    bounds.y + bounds.height / 2 + 30,
  );
  await page.mouse.up();
  await page.keyboard.up("Space");

  await expect(offset).not.toHaveText(initialOffset ?? "");
});

test("supports middle-button pan independently of the hand tool", async ({
  page,
}) => {
  const stage = page.getByTestId("board-stage");
  const offset = page.getByTestId("viewport-offset");
  const initialOffset = await offset.textContent();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.getByRole("button", { name: /Перемещение/ }).click();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 55,
    bounds.y + bounds.height / 2 + 25,
  );
  await page.mouse.up({ button: "middle" });

  await expect(offset).not.toHaveText(initialOffset ?? "");
});

test("resizes the canvas backing surface with its workspace", async ({
  page,
}) => {
  const canvas = page.locator(".board-stage canvas").first();
  const initialWidth = await canvas.getAttribute("width");

  await page.setViewportSize({ width: 900, height: 720 });

  await expect.poll(() => canvas.getAttribute("width")).not.toBe(initialWidth);
});
