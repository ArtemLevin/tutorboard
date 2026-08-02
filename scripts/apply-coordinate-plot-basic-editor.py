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
    '''  await editor
    .getByRole("button", { name: "+ Параметрическая кривая" })
    .click();''',
    '''  await advancedEditor
    .getByRole("button", { name: "+ Параметрическая кривая" })
    .click();''',
    "parametric curve advanced scope",
)
path.write_text(text, encoding="utf-8")
print("Finished production editor scoping")
