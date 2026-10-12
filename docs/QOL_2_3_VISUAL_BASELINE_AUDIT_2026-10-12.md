# QoL 2.3 visual baseline audit — 2026-10-12

## Root cause

The coordinate plot production visual gate failed on QoL 2.3 PR #248 because the stored
full-page screenshots predated two independently verified UI changes:

1. QoL 2.2 / merged PR #247 added the **Bookmarks** button in the top-right corner.
   It appears in the bounded-legend snapshot after the coordinate plot editor is closed.
2. QoL 2.3 adds the **Lesson mode** entry button to the existing bottom dock.
   The new button changes the width/position of the dock in desktop snapshots.

The geometry, curve plotting, axes, labels, selected-object handles, editor, and legend
are pixel-identical outside the two UI regions.

## Evidence and the exact accepted pixel regions

Compared the checked-in baselines with fresh Chromium and Firefox screenshots at
1440 × 900 (Playwright full-page), using RGBA byte-by-byte comparisons.

| Snapshot | Bottom dock changed pixels | Top-right bookmarks changed pixels | Other changed pixels |
| --- | ---: | ---: | ---: |
| bounded-legend / Chromium | 17,093 | 7,009 | **0** |
| bounded-legend / Firefox | 14,694 | 6,980 | **0** |
| functions / Chromium | 17,093 | 0 | **0** |
| functions / Firefox | 14,693 | 0 | **0** |

The measured changed-pixel bounding boxes were:
- Bookmarks: `x=1300..1432`, `y=9..64` (bounded-legend only).
- Dock: `x=277..1162` (Chromium) / `x=278..1162` (Firefox), `y=819..899`.

An ephemeral GitHub Actions visual audit job checked exactly the four expected PNG
paths against the original `HEAD` snapshots; it rejected changes outside bounded
audit regions (dock: `x=260..1180, y>=810`; bookmarks:
`x>=1290, y<=75`), rejected unexpected snapshot names or dimensions, and
required a positive change count in the expected regions. All four checks passed
with zero pixels outside the allowed regions.

Evidence: GitHub Actions run
[38292634309](https://github.com/ArtemLevin/tutorboard/actions/runs/38292634309);
diagnostic artifact from run
[38292086836](https://github.com/ArtemLevin/tutorboard/actions/runs/38292086836).

## Regression protection

- Updated only the **four** audited desktop PNG baselines for
  `tests/e2e/coordinate-plot-visual.spec.ts`.
- Kept the existing `maxDiffPixelRatio: 0.002` unchanged.
- Kept full-page visual assertions for the editor, advanced settings, and bounded
  legend; retained Chromium, Firefox and mobile projects.
- Removed the temporary audit workflow after its successful run.
- CI must re-run the coordinate plot production gate on the updated screenshots;
  production rollout remains subject to independent release gates.
