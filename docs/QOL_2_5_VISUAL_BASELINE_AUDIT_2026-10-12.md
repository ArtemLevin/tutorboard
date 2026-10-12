# QoL 2.5 visual baseline audit — 2026-10-12

## Scope and root cause

The third pen-profile button expanded the existing bottom dock. Full-page coordinate-plot desktop screenshots recorded an expected toolbar-only change. No visual threshold or screenshot assertion was relaxed.

## Bytewise evidence

Compared original and fresh Chromium/Firefox opaque PNGs, 1440 x 900. Every changed pixel belongs to the bounded dock region x=220..1219, y=800..899; all other pixels (plots, axes, legends, editor and the rest of the page) are identical.

| Snapshot | Changed pixels | Bounding box [x0,y0,x1,y1) | Outside dock |
| --- | ---: | --- | ---: |
| coordinate-plot-bounded-legend-visual-chromium-desktop-linux.png | 15055 | (258, 819, 1182, 900) | 0 |
| coordinate-plot-bounded-legend-visual-firefox-desktop-linux.png | 14705 | (259, 819, 1182, 900) | 0 |
| coordinate-plot-functions-visual-chromium-desktop-linux.png | 15055 | (258, 819, 1182, 900) | 0 |
| coordinate-plot-functions-visual-firefox-desktop-linux.png | 14703 | (259, 819, 1182, 900) | 0 |

Evidence: GitHub Actions run #38311858959. The other six existing screenshot baselines were bytewise identical and not updated. The configured full-page Playwright maxDiffPixelRatio=0.002 remains unchanged.
