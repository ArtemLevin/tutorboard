from pathlib import Path


panel_path = Path("src/app/CoordinatePlotEditorPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
old_label = 'aria-label="Вернуться к базовым настройкам"'
new_label = 'aria-label="Закрыть расширенные настройки"'
if panel.count(old_label) != 1:
    raise RuntimeError("Expected one advanced close label")
panel_path.write_text(panel.replace(old_label, new_label, 1), encoding="utf-8")

for test_path in (
    Path("src/app/CoordinatePlotEditorPanel.test.tsx"),
    Path("src/app/CoordinatePlotEditorPanel.accessibility.test.tsx"),
):
    text = test_path.read_text(encoding="utf-8")
    text = text.replace(
        'name: "Вернуться к базовым настройкам"',
        'name: "Закрыть расширенные настройки"',
    )
    test_path.write_text(text, encoding="utf-8")

production_path = Path("tests/e2e/coordinate-plot-production.spec.ts")
production = production_path.read_text(encoding="utf-8")
production = production.replace(
    '.getByRole("button", { name: "К базовым настройкам" })',
    '.getByRole("button", { name: "К базовым настройкам", exact: true })',
)
production_path.write_text(production, encoding="utf-8")

print("Disambiguated advanced editor close actions")
