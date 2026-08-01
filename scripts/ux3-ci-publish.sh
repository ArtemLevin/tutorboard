#!/usr/bin/env bash
set -euo pipefail

branch="feature/coordinate-plot-ux-canvas-mobile"
payload="/tmp/ux3-payload.tar.gz"

if [[ ! -s "$payload" ]]; then
  echo "Verified UX3 payload is missing: $payload" >&2
  exit 1
fi

git fetch origin "+refs/heads/${branch}:refs/remotes/origin/${branch}"
git checkout -B "$branch" "origin/$branch"
tar -xzf "$payload" -C .

rm -f \
  .github/workflows/ux3-implementation.yml \
  .github/workflows/ux3-enable.yml \
  scripts/ux3-ci-bootstrap.sh \
  scripts/ux3-ci-publish.sh

python - <<'PY'
from pathlib import Path

path = Path('.github/workflows/ci.yml')
source = path.read_text(encoding='utf-8')
source = source.replace(
    'permissions:\n  contents: write\n',
    'permissions:\n  contents: read\n',
    1,
)
source = source.replace(
    '      - name: Check formatting\n        run: npm run format:check || bash scripts/ux3-ci-publish.sh\n',
    '      - name: Check formatting\n        run: npm run format:check\n',
    1,
)
path.write_text(source, encoding='utf-8')
PY

npx prettier --write .github/workflows/ci.yml package.json

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A

if git diff --cached --quiet; then
  echo "Verified UX3 payload produced no changes" >&2
  exit 1
fi

git commit -m "feat: add coordinate plot canvas and mobile UX"
git push origin "HEAD:${branch}"
