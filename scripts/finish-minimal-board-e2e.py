from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1))


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


replace_once(
    "src/app/App.tsx",
    '''          <span data-testid="selection-count">
            {selectionState.selectedObjectIds.length} выбрано
          </span>
''',
    '''          <span data-testid="selection-count">
            {selectionState.selectedObjectIds.length} выбрано
          </span>
          <span data-testid="viewport-zoom">
            {Math.round(document.viewport.zoom * 100)}%
          </span>
          <span data-testid="viewport-offset">
            x {Math.round(document.viewport.offset.x)} · y {Math.round(document.viewport.offset.y)}
          </span>
''',
    "viewport diagnostics",
)

stroke_css = Path("src/app/stroke-style-palette.css")
stroke_text = stroke_css.read_text()
if "Minimal board dock stacking contract" not in stroke_text:
    stroke_text += '''

/* Minimal board dock stacking contract. */
.dock-primary-settings {
  overflow: visible;
}

@media (max-width: 720px) {
  .dock-primary-settings {
    overflow: auto;
  }
}
'''
stroke_css.write_text(stroke_text)

write(
    "tests/e2e/accessibility.spec.ts",
    '''import { expect, test } from "@playwright/test";

test("supports keyboard movement, shortcut help and focus restoration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("toolbar", { name: "Инструменты доски" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.move(bounds.x + 300, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 400, bounds.y + 300);
  await page.mouse.up();
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 350, bounds.y + 250);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByTestId("first-object-position")).toHaveText(
    "Объект: 301, 210",
  );

  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  const shortcuts = settings.getByRole("button", { name: "Горячие клавиши" });
  await shortcuts.click();
  await expect(
    page.getByRole("dialog", { name: "Горячие клавиши" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Горячие клавиши" }),
  ).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(shortcuts).toBeFocused();
});
''',
)

write(
    "tests/e2e/document-transfer.spec.ts",
    '''import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("exports deterministic document and diagnostic snapshots", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  await expect(settings).toBeVisible();

  const jsonDownloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Экспорт JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toMatch(/\\.tutorboard\\.json$/u);
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const exported = JSON.parse(await readFile(jsonPath, "utf8")) as {
    schemaVersion?: unknown;
  };
  expect(exported.schemaVersion).toBe("1.1");

  const svgDownloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Снимок SVG" }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe("tutorboard-snapshot.svg");
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  expect(await readFile(svgPath, "utf8")).toContain(
    '<svg xmlns="http://www.w3.org/2000/svg"',
  );

  const pngDownloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Снимок PNG" }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe("tutorboard-snapshot.png");
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  const png = await readFile(pngPath);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});
''',
)

replace_once(
    "tests/e2e/coordinate-plot-editor.spec.ts",
    '''  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
''',
    '''  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
''',
    "coordinate editor export",
)

replace_once(
    "tests/e2e/coordinate-plot-right-pan.spec.ts",
    '''async function exportDocument(page: Page): Promise<ExportedPlotDocument> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("Expected exported board document");
  return JSON.parse(await readFile(path, "utf8")) as ExportedPlotDocument;
}
''',
    '''async function exportDocument(page: Page): Promise<ExportedPlotDocument> {
  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await settings
    .getByRole("button", { name: "Закрыть настройки доски" })
    .click();
  if (path === null) throw new Error("Expected exported board document");
  return JSON.parse(await readFile(path, "utf8")) as ExportedPlotDocument;
}
''',
    "coordinate pan export",
)

