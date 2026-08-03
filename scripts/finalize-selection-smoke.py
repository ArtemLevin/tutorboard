from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "src/app/App.tsx",
    '''        selectionStateRef.current = result.state;
        setSelectionState(result.state);
        return;
''',
    '''        selectionStateRef.current = result.state;
        setSelectionState(result.state);
        activateTool(navigationToolId);
        return;
''',
    "selection Escape mode reset",
)

selection = Path("tests/e2e/selection.spec.ts")
text = selection.read_text()
replace_once(
    "tests/e2e/selection.spec.ts",
    '''  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.mouse.move(start.x, start.y);
''',
    '''  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Выделение (V)" }).click();

  await page.mouse.move(start.x, start.y);
''',
    "marquee restart",
)
replace_once(
    "tests/e2e/selection.spec.ts",
    '''test("selects a figure contour directly from another tool", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  const contour = await stagePoint(page, 350, 160);
  await page.mouse.click(contour.x, contour.y);
  await expect(
    page.getByRole("button", { name: "Выделение (V)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, await stagePoint(page, 350, 210));
''',
    '''test("uses the explicit selection tool for an existing figure", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, rectangle);
''',
    "explicit selection contract",
)
