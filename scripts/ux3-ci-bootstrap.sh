#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
from textwrap import dedent

source = Path('.github/workflows/ux3-implementation.yml').read_text(encoding='utf-8')
step = '      - name: Implement canvas navigation, mobile UX and visual matrix\n        run: |\n'
start = source.index(step) + len(step)
end = source.index('\n      - name: Commit implementation and visual baselines', start)
script = dedent(source[start:end])
Path('/tmp/ux3-implementation.sh').write_text(script, encoding='utf-8')
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