replace_once(
    "tests/e2e/drawing-tools.spec.ts",
    '''  const start = await canvasPoint(page, 0.72, 0.72);
  const end = await canvasPoint(page, 0.55, 0.55);
''',
    '''  const start = await canvasPoint(page, 0.72, 0.42);
  const end = await canvasPoint(page, 0.55, 0.25);
''',
    "primitive safe area",
)
replace_once(
    "tests/e2e/drawing-tools.spec.ts",
    '''  const start = await canvasPoint(page, 0.55, 0.6);
  const end = await canvasPoint(page, 0.7, 0.72);
''',
    '''  const start = await canvasPoint(page, 0.55, 0.3);
  const end = await canvasPoint(page, 0.7, 0.42);
''',
    "preview safe area",
)
replace_once(
    "tests/e2e/drawing-tools.spec.ts",
    '''  const start = await canvasPoint(page, 0.5, 0.62);
  const end = await canvasPoint(page, 0.68, 0.5);
''',
    '''  const start = await canvasPoint(page, 0.5, 0.32);
  const end = await canvasPoint(page, 0.68, 0.2);
''',
    "pen safe area",
)
replace_once(
    "tests/e2e/drawing-tools.spec.ts",
    '''  const textPoint = await canvasPoint(page, 0.62, 0.75);
''',
    '''  const textPoint = await canvasPoint(page, 0.62, 0.4);
''',
    "text safe area",
)

replace_once(
    "tests/e2e/geometry-vertical-slice.spec.ts",
    '''  await page.getByRole("button", { name: "Построить" }).click();
''',
    '''  await page.getByRole("button", { name: "Построение GeometryOS" }).click();
  await page.getByRole("button", { name: "Построить" }).click();
''',
    "geometry prompt toggle",
)

write(
    "tests/e2e/layers.spec.ts",
    '''import { expect, test } from "@playwright/test";

test("manages visibility, z-order and user groups from the settings sheet", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");

  const draw = async (tool: "Прямоугольник (R)" | "Эллипс (E)", x: number) => {
    await page.getByRole("button", { name: tool }).click();
    await page.mouse.move(bounds.x + x, bounds.y + 160);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 100, bounds.y + 260, { steps: 4 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", 220);
  await draw("Эллипс (E)", 440);

  await page.getByRole("button", { name: "Настройки доски" }).click();
  let settings = page.getByRole("dialog", { name: "Настройки доски" });
  const layerList = settings.locator(".board-settings-layers");
  await expect(layerList.getByRole("listitem")).toHaveCount(2);
  await layerList.getByRole("button", { name: /Скрыть object:/ }).first().click();
  await expect(layerList.getByRole("button", { name: /Показать object:/ })).toHaveCount(1);
  await layerList.getByRole("button", { name: /Показать object:/ }).click();
  await layerList
    .getByRole("button", { name: /На задний план object:/ })
    .first()
    .click();
  await settings
    .getByRole("button", { name: "Закрыть настройки доски" })
    .click();

  await page.getByRole("button", { name: "Выделение (V)" }).click();
  await page.mouse.click(bounds.x + 270, bounds.y + 210);
  await page.keyboard.down("Shift");
  await page.mouse.click(bounds.x + 490, bounds.y + 210);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");

  await page.getByRole("button", { name: "Настройки доски" }).click();
  settings = page.getByRole("dialog", { name: "Настройки доски" });
  await settings.getByRole("button", { name: "Сгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("1 групп");
  await settings.getByRole("button", { name: "Разгруппировать" }).click();
  await expect(page.getByTestId("group-count")).toHaveText("0 групп");
});
''',
)

write(
    "tests/e2e/object-settings-right-double-click.spec.ts",
    '''import { expect, test } from "@playwright/test";

import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

test("opens figure and graph settings only after a right-button double-click", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height * 0.35,
  };
  const selectionSettings = page.getByRole("region", {
    name: "Первичные настройки выделения",
  });

  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await page.mouse.move(center.x - 70, center.y - 50);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(selectionSettings).toBeHidden();

  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(selectionSettings).toBeHidden();
  await page.waitForTimeout(60);
  await page.mouse.click(center.x, center.y, { button: "right" });
  await expect(selectionSettings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selectionSettings).toBeHidden();

  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();

  await openCoordinatePlotEditorByRightDoubleClick(page);
});

test("a right drag remains board panning", async ({ page }) => {
  await page.goto("/");
  const before = await page.getByTestId("viewport-offset").textContent();
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");
  const start = {
    x: bounds.x + bounds.width * 0.45,
    y: bounds.y + bounds.height * 0.4,
  };
  const finish = { x: start.x + 100, y: start.y + 60 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await expect(stage).toHaveAttribute("data-panning", "true");
  await page.mouse.up({ button: "right" });
  await expect(page.getByTestId("viewport-offset")).not.toHaveText(before ?? "");
  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
});
''',
)

