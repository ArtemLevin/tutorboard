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
    '  ].filter((element) => !element.hasAttribute("hidden"));',
    '  ].filter((element) => element.closest("[hidden]") === null);',
    "dialog focus visibility filter",
)
panel = replace_once(
    panel,
    '            "[data-plot-basic-initial-focus]",',
    '            "[data-plot-editor-initial-focus]",',
    "basic initial focus selector",
)
panel = replace_once(
    panel,
    '      aria-describedby={`${editorId}-status`}',
    '      aria-describedby={advancedOpen ? undefined : `${editorId}-status`}',
    "basic panel description state",
)
panel = replace_once(
    panel,
    '    >\n      <header className="plot-editor-heading plot-basic-heading">',
    '    >\n      {advancedOpen ? null : (\n        <>\n          <header className="plot-editor-heading plot-basic-heading">',
    "basic surface conditional start",
)
panel = replace_once(
    panel,
    '      </footer>\n\n      {advancedOpen ? (',
    '          </footer>\n        </>\n      )}\n\n      {advancedOpen ? (',
    "basic surface conditional end",
)
panel_path.write_text(panel, encoding="utf-8")

panel_test_path = Path("src/app/CoordinatePlotEditorPanel.test.tsx")
panel_test = panel_test_path.read_text(encoding="utf-8")
panel_test = replace_once(
    panel_test,
    '    expect(\n      screen.getByRole("dialog", { name: "Расширенные настройки графика" }),\n    ).toBeInTheDocument();\n  });',
    '    const advanced = screen.getByRole("dialog", {\n      name: "Расширенные настройки графика",\n    });\n    expect(advanced).toBeInTheDocument();\n    expect(\n      screen.queryByRole("button", { name: /Расширенные настройки/ }),\n    ).not.toBeInTheDocument();\n\n    fireEvent.click(\n      screen.getByRole("button", { name: "К базовым настройкам" }),\n    );\n    expect(advanced).not.toBeInTheDocument();\n    expect(screen.getByLabelText("Формула явной функции")).toHaveValue(\n      "2*x+a",\n    );\n  });',
    "two-level surface test",
)
panel_test_path.write_text(panel_test, encoding="utf-8")

print("Refined coordinate plot basic editor layering")
