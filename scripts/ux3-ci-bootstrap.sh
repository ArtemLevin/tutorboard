#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import re

source = Path('.github/workflows/ux3-implementation.yml').read_text(encoding='utf-8')
step = '      - name: Implement canvas navigation, mobile UX and visual matrix\n        run: |\n'
start = source.index(step) + len(step)
end = source.index('\n      - name: Commit implementation and visual baselines', start)
lines = source[start:end].splitlines()
script = '\n'.join(line[10:] if line.startswith('          ') else line for line in lines) + '\n'
script = script.replace(
    'import type { ReactElement } from "react";',
    'import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";',
    1,
).replace(
    'React.PointerEvent<HTMLElement>',
    'ReactPointerEvent<HTMLElement>',
    1,
)
script = script.replace(
    "\n<CoordinatePlotEditorPanel'''",
    "\n          <CoordinatePlotEditorPanel'''",
    1,
)
brittle = '''if renderer.count(old_legend) != 1:
    raise SystemExit(f"coordinate-plot-renderer.tsx: legend block count {renderer.count(old_legend)}")
renderer = renderer.replace(old_legend, new_legend_block, 1)
'''
structural = '''legend_start_marker = "      {definition.legend.visible && visibleSeries.length > 0 && ("
legend_end_marker = "\\n      {editing ? ("
legend_start = renderer.index(legend_start_marker)
legend_end = renderer.index(legend_end_marker, legend_start)
renderer = renderer[:legend_start] + new_legend_block + renderer[legend_end:]
'''
if brittle not in script:
    raise SystemExit('UX3 bootstrap legend patch anchor is missing')
script = script.replace(brittle, structural, 1)
ci_structural = '''lifecycle_command = "          npm run e2e:plot-production 2>&1 | tee coordinate-plot-browser.log"
visual_command = lifecycle_command + "\\n\\n      - name: Run coordinate plot visual regression matrix\\n        run: |\\n          set -o pipefail\\n          npm run e2e:plot-visual 2>&1 | tee coordinate-plot-visual.log"
if ci.count(lifecycle_command) != 1:
    raise SystemExit("ci lifecycle command anchor failed")
ci = ci.replace(lifecycle_command, visual_command, 1)
artifact_marker = "            coordinate-plot-browser.log\\n            test-results"
if ci.count(artifact_marker) != 1:
    raise SystemExit("ci artifact anchor failed")
ci = ci.replace(
    artifact_marker,
    "            coordinate-plot-browser.log\\n            coordinate-plot-visual.log\\n            test-results",
    1,
)
ci_path.write_text(ci, encoding="utf-8")
'''
script, count = re.subn(
    r'if ci\.count\(lifecycle\) != 1:[\s\S]*?ci_path\.write_text\(ci, encoding="utf-8"\)\n',
    lambda _: ci_structural,
    script,
    count=1,
)
if count != 1:
    raise SystemExit('UX3 bootstrap CI patch block is missing')
fixes = '''python - <<'PYFIX'
from pathlib import Path

renderer_path = Path("src/adapters/canvas-konva/coordinate-plot-renderer.tsx")
renderer = renderer_path.read_text(encoding="utf-8")
old = ''' + '"""' + '''            onTouchCancel={(event) => {
              viewportPinchRef.current = null;
              viewportDragRef.current = null;
              setPlotCursor(event.currentTarget, "");
            }}''' + '"""' + '''
new = ''' + '"""' + '''            onTouchCancel={() => {
              viewportPinchRef.current = null;
              viewportDragRef.current = null;
              if (cursorContainerRef.current !== null) {
                cursorContainerRef.current.style.cursor = "";
              }
            }}''' + '"""' + '''
if renderer.count(old) != 1:
    raise SystemExit("touch cancel cleanup anchor failed")
renderer = renderer.replace(old, new, 1)

old_pointer = ''' + '"""' + '''            onPointerDown={(event) => {
              event.cancelBubble = true;
              event.evt.preventDefault();
            }}
            onTouchStart={(event) => {''' + '"""' + '''
new_pointer = ''' + '"""' + '''            onMouseDown={(event) =>
              setPlotCursor(event.currentTarget, "grabbing")
            }
            onMouseUp={(event) => setPlotCursor(event.currentTarget, "grab")}
            onPointerDown={(event) => {
              event.cancelBubble = true;
              event.evt.preventDefault();
            }}
            onTouchStart={(event) => {''' + '"""' + '''
if renderer.count(old_pointer) != 1:
    raise SystemExit("pointer cursor anchor failed")
renderer_path.write_text(renderer.replace(old_pointer, new_pointer, 1), encoding="utf-8")

spec_path = Path("tests/e2e/coordinate-plot-production.spec.ts")
spec = spec_path.read_text(encoding="utf-8")
old_spec = 'const target = document.querySelector<HTMLElement>(".konvajs-content");'
new_spec = 'const target = window.document.querySelector<HTMLElement>(".konvajs-content");'
if spec.count(old_spec) != 1:
    raise SystemExit("browser document anchor failed")
spec_path.write_text(spec.replace(old_spec, new_spec, 1), encoding="utf-8")
PYFIX
npx prettier --write src/adapters/canvas-konva/coordinate-plot-renderer.tsx tests/e2e/coordinate-plot-production.spec.ts
'''
if script.count('npm run typecheck') != 1:
    raise SystemExit('UX3 bootstrap typecheck command is missing')
script = script.replace('npm run typecheck', fixes + 'npm run typecheck', 1)
Path('/tmp/ux3-implementation.sh').write_text('set -euo pipefail\n' + script, encoding='utf-8')
PY

bash /tmp/ux3-implementation.sh

python - <<'PY'
from pathlib import Path
import json

path = Path('package.json')
package = json.loads(path.read_text(encoding='utf-8'))
package['scripts']['format:check'] = 'prettier --check "src/**/*.{ts,tsx,css}" "tests/**/*.{ts,mjs}" "scripts/**/*.mjs" "tools/**/*.{html,js,mjs,ts}" "*.{html,js,json,mjs,ts}" ".github/**/*.yml"'
path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

mapfile -t files < <(
  {
    git diff --name-only
    git ls-files --others --exclude-standard
  } | sort -u | grep -v '^\.github/workflows/ux3-' | grep -v '^scripts/ux3-ci-bootstrap\.sh$'
)

printf '%s\n' "${files[@]}" > /tmp/ux3-file-list.txt
tar -czf /tmp/ux3-payload.tar.gz -T /tmp/ux3-file-list.txt
{
  echo 'UX3_PAYLOAD_BASE64_BEGIN'
  base64 -w 0 /tmp/ux3-payload.tar.gz
  echo
  echo 'UX3_PAYLOAD_BASE64_END'
  echo 'UX3_FILE_LIST_BEGIN'
  cat /tmp/ux3-file-list.txt
  echo 'UX3_FILE_LIST_END'
} > unit-tests.log

exit 1
