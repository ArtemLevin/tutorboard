import { expect, test } from "@playwright/test";

test("opens a semantic catalog solid in the lazy 3D editor", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");

  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.42,
  );

  await page.getByRole("button", { name: "Открыть в 3D" }).click();
  const editor = page.getByRole("region", { name: "Куб" });
  await expect(editor).toBeVisible();
  await page.mouse.click(
    bounds.x + bounds.width * 0.2,
    bounds.y + bounds.height * 0.75,
  );
  await expect(editor).toBeVisible();

  const dock = page.getByTestId("solid-3d-dock");
  const beforeMove = await dock.boundingBox();
  const handle = editor.getByRole("button", { name: "Переместить 3D-окно" });
  const handleBounds = await handle.boundingBox();
  if (beforeMove === null || handleBounds === null)
    throw new Error("3D panel move handle bounds are unavailable");
  const canvas = editor.locator("canvas[data-engine]");
  await expect(canvas).toHaveCount(1);
  await editor.getByRole("button", { name: "Настройки" }).click();
  const showRings = editor.getByRole("button", {
    name: "Показать кольца поворота",
  });
  await expect(showRings).toHaveAttribute("aria-pressed", "false");
  await showRings.click();
  const hideRings = editor.getByRole("button", {
    name: "Скрыть кольца поворота",
  });
  await expect(hideRings).toHaveAttribute("aria-pressed", "true");
  await hideRings.click();
  await expect(showRings).toHaveAttribute("aria-pressed", "false");
  await editor.getByRole("button", { name: "Закрыть настройки" }).click();
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate((node) =>
    node.setAttribute("data-viewport-instance", "same"),
  );
  await page.mouse.move(
    handleBounds.x + 20,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBounds.x - 80,
    handleBounds.y + handleBounds.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  const afterMove = await dock.boundingBox();
  if (afterMove === null) throw new Error("3D panel disappeared while moving");
  expect(afterMove.x).toBeLessThan(beforeMove.x - 70);

  const resize = page.getByRole("button", { name: "Изменить размер 3D-окна" });
  const gripBounds = await resize.boundingBox();
  if (gripBounds === null) throw new Error("3D resize grip is unavailable");
  await page.mouse.move(
    gripBounds.x + gripBounds.width / 2,
    gripBounds.y + gripBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    gripBounds.x + gripBounds.width / 2 + 40,
    gripBounds.y + gripBounds.height / 2 - 60,
    { steps: 5 },
  );
  await page.mouse.up();
  const afterResize = await dock.boundingBox();
  if (afterResize === null)
    throw new Error("3D panel disappeared while resizing");
  expect(afterResize.width).toBeGreaterThan(afterMove.width + 25);
  expect(afterResize.height).toBeLessThan(afterMove.height - 40);
  await expect(canvas).toHaveAttribute("data-viewport-instance", "same");

  await editor.getByRole("button", { name: "Развернуть 3D-окно" }).click();
  await expect(
    editor.getByRole("button", { name: "Свернуть 3D-окно" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Свернуть 3D-окно" }).click();
  await expect(editor.getByText("0 / 3")).toBeVisible();
  await editor.getByRole("button", { name: "Сечение" }).click();
  await expect(
    editor.getByRole("button", {
      name: "Отобразить выбранное сечение на доске",
    }),
  ).toBeDisabled();

  await editor.getByRole("button", { name: "Ортографическая" }).click();
  await expect(
    editor.getByRole("button", { name: "Перспективная" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Учебная задача" }).click();
  await expect(
    editor.getByRole("heading", { name: "Учебные сценарии" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Начать" }).first().click();
  await expect(
    editor.getByText("Прогноз → построение → объяснение → проверка"),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Начать прогноз" }).click();
  await expect(
    editor.getByRole("heading", { name: "Сначала предположите" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Проверить прогноз" }).click();
  await expect(
    editor.getByRole("heading", { name: "Постройте сечение по граням" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 700, height: 640 });
  await expect(dock).toHaveCSS("position", "fixed");
  const mobileBounds = await dock.boundingBox();
  if (mobileBounds === null) throw new Error("Mobile 3D panel is unavailable");
  expect(mobileBounds.x).toBe(0);
  expect(mobileBounds.y).toBe(0);
  expect(mobileBounds.width).toBe(700);
  await expect(resize).toBeHidden();

  await editor.getByRole("button", { name: "Закрыть 3D-окно" }).click();
  await expect(editor).toBeHidden();
});

test("drags a seeded edge point in 3D and persists its new position", async ({
  page,
}) => {
  await page.goto("/");
  const board = page.getByTestId("board-stage");
  const stage = await board.boundingBox();
  if (stage === null) throw new Error("Board stage bounds unavailable");

  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    stage.x + stage.width * 0.58,
    stage.y + stage.height * 0.42,
  );
  await page.getByRole("button", { name: "Открыть в 3D" }).click();

  const editor = page.getByRole("region", { name: "Куб" });
  await editor.getByRole("button", { name: "Учебная задача" }).click();
  await editor
    .getByRole("heading", { name: "Куб: движение точки" })
    .locator("..")
    .getByRole("button", { name: "Начать" })
    .click();
  await editor.getByRole("button", { name: "Сечение" }).click();
  await editor.getByRole("button", { name: "Поставить точку" }).click();

  const description = editor.locator("details", {
    has: page.getByText("Доступное описание"),
  });
  await description.locator("summary").click();
  const pointLabel = description.locator("li").filter({ hasText: "C: x" });
  await expect(pointLabel).toContainText("y -0.40");

  const canvas = editor.locator("canvas[data-engine]");
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  if (rect === null) throw new Error("3D canvas unavailable");

  const eye = [4.8, 3.8, 5.4];
  const magnitude = Math.hypot(...eye);
  const forward = eye.map((value) => value / magnitude);
  const rightMagnitude = Math.hypot(forward[2]!, forward[0]!);
  const right = [
    forward[2]! / rightMagnitude,
    0,
    -forward[0]! / rightMagnitude,
  ];
  const up = [
    -forward[1]! * right[2]!,
    forward[2]! * right[0]! - forward[0]! * right[2]!,
    forward[1]! * right[0]!,
  ];
  const screen = (y: number) => {
    const p = [-1, y, 1];
    const x = p.reduce((sum, value, i) => sum + value * right[i]!, 0);
    const z = p.reduce((sum, value, i) => sum + value * up[i]!, 0);
    return {
      x: rect.x + rect.width / 2 + (x * rect.height) / 5.6,
      y: rect.y + rect.height / 2 - (z * rect.height) / 5.6,
    };
  };

  const start = screen(-0.4);
  const end = screen(0.4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();

  await expect(pointLabel).not.toContainText("y -0.40");
  await expect(pointLabel).toContainText("x -1.00");
  await expect(pointLabel).toContainText("z 1.00");
  await expect
    .poll(async () => {
      const label = await pointLabel.textContent();
      const coordinate = /y (-?\d+\.\d+)/.exec(label ?? "");
      return coordinate === null ? null : Number(coordinate[1]);
    })
    .toBeGreaterThan(0.2);

  await editor.getByRole("button", { name: "Сечение" }).click();
  // The same seeded three points define a plane sweep. Its initial
  // position is read-only preview; a completed save must add a section.
  const sweepToggle = editor.getByLabel("Параллельное перемещение плоскости");
  await sweepToggle.check();
  const slider = editor.getByRole("slider", {
    name: "Смещение секущей плоскости",
  });
  await slider.focus();
  for (let step = 0; step < 12; step += 1) {
    await slider.press("ArrowRight");
  }
  const savedSections = editor.locator(".solid-3d-sections > li");
  const previousCount = await savedSections.count();
  const saveSweep = editor.getByRole("button", {
    name: "Сохранить положение плоскости",
  });
  await expect(saveSweep).toBeEnabled();
  await saveSweep.click();
  await expect(savedSections).toHaveCount(previousCount + 1);
});

test("rotates a cutting plane around a cube edge and saves it as one undoable section", async ({
  page,
}) => {
  await page.goto("/");
  const stage = await page.getByTestId("board-stage").boundingBox();
  if (stage === null) throw new Error("Board stage is unavailable");
  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    stage.x + stage.width * 0.58,
    stage.y + stage.height * 0.42,
  );
  await page.getByRole("button", { name: "Открыть в 3D" }).click();
  const editor = page.getByRole("region", { name: "Куб" });
  await editor.getByRole("button", { name: "Учебная задача" }).click();
  await editor
    .getByRole("heading", { name: "Куб: движение точки" })
    .locator("..")
    .getByRole("button", { name: "Начать" })
    .click();
  await editor.getByRole("button", { name: "Сечение" }).click();
  await editor.getByLabel("Вращать плоскость вокруг ребра").check();
  await editor.getByLabel("Ось вращения").selectOption({ label: "D—C" });
  await editor.getByRole("button", { name: "Изменить угол на +15°" }).click();
  await expect(
    editor.getByRole("slider", { name: "Угол поворота секущей плоскости" }),
  ).toHaveValue("15");
  await expect(editor.getByText(/Вершин \d+ · площадь \d/)).toBeVisible();
  const savedSections = editor.locator(".solid-3d-sections > li");
  const before = await savedSections.count();
  const save = editor.getByRole("button", {
    name: "Сохранить повёрнутое сечение",
  });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(savedSections).toHaveCount(before + 1);

  // A captured rotation is exactly one document command, reversible by Undo.
  await editor.getByRole("button", { name: "Отменить" }).click();
  await expect(savedSections).toHaveCount(before);
});

test("rotates a plane about two selected 3D points with one undoable save", async ({
  page,
}) => {
  await page.goto("/");
  const stage = await page.getByTestId("board-stage").boundingBox();
  if (stage === null) throw new Error("Board stage is unavailable");
  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page
    .getByRole("menuitemradio", { name: "Построение по тексту" })
    .click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(
    stage.x + stage.width * 0.58,
    stage.y + stage.height * 0.42,
  );
  await page.getByRole("button", { name: "Открыть в 3D" }).click();
  const editor = page.getByRole("region", { name: "Куб" });
  await editor.getByRole("button", { name: "Учебная задача" }).click();
  await editor
    .getByRole("heading", { name: "Куб: движение точки" })
    .locator("..")
    .getByRole("button", { name: "Начать" })
    .click();
  await editor.getByRole("button", { name: "Сечение" }).click();

  await editor.getByLabel("Вращать плоскость вокруг ребра").check();
  await editor.getByLabel("Тип оси вращения").selectOption("points");
  await editor.getByLabel("Первая точка оси").selectOption({ index: 1 });
  await editor.getByLabel("Вторая точка оси").selectOption({ index: 2 });
  await editor.getByRole("button", { name: "Изменить угол на +15°" }).click();
  await expect(
    editor.getByRole("slider", { name: "Угол поворота секущей плоскости" }),
  ).toHaveValue("15");
  await expect(editor.getByText(/Вершин \d+ · площадь \d/)).toBeVisible();
  const savedSections = editor.locator(".solid-3d-sections > li");
  const previousCount = await savedSections.count();
  const save = editor.getByRole("button", {
    name: "Сохранить повёрнутое сечение",
  });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(savedSections).toHaveCount(previousCount + 1);
  await editor.getByRole("button", { name: "Отменить" }).click();
  await expect(savedSections).toHaveCount(previousCount);
});
