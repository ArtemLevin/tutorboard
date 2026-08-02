from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


test_path = Path("src/app/CoordinatePlotEditorPanel.accessibility.test.tsx")
test = test_path.read_text(encoding="utf-8")
test = replace_once(
    test,
    '''    fireEvent.click(screen.getByRole("tab", { name: "Параметры (1)" }));''',
    '''    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Параметры (1)" }));''',
    "parameter diagnostics advanced entry",
)
test = replace_once(
    test,
    '''    expect(
      screen.getByRole("button", { name: "Закрыть редактор графика" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Удалить серию График 1" }),
    ).toBeInTheDocument();''',
    '''    expect(
      screen.getByRole("button", { name: "Закрыть редактор графика" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    expect(
      screen.getByRole("button", { name: "Удалить серию График 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Вернуться к базовым настройкам",
      }),
    ).toBeInTheDocument();''',
    "icon names advanced entry",
)
test_path.write_text(test, encoding="utf-8")

print("Migrated coordinate plot editor accessibility tests")
