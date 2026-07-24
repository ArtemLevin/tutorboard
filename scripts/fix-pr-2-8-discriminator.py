from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "scripts/geometryos-contract-lib.mjs"
text = path.read_text(encoding="utf-8")
old = '    if (key === "$id") {'
new = '    if (key === "$id" || key === "discriminator") {'
if old not in text:
    raise RuntimeError("OpenAPI schema rewrite hook was not found")
text = text.replace(old, new, 1)
text = text.replace('    discriminator: true,\n', '', 1)
path.write_text(text, encoding="utf-8")
print("Removed OpenAPI discriminator annotations from runtime JSON Schema generation.")