replace_once(
    "tests/e2e/persistence.spec.ts",
    '''  await page.getByRole("button", { name: "Центрировать" }).click();
''',
    '''  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  await settings.getByRole("button", { name: "Центрировать доску" }).click();
  await settings
    .getByRole("button", { name: "Закрыть настройки доски" })
    .click();
''',
    "persistence center",
)

write(
    "tests/e2e/selection.spec.ts",
    '''import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", { name: "Бесконечное полотно TutorBoard" }),
  ).toBeVisible();

  const draw = async (
    tool: "Прямоугольник (R)" | "Эллипс (E)" | "Текст (T)",
    start: { x: number; y: number },
    finish = start,
  ) => {
    await page.getByRole("button", { name: tool }).click();
    const from = await stagePoint(page, start.x, start.y);
    const to = await stagePoint(page, finish.x, finish.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
  };
  await draw("Прямоугольник (R)", { x: 300, y: 160 }, { x: 400, y: 260 });
  await draw("Эллипс (E)", { x: 500, y: 160 }, { x: 560, y: 220 });
  await draw("Текст (T)", { x: 650, y: 210 });
  await page.getByRole("button", { name: "Выделение (V)" }).click();
});

async function stagePoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  return { x: bounds.x + x, y: bounds.y + y };
}

test("selects and moves an object with a zoom-independent world delta", async ({ page }) => {
  const start = await stagePoint(page, 350, 210);
  await page.mouse.click(start.x, start.y);
  const finish = await stagePoint(page, 420, 250);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("first-object-position")).toHaveText("Объект: 370, 200");
});

test("supports additive selection, lock and delete", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  const ellipse = await stagePoint(page, 530, 190);
  await page.keyboard.down("Shift");
  await page.mouse.click(ellipse.x, ellipse.y);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await rightDoubleClickAt(page, ellipse);

  await page.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Разблокировать", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Разблокировать", exact: true }).click();
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("0 выбрано");
});

test("selects objects with a marquee and cancels a later preview with Escape", async ({ page }) => {
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

test("scales and rotates a selected figure with undo support", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await rightDoubleClickAt(page, rectangle);
  await page.getByRole("button", { name: "Увеличить выделение на 10%" }).click();
  await page.getByRole("button", { name: "Повернуть выделение на 15 градусов" }).click();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 15°",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 0°",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1, 1 · Поворот: 0°",
  );
});

test("uses the explicit selection tool for an existing figure", async ({ page }) => {
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

test("right drag switches to canvas movement and pans the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const start = await stagePoint(page, 650, 350);
  const finish = await stagePoint(page, 720, 400);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await expect(page.getByTestId("board-stage")).toHaveAttribute("data-panning", "true");
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("viewport-offset")).toHaveText("x 70 · y 50");
});

test("chooses all eight line styles from a popover", async ({ page }) => {
  const rectangle = await stagePoint(page, 350, 210);
  await page.mouse.click(rectangle.x, rectangle.y);
  await rightDoubleClickAt(page, rectangle);
  const menu = page.getByRole("menu", { name: "Стиль линии" });
  for (const label of [
    "Тонкая",
    "Толстая",
    "Пунктирная",
    "Точка-пунктир",
    "Волнистая",
    "Карандаш — скетчбук",
    "Ручка — скетчбук",
    "Маркер",
  ]) {
    await page.getByRole("button", { name: /^Стиль линии:/ }).click();
    await expect(menu).toBeVisible();
    await page.getByRole("menuitemradio", { name: label }).click();
    await expect(menu).toHaveCount(0);
  }
});

test("selects selectively with a freeform lasso", async ({ page }) => {
  await page.getByRole("button", { name: "Лассо (A)" }).click();
  const traceLasso = async (
    points: readonly (readonly [number, number])[],
    modifier?: "Alt" | "Shift",
  ) => {
    if (modifier !== undefined) await page.keyboard.down(modifier);
    const first = await stagePoint(page, points[0]![0], points[0]![1]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      const point = await stagePoint(page, x, y);
      await page.mouse.move(point.x, point.y, { steps: 3 });
    }
    await page.mouse.up();
    if (modifier !== undefined) await page.keyboard.up(modifier);
  };
  await traceLasso([
    [250, 110],
    [610, 110],
    [610, 300],
    [250, 300],
    [250, 110],
  ]);
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await traceLasso(
    [
      [600, 400],
      [760, 400],
      [760, 100],
      [600, 100],
      [600, 400],
    ],
    "Shift",
  );
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");
});
''',
)

