from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


path = Path("tests/e2e/coordinate-plot-production.spec.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  await expect(editor).toBeVisible();
  const persistenceStatus = page.getByTestId("persistence-status");''',
    '''  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue(
    "2*x+a",
  );
  await expect(editor.getByLabel("Ползунок параметра a")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Расширенные настройки графика" }),
  ).toBeHidden();
  await editor
    .getByRole("button", { name: /Расширенные настройки/ })
    .click();
  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  await expect(advancedEditor).toBeVisible();
  const persistenceStatus = page.getByTestId("persistence-status");''',
    "initial advanced editor entry",
)
text = text.replace('editor.getByRole("tab",', 'advancedEditor.getByRole("tab",')
text = text.replace('editor.getByLabel("Минимальная граница X")', 'advancedEditor.getByLabel("Минимальная граница X")')
text = text.replace('editor.getByLabel("Максимальная граница X")', 'advancedEditor.getByLabel("Максимальная граница X")')
text = text.replace('editor.getByLabel("Минимальная граница Y")', 'advancedEditor.getByLabel("Минимальная граница Y")')
text = text.replace('editor.getByLabel("Максимальная граница Y")', 'advancedEditor.getByLabel("Максимальная граница Y")')
text = text.replace('editor.getByTestId("renderer-status-help")', 'advancedEditor.getByTestId("renderer-status-help")')
text = text.replace('editor.getByText("Краткая справка по формулам")', 'advancedEditor.getByText("Краткая справка по формулам")')
text = text.replace('editor.getByText(/Тригонометрические функции используют радианы/)', 'advancedEditor.getByText(/Тригонометрические функции используют радианы/)')
text = text.replace('editor.getByLabel("Формула явной функции")', 'advancedEditor.getByLabel("Формула явной функции")')
text = text.replace('editor.getByRole("button", { name: "Вставить sin" })', 'advancedEditor.getByRole("button", { name: "Вставить sin" })')
text = replace_once(
    text,
    '''  await firstFormula.fill("a*x^2");
  await editor.getByRole("button", { name: "Создать параметр «a»" }).click();
  const parametersTab = advancedEditor.getByRole("tab", { name: "Параметры (1)" });
  await expect(parametersTab).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByLabel(/Имя параметра/)).toHaveValue("a");
  await expect(editor.getByLabel(/Имя параметра/)).toBeFocused();''',
    '''  await firstFormula.fill("b*x^2");
  await advancedEditor
    .getByRole("button", { name: "Создать параметр «b»" })
    .click();
  const parametersTab = advancedEditor.getByRole("tab", {
    name: "Параметры (2)",
  });
  await expect(parametersTab).toHaveAttribute("aria-selected", "true");
  const addedParameterName = advancedEditor
    .locator("[data-parameter-name]")
    .last();
  await expect(addedParameterName).toHaveValue("b");
  await expect(addedParameterName).toBeFocused();''',
    "second parameter flow",
)
text = text.replace('editor.getByLabel("Стиль линии")', 'advancedEditor.getByLabel("Стиль линии")')
text = text.replace('editor.getByRole("button", { name: "+ Явная функция" })', 'advancedEditor.getByRole("button", { name: "+ Явная функция" })')
text = text.replace('editor.getByRole("button", { name: "+ Параметрическая кривая" })', 'advancedEditor.getByRole("button", { name: "+ Параметрическая кривая" })')
text = text.replace('editor.getByLabel("Параметрическая формула x")', 'advancedEditor.getByLabel("Параметрическая формула x")')
text = text.replace('editor.getByLabel("Параметрическая формула y")', 'advancedEditor.getByLabel("Параметрическая формула y")')
text = text.replace('editor.getByLabel("Показывать График 2")', 'advancedEditor.getByLabel("Показывать График 2")')
text = text.replace('editor.getByText("X: от")', 'advancedEditor.getByText("X: от")')
text = text.replace('editor.getByText("Y: до")', 'advancedEditor.getByText("Y: до")')
text = text.replace('editor.getByLabel("Положение легенды")', 'advancedEditor.getByLabel("Положение легенды")')
text = replace_once(
    text,
    '''  await editor.getByRole("button", { name: "Сохранить" }).click();''',
    '''  await advancedEditor.getByRole("button", { name: "Сохранить" }).click();''',
    "advanced save",
)
text = replace_once(
    text,
    '''  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();

  await page.reload();''',
    '''  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам" })
    .click();
  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();

  await page.reload();''',
    "close after advanced save",
)
text = replace_once(
    text,
    '''  await expect(editor).toBeVisible();
  await expect(advancedEditor.getByLabel("Формула явной функции")).toHaveValue("a*x^2");
  await expect(advancedEditor.getByLabel("Показывать График 2")).not.toBeChecked();

  await advancedEditor.getByRole("tab", { name: "Вид" }).click();''',
    '''  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Формула явной функции")).toHaveValue("b*x^2");
  await editor
    .getByRole("button", { name: /Расширенные настройки/ })
    .click();
  await expect(advancedEditor).toBeVisible();
  await expect(
    advancedEditor.getByLabel("Показывать График 2"),
  ).not.toBeChecked();

  await advancedEditor.getByRole("tab", { name: "Вид" }).click();''',
    "restored advanced editor entry",
)
text = replace_once(
    text,
    '''  await advancedEditor.getByRole("tab", { name: "Параметры (1)" }).click();
  await expect(editor.getByLabel(/Имя параметра/)).toHaveValue("a");

  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();''',
    '''  await advancedEditor.getByRole("tab", { name: "Параметры (2)" }).click();
  await expect(advancedEditor.locator("[data-parameter-name]")).toHaveValues([
    "a",
    "b",
  ]);

  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам" })
    .click();
  await editor
    .getByRole("button", { name: "Закрыть редактор графика" })
    .click();''',
    "restored parameters and close",
)
text = text.replace('expression: "a*x^2"', 'expression: "b*x^2"')
text = replace_once(
    text,
    '''    expect(plot.definition?.parameters).toEqual([
      expect.objectContaining({ name: "a" }),
    ]);''',
    '''    expect(plot.definition?.parameters).toEqual([
      expect.objectContaining({ name: "a" }),
      expect.objectContaining({ name: "b" }),
    ]);''',
    "exported parameter assertions",
)
path.write_text(text, encoding="utf-8")

print("Migrated coordinate plot production E2E to the two-level editor")
