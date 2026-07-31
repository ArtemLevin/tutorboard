from __future__ import annotations

import re
from pathlib import Path

WORKFLOW = Path(".github/workflows/apply-image-import.yml")
source = WORKFLOW.read_text(encoding="utf-8")
body = source.split("          python <<'PY'\n", 1)[1].split("\n          PY", 1)[0]
script = "\n".join(
    line[10:] if line.startswith("          ") else line
    for line in body.splitlines()
)

strict_helper = '''from pathlib import Path

def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")
'''

flexible_helper = '''from pathlib import Path
import re

def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old in text:
        target.write_text(text.replace(old, new), encoding="utf-8")
        return
    pattern = "".join(
        r"\\s+" if token.isspace() else re.escape(token)
        for token in re.split(r"(\\s+)", old)
    )
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise SystemExit(
            f"missing or ambiguous patch anchor in {path}: {old[:100]!r}; matches={len(matches)}"
        )
    match = matches[0]
    target.write_text(
        text[:match.start()] + new + text[match.end():],
        encoding="utf-8",
    )
'''

if strict_helper not in script:
    raise SystemExit("patch helper definition was not found")

script = script.replace(strict_helper, flexible_helper)
exec(compile(script, "embedded-image-patch.py", "exec"))
Path(".github/workflows/trigger-image-import-patch.yml").unlink(missing_ok=True)
Path(".github/image-patch-runner.py").unlink(missing_ok=True)