replace_once(
    "tests/e2e/stroke-smoothing.spec.ts",
    '''  await page.getByRole("button", { name: "drawing.pen-stroke" }).click();
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  const settingsPoint = await stagePoint(page, 350, 310);
''',
    '''  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const settingsPoint = await stagePoint(page, 350, 310);
  await page.mouse.click(settingsPoint.x, settingsPoint.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
''',
    "stroke selection",
)

replace_once(
    "tests/e2e/styling.spec.ts",
    '''      name: /Обводка: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
''',
    '''      name: /Цвет: (Чёрный|Красный|Синий|Зелёный|Жёлтый)/,
''',
    "stroke palette label",
)
replace_once(
    "tests/e2e/styling.spec.ts",
    '''  const greenStroke = page.getByRole("button", { name: "Обводка: Зелёный" });
''',
    '''  const greenStroke = page.getByRole("button", { name: "Цвет: Зелёный" });
''',
    "stroke color button",
)
replace_once(
    "tests/e2e/styling.spec.ts",
    '''  await page.getByRole("spinbutton", { name: "Толщина обводки" }).fill("6");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина обводки" }),
  ).toHaveValue("6");
''',
    '''  await page.getByRole("spinbutton", { name: "Толщина инструмента" }).fill("6");
  await expect(
    page.getByRole("spinbutton", { name: "Толщина инструмента" }),
  ).toHaveValue("6");
''',
    "stroke width label",
)
replace_once(
    "tests/e2e/styling.spec.ts",
    '''    page.getByRole("spinbutton", { name: "Толщина обводки" }),
''',
    '''    page.getByRole("spinbutton", { name: "Толщина инструмента" }),
''',
    "undo stroke width label",
)

replace_once(
    "tests/e2e/svg-import.spec.ts",
    '''    "Изображение не вставлено",
''',
    '''    "Изображения отклонены",
''',
    "unsafe SVG message",
)

write(
    "tests/e2e/text-editing.spec.ts",
    '''import { expect, test } from "@playwright/test";
import { rightDoubleClickAt } from "./coordinate-plot-interaction.js";

test("edits text as one committed history item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Текст (T)" }).click();
  await page.getByRole("textbox", { name: "Содержимое текста" }).fill("Before");
  const bounds = await page.getByTestId("board-stage").boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  await page.mouse.click(bounds.x + 320, bounds.y + 240);
  await page.getByRole("button", { name: "Выделение (V)" }).click();
  const textPoint = { x: bounds.x + 330, y: bounds.y + 250 };
  await page.mouse.click(textPoint.x, textPoint.y);
  await rightDoubleClickAt(page, textPoint);

  const editor = page.getByRole("textbox", { name: "Редактор выбранного текста" });
  await expect(editor).toHaveValue("Before");
  await editor.fill("$x^2 + \\alpha_1$");
  await editor.blur();
  await expect(editor).toHaveValue("$x^2 + \\alpha_1$");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("textbox", { name: "Редактор выбранного текста" }),
  ).toHaveValue("Before");
});
''',
)
