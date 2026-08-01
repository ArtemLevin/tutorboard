# ADR-016 — Coordinate plot production gate

## Status

Accepted for implementation in PR 6.

## Context

PRs 1–5 introduced the BoardDocument model, safe expression language, adaptive sampler, production Konva renderer and complete editor workflow for `math.coordinate-plot`. The remaining release risk is lifecycle evidence across local storage, recovery, synchronization, browsers, performance and production packaging.

General TutorBoard gates already cover those subsystems. PR 6 adds representative coordinate-plot workloads to each relevant boundary so future changes cannot silently preserve generic boards while breaking graphs.

## Decision

- Add deterministic release fixtures shared by performance, persistence, synchronization and browser tests.
- Add explicit aggregate point, evaluation, time and cache budgets for a page with multiple coordinate planes.
- Verify exact IndexedDB round-trip and fallback from a corrupt newest revision.
- Flush scheduled local autosave work on visibility loss and page exit as a best-effort durability measure.
- Verify create/update command replay, offline queue synchronization and collaborative inverse behavior with coordinate plots.
- Run a dedicated Chromium/Firefox lifecycle scenario through creation, editing, local save, reload, duplication and JSON export.
- Add a coordinate-plot production-gate job after the quality gate and retain the existing independent image and security gates.
- Publish a release runbook with supported scope, diagnostics, recovery and browser acceptance procedures.

## Consequences

The first coordinate-plot version gains a measurable release contract. CI failures identify the affected lifecycle boundary directly. The additional tests use deterministic data and conservative wall-clock limits to remain stable on shared runners.

BoardDocument, expression-language and sampler schema versions remain unchanged. Future worker sampling, animations and additional series kinds can extend the same fixtures and production-gate workflow.
