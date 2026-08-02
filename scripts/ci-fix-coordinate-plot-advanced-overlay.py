from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


panel_path = Path("src/app/CoordinatePlotEditorPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
panel = replace_once(
    panel,
    '''    <aside
      aria-describedby={advancedOpen ? undefined : `${editorId}-status`}
      aria-label="Редактор координатной плоскости"
      className="coordinate-plot-editor-panel coordinate-plot-basic-editor-panel"
      data-testid="coordinate-plot-editor"''',
    '''    <aside
      aria-describedby={advancedOpen ? undefined : `${editorId}-status`}
      aria-hidden={advancedOpen || undefined}
      aria-label="Редактор координатной плоскости"
      className="coordinate-plot-editor-panel coordinate-plot-basic-editor-panel"
      data-advanced-open={advancedOpen ? "true" : "false"}
      data-testid="coordinate-plot-editor"''',
    "basic editor advanced state",
)
panel_path.write_text(panel, encoding="utf-8")

css_path = Path("src/app/CoordinatePlotEditorPanel.css")
css = css_path.read_text(encoding="utf-8")
css = replace_once(
    css,
    '''.coordinate-plot-basic-editor-panel {
  width: min(390px, calc(100% - 32px));
}
''',
    '''.coordinate-plot-basic-editor-panel {
  width: min(390px, calc(100% - 32px));
}

.coordinate-plot-basic-editor-panel[data-advanced-open="true"] {
  visibility: hidden;
  pointer-events: none;
}
''',
    "basic editor advanced overlay style",
)
css_path.write_text(css, encoding="utf-8")

print("Fixed mobile advanced editor overlay ownership")
