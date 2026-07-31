#!/usr/bin/env bash
set -euo pipefail

base64 --decode scripts/apply-coordinate-plot-pr1.py.gz.b64 | gzip --decompress > scripts/apply-coordinate-plot-pr1.py
python3 scripts/apply-coordinate-plot-pr1.py apply

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
