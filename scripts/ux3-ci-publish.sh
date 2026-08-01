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

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- \
  package.json \
  playwright.visual.config.ts \
  src/adapters/canvas-konva/coordinate-plot-editing.ts \
  src/adapters/canvas-konva/coordinate-plot-renderer.tsx \
  src/adapters/canvas-konva/coordinate-plot-rendering.ts \
  src/adapters/canvas-konva/default-renderers.tsx \
  src/adapters/canvas-konva/public.ts \
  src/adapters/canvas-konva/renderer-registry.tsx \
  src/app/App.tsx \
  src/app/CoordinatePlotEditorPanel.css \
  src/app/CoordinatePlotEditorPanel.tsx \
  src/app/CoordinatePlotNavigationControls.css \
  src/app/CoordinatePlotNavigationControls.test.tsx \
  src/app/CoordinatePlotNavigationControls.tsx \
  tests/e2e/coordinate-plot-production.spec.ts \
  tests/e2e/coordinate-plot-visual.spec.ts \
  tests/e2e/coordinate-plot-visual.spec.ts-snapshots \
  tests/unit/adapters/canvas-konva/coordinate-plot-editing.test.ts \
  tests/unit/adapters/canvas-konva/coordinate-plot-rendering.test.ts

if git diff --cached --quiet; then
  echo "Verified UX3 payload produced no product changes" >&2
  exit 1
fi

git commit -m "feat: add coordinate plot canvas and mobile UX"
git push origin "HEAD:${branch}"
