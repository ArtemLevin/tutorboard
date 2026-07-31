#!/usr/bin/env bash
set -euo pipefail

base64 --decode scripts/apply-coordinate-plot-pr1.py.gz.b64 | gzip --decompress > scripts/apply-coordinate-plot-pr1.py
python3 scripts/apply-coordinate-plot-pr1.py apply
python3 - <<'PY'
from pathlib import Path

renderer = Path("src/adapters/canvas-konva/coordinate-plot-placeholder-renderer.tsx")
content = renderer.read_text(encoding="utf-8")
content = content.replace('join("\n")', 'join("\\n")')
renderer.write_text(content, encoding="utf-8")

snapshot = Path("src/modules/document-transfer/snapshot.ts")
content = snapshot.read_text(encoding="utf-8")
marker = '''    case "drawing.ellipse":
      return `<ellipse ${common} cx="0" cy="0" rx="${number(object.radius.x)}" ry="${number(object.radius.y)}"/>`;
'''
replacement = '''    case "math.coordinate-plot":
      return `<g ${common} aria-label="Coordinate plot with ${object.definition.series.length} series"><rect height="${number(object.definition.size.height)}" rx="8" width="${number(object.definition.size.width)}"/><line x1="0" y1="${number(object.definition.size.height / 2)}" x2="${number(object.definition.size.width)}" y2="${number(object.definition.size.height / 2)}"/><line x1="${number(object.definition.size.width / 2)}" y1="0" x2="${number(object.definition.size.width / 2)}" y2="${number(object.definition.size.height)}"/></g>`;
    case "drawing.ellipse":
      return `<ellipse ${common} cx="0" cy="0" rx="${number(object.radius.x)}" ry="${number(object.radius.y)}"/>`;
'''
if marker not in content:
    raise SystemExit("snapshot coordinate plot marker missing")
snapshot.write_text(content.replace(marker, replacement), encoding="utf-8")

undo = Path("src/modules/server-sync/undo.ts")
content = undo.read_text(encoding="utf-8")
marker = '''    case "core.objects.delete": {
'''
replacement = '''    case "core.coordinate-plot.update":
      return [
        {
          ...meta(),
          expected: command.replacement,
          kind: command.kind,
          objectId: command.objectId,
          replacement: command.expected,
        },
      ];
    case "core.objects.delete": {
'''
if marker not in content:
    raise SystemExit("undo coordinate plot marker missing")
undo.write_text(content.replace(marker, replacement), encoding="utf-8")
PY

npm ci
npm run format
npm run board-contract:generate
npm run format
npm run lint
npm run typecheck
npm run test
npm run performance
npm run architecture
npm run build

python3 scripts/apply-coordinate-plot-pr1.py cleanup
rm -f \
  .github/workflows/coordinate-plot-pr1.yml \
  scripts/apply-coordinate-plot-pr1.py.gz.b64 \
  scripts/run-coordinate-plot-pr1-integration.sh

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "feat: add coordinate plot domain model"
git push
