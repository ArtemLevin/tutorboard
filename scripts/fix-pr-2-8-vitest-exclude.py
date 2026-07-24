from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "vite.config.ts"
text = path.read_text(encoding="utf-8")
old = '    exclude: ["node_modules/**", "tests/e2e/**"],'
new = '    exclude: ["**/node_modules/**", "tests/e2e/**"],'
if old not in text:
    raise RuntimeError("Vitest exclusion list was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Excluded nested tool dependencies from Vitest discovery.")
