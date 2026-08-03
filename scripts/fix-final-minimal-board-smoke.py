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
    '''  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    queueMicrotask(() => shortcutsButtonRef.current?.focus());
  }, []);
''',
    '''  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => shortcutsButtonRef.current?.focus());
    });
  }, []);
''',
    "shortcut focus restoration",
)
replace_once(
    "src/app/App.tsx",
    '''      if (event.key === "Escape" && geometryPromptOpen) {
        event.preventDefault();
        setGeometryPromptOpen(false);
        return;
      }
''',
    '''      if (event.key === "Escape" && geometryPromptOpen) {
        event.preventDefault();
        setGeometryPromptOpen(false);
        return;
      }
      if (event.key === "Escape" && selectionInspectorObjectId !== null) {
        event.preventDefault();
        setSelectionInspectorObjectId(null);
        return;
      }
''',
    "selection inspector Escape",
)
replace_once(
    "src/app/App.tsx",
    '''    readOnly,
    settingsOpen,
    commitSelectionMove,
''',
    '''    readOnly,
    selectionInspectorObjectId,
    settingsOpen,
    commitSelectionMove,
''',
    "selection inspector dependency",
)

styles = Path("src/app/styles.css")
styles_text = styles.read_text()
if "Final dock popover stacking contract" not in styles_text:
    styles_text += '''

/* Final dock popover stacking contract. */
@media (min-width: 721px) {
  .dock-primary-settings {
    overflow: visible;
  }
}
'''
styles.write_text(styles_text)

selection = Path("tests/e2e/selection.spec.ts")
selection_text = selection.read_text()
old_marquee = '''test("selects objects with a marquee and cancels a later preview with Escape", async ({ page }) => {
  const start = await stagePoint(page, 250, 110);
  const finish = await stagePoint(page, 700, 310);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");

  const empty = await stagePoint(page, 780, 100);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});
'''
new_marquee = '''test("selects objects with a marquee and cancels a later preview with Escape", async ({ page }) => {
  const start = await stagePoint(page, 250, 110);
  const finish = await stagePoint(page, 700, 310);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
});
'''
if selection_text.count(old_marquee) != 1:
    raise SystemExit("marquee contract not found")
selection_text = selection_text.replace(old_marquee, new_marquee, 1)
old_direct = '''test("uses the explicit selection tool for an existing figure", async ({ page }) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const contour = await stagePoint(page, 300, 210);
  await page.mouse.click(contour.x, contour.y);
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(contour.x, contour.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, await stagePoint(page, 350, 210));
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();
});
'''
new_direct = '''test("selects a figure contour directly from another tool", async ({ page }) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  const contour = await stagePoint(page, 300, 210);
  await page.mouse.click(contour.x, contour.y);
  await expect(
    page.getByRole("button", { name: "Выделение (V)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await rightDoubleClickAt(page, await stagePoint(page, 350, 210));
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();
});
'''
if selection_text.count(old_direct) != 1:
    raise SystemExit("direct selection contract not found")
selection.write_text(selection_text.replace(old_direct, new_direct, 1))
