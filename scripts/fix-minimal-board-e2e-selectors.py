from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1))


coordinate_path = "tests/e2e/coordinate-plot-production.spec.ts"
replace_once(
    coordinate_path,
    '  await page.getByRole("button", { name: "math.coordinate-plot" }).click();\n',
    '  await page.getByRole("button", { name: "Настройки доски" }).click();\n'
    '  const boardSettings = page.getByRole("dialog", { name: "Настройки доски" });\n'
    '  await expect(boardSettings).toBeVisible();\n'
    '  await boardSettings\n'
    '    .getByRole("button", { name: "math.coordinate-plot", exact: true })\n'
    '    .click();\n'
    '  await boardSettings\n'
    '    .getByRole("button", { name: "Закрыть настройки доски" })\n'
    '    .click();\n',
    "coordinate layer selection",
)
replace_once(
    coordinate_path,
    '  const downloadPromise = page.waitForEvent("download");\n'
    '  await page.getByRole("button", { name: "Экспорт JSON" }).click();\n',
    '  await page.getByRole("button", { name: "Настройки доски" }).click();\n'
    '  await expect(boardSettings).toBeVisible();\n'
    '  const downloadPromise = page.waitForEvent("download");\n'
    '  await boardSettings.getByRole("button", { name: "Экспорт JSON" }).click();\n',
    "coordinate export",
)
