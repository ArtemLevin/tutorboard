# Smart Ink Calibration Studio — capture and evaluation workflow

**Route (Vite dev or production preview):**
`/tools/smart-ink-calibration-studio.html`

## Workflow

1. Set anonymous writer and device codes. Keep each code stable across
   sessions with the same author and physical device.
2. Choose **Фигуры**, one of the three scripts, **Цифры**, or ordinary ink.
3. Choose the exact target, draw a trace (one or multiple strokes), and press
   **Добавить пример**.
4. Select any saved entry to preview it. To correct its target, choose the
   intended class at the top and click **Исправить метку на выбранную выше**.
   Any edited sample returns to `unreviewed` status.
5. Click **Сохранить локально** to store the corpus in browser IndexedDB.
   Storage is explicit. **Загрузить локально** restores it in this browser.
   Always export JSON as a backup; browser site-data cleanup can erase
   IndexedDB. **Удалить локальную копию** erases only the stored snapshot,
   leaving the current in-memory dataset intact.
6. Export **общий JSON** for full multi-stroke data with the existing
   `tutorboard.smart-ink-glyph-corpus/1` contract.
7. Export **геометрию** for the old single-stroke calibration pipeline
   (`tutorboard.smart-ink-corpus/0.1`). Only one-stroke primitives and
   ordinary-ink negatives are eligible. Arrow, multi-stroke shapes and glyphs
   remain exclusively in the common dataset.

Imports support both existing formats. Legacy geometric examples are
converted to the common corpus (with generated time and neutral pressure,
because the old format does not contain those raw measurements). They
receive deterministic stable import IDs so duplicate imports are rejected.
An import is fully validated before replacing the in-memory dataset.
The historical capture pages remain available; no user links change.

## Recognition preview

The preview has two independent experimental diagnostics:

- Single-stroke geometric traces can be tested against the existing
  **Smart Ink geometric spike** recognizer. This is expressly **not** the
  production V2/board auto-correction decision.
- An operator may load a previously trained SI-G04A **experimental
  prototype model** (validated JSON). It returns raw nearest-centroid
  distances and top-3 candidate symbols.

The studio always prints an explicit **autocorrection blocked** status.
The mere act of drawing, inspecting, exporting, importing or locally
saving traces **does not retrain or change** production Smart Ink 2.0.
Quality thresholds must be derived independently from reviewed data and
validated on held-out writers/devices.

## Data quality and security

- Never put student names, lesson contents, access tokens or sensitive
  data in writer/device IDs. Obtain appropriate consent for handwriting.
- Every capture/import from legacy geometry is labelled `unreviewed`
  until a separate audit; the studio cannot self-certify reviews.
- The common schema limits input to 2,000 samples, 12 strokes per sample,
  16,384 points per sample and 300 seconds duration. Imports are limited
  to 8 MB. The model import is limited to 1 MB and strictly validated.
- Imports and all previews are local to the browser; no automatic uploads.
  File contents render via text nodes or canvas, never as HTML markup.
- Preview results are research diagnostics. Geometry composites, vector
  stroke grouping for the real board, calibrated glyph recognition and
  collaborative text replacement remain planned work.

## Tests

- `tests/node/smart-ink-calibration-studio.test.mjs` checks both schemas,
  legacy compatibility, duplicate import rejection, sample relabeling and
  backup validation.
- `tests/e2e/smart-ink-calibration-studio.spec.ts` checks capture,
  multi-stroke glyphs, export, IndexedDB restore, review and import.

Existing standalone capture pages and their tests remain unchanged.
