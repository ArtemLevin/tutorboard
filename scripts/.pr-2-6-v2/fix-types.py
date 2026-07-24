from pathlib import Path

path = Path("tests/e2e/persistence.spec.ts")
text = path.read_text(encoding="utf-8")
old = "/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-promise-reject-errors -- IndexedDB code executes inside Playwright's browser context. */"
if not text.startswith(old):
    raise SystemExit("unexpected Playwright persistence test preamble")
new = "/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- IndexedDB failures originate as DOMException values in Playwright's browser context. */"
path.write_text('/// <reference lib="dom" />\n\n' + text.replace(old, new, 1), encoding="utf-8")
