from pathlib import Path

path = Path("tests/e2e/persistence.spec.ts")
text = path.read_text(encoding="utf-8")
marker = "/* eslint-disable @typescript-eslint/no-unsafe-assignment"
if not text.startswith(marker):
    raise SystemExit("unexpected Playwright persistence test preamble")
path.write_text('/// <reference lib="dom" />\n\n' + text, encoding="utf-8")
