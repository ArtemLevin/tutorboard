import { expect, test, type Page } from "@playwright/test";

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("TutorBoard stage is missing");
  return { x: bounds.x + x, y: bounds.y + y };
}

async function addRectangle(page: Page, x: number, y: number) {
  await page.keyboard.press("r");
  const from = await stagePoint(page, x, y);
  const to = await stagePoint(page, x + 70, y + 50);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function openSelectionMenu(page: Page, x: number, y: number) {
  const point = await stagePoint(page, x, y);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Меню выделения" });
  await expect(menu).toBeVisible();
  return menu;
}

test("aligns a multi-selection with one undo entry, then distributes and restores @smoke", async ({
  page,
}) => {
  await page.goto("/");
  await addRectangle(page, 300, 180);
  await addRectangle(page, 460, 180);
  await addRectangle(page, 650, 180);
  await expect(page.getByTestId("object-count")).toHaveText("3 объекта");
  await page.keyboard.press("v");
  const from = await stagePoint(page, 260, 125);
  const to = await stagePoint(page, 760, 290);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
  const menu = await openSelectionMenu(page, 300, 205);
  await expect(
    menu.getByRole("menuitem", { name: "По горизонтали" }),
  ).toBeEnabled();
  await menu.getByRole("menuitem", { name: "По горизонтали" }).click();
  await expect(page.getByTestId("history-depth")).toHaveText("4/0");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("history-depth")).toHaveText("3/1");
  await page.keyboard.press("Control+y");
  await expect(page.getByTestId("history-depth")).toHaveText("4/0");
  const aligned = await openSelectionMenu(page, 300, 205);
  await aligned.getByRole("menuitem", { name: "Сверху" }).click();
  // Objects are already aligned on the top edge, so there is no history entry.
  await expect(page.getByTestId("history-depth")).toHaveText("4/0");
  const right = await openSelectionMenu(page, 300, 205);
  await right.getByRole("menuitem", { name: "Справа" }).click();
  await expect(page.getByTestId("history-depth")).toHaveText("5/0");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("history-depth")).toHaveText("4/1");
});

test("duplicates using a single paste command and safely locks the selection @smoke", async ({
  page,
}) => {
  await page.goto("/");
  await addRectangle(page, 300, 180);
  await page.keyboard.press("v");
  const point = await stagePoint(page, 300, 205);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  const menu = await openSelectionMenu(page, 300, 205);
  await expect(menu.getByRole("menuitem", { name: "Слева" })).toBeDisabled();
  await menu.getByRole("menuitem", { name: "Дублировать" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  // Undo removes the newly selected duplicate; select the original again.
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  const selected = await openSelectionMenu(page, 300, 205);
  await selected.getByRole("menuitem", { name: "Заблокировать" }).click();
  const locked = await openSelectionMenu(page, 300, 205);
  await expect(
    locked.getByRole("menuitem", { name: "Дублировать" }),
  ).toBeDisabled();
  await locked.getByRole("menuitem", { name: "Разблокировать" }).click();
  const unlocked = await openSelectionMenu(page, 300, 205);
  await expect(
    unlocked.getByRole("menuitem", { name: "Дублировать" }),
  ).toBeEnabled();
});
