# Coordinate plot operations runbook

## Supported first release

The first production release supports explicit `y=f(x)` series and parametric `x=f(t), y=g(t)` series inside one `math.coordinate-plot` object. A plot can contain shared numeric parameters, independent line styles, automatic or manual grid steps, configurable axes and a legend.

The release contract supports up to 32 stored series per coordinate plane, up to 12,000 sampled points per series, up to 80,000 sampled points per coordinate plane, adaptive depth up to 12 and up to 16 coordinate planes on one page. Rendering may stop refinement early when a safety budget is reached; already accepted finite fragments remain visible.

## User durability model

The editor keeps a transient draft. Choosing **Сохранить** emits one stale-safe `core.coordinate-plot.update` command. Local mode schedules the resulting BoardDocument for IndexedDB autosave. The application also requests an immediate flush when the document becomes hidden or the page starts leaving.

A saved coordinate plane preserves:

- outer board identity and transform;
- internal viewport;
- axes, grid and legend configuration;
- shared parameters;
- every series formula, range, visibility and style;
- expression-language version.

## Local recovery

TutorBoard stores immutable local revisions and a small document head. At startup:

1. the current revision is validated;
2. a corrupt revision is retained as a recovery record;
3. the newest earlier valid revision becomes active;
4. the UI reports that recovery occurred;
5. diagnostics can be downloaded from the persistence alert.

When every stored revision is unusable, the recovery screen offers diagnostic export, JSON import and a clean board. Existing raw records remain available until the user explicitly clears browser storage.

## Synchronization recovery

Server mode keeps a confirmed snapshot plus an ordered local command queue. Coordinate-plot commands follow the same revision and checksum protocol as other board objects.

When connectivity is unavailable, commands remain in IndexedDB and the status bar reports the pending count. Reconnection pulls remote batches, replays local commands against the confirmed head and submits them with a canonical BoardDocument SHA-256. Revision gaps, snapshot mismatches or stale definition conflicts enter a recovery state with a downloadable local document where available.

## Diagnostics collection

For local failures:

1. choose **Скачать диагностику** from the persistence or recovery UI;
2. retain the exported JSON together with the original document export;
3. record browser name and version;
4. record the action immediately before the failure;
5. keep IndexedDB intact until analysis is complete.

For server-sync failures, also record the lesson ID, document ID, displayed server revision and pending-command count. Application diagnostics exclude formula ASTs, sampled point caches and transient editor state.

## Browser acceptance

The release browser matrix uses the production bundle in Chromium and Firefox. The acceptance scenario creates explicit and parametric series, adds a shared parameter, changes visibility and viewport settings, saves, reloads, reopens, duplicates and exports the document.

## Performance triage

A performance regression usually appears in one of four counters:

- expression compilation count;
- evaluation count;
- sampled point count;
- elapsed workload time.

First confirm whether cache keys change because of viewport, board zoom, plot size, object scale or parameter values. Then inspect stop reasons and per-series diagnostics. Raising safety limits requires a separate architecture decision and updated production budgets.

## Production image

The release image must start with a read-only root filesystem, user `101`, all Linux capabilities dropped and `no-new-privileges`. `/healthz` must answer before browser traffic is accepted. HIGH and CRITICAL image findings block release according to the existing Trivy policy.
