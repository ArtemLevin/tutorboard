from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "src/app/App.test.tsx",
    'screen.queryByRole("complementary", { name: "Выделенные объекты" })',
    'screen.queryByRole("region", { name: "Первичные настройки выделения" })',
    "closed selection settings assertion",
)
replace_once(
    "src/app/App.test.tsx",
    'screen.getByRole("complementary", { name: "Выделенные объекты" })',
    'screen.getByRole("region", { name: "Первичные настройки выделения" })',
    "open selection settings assertion",
)

app_path = Path("src/app/App.tsx")
app = app_path.read_text()
old = '''      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
'''
new = '''      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        closeShortcuts();
        return;
      }
      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
'''
if app.count(old) != 1:
    raise SystemExit(f"Escape priority insertion: expected one match, found {app.count(old)}")
app = app.replace(old, new, 1)
late = '''
      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        closeShortcuts();
        return;
      }
'''
first = app.find(late)
second = app.find(late, first + len(late))
if first < 0 or second < 0:
    raise SystemExit("Escape priority cleanup: duplicate branches not found")
app = app[:second] + app[second + len(late) :]
old_dialog = '''        <BoardSettingsDialog
          onClose={() => setSettingsOpen(false)}
'''
new_dialog = '''        <BoardSettingsDialog
          onClose={() => {
            if (!shortcutsOpen) setSettingsOpen(false);
          }}
'''
if app.count(old_dialog) != 1:
    raise SystemExit(f"Nested dialog guard: expected one match, found {app.count(old_dialog)}")
app = app.replace(old_dialog, new_dialog, 1)
app_path.write_text(app)
