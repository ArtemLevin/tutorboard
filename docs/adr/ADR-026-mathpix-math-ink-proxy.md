# ADR-026 — Mathpix math-ink proxy

## Status

Accepted for handwritten-function PR 4.

## Context

PRs 1–3 provide bounded digital-ink capture, provider-neutral recognition contracts, candidate interpretation and a complete canvas-to-graph workflow. Automatic recognition still requires a concrete provider.

Mathpix accepts stroke coordinate arrays through `POST /v3/strokes` and returns LaTeX plus confidence. Its `app_id` and `app_key` are server credentials. Shipping either value in a Vite bundle would expose it to every browser and would make quota, retry and privacy controls impossible to enforce centrally.

TutorBoard's production image is currently a static unprivileged Nginx container. Provider integration therefore needs a separate runtime process rather than additional browser logic inside the static image.

## Decision

- Implement `adapters/math-ink-http` as the browser-side `MathInkRecognizer` adapter.
- Send PR 1 requests only to a same-origin TutorBoard endpoint.
- Add a separately deployable Node 24 proxy service.
- Translate normalized TutorBoard strokes into Mathpix's double-nested X/Y coordinate arrays.
- Set `metadata.improve_mathpix=false` for every provider request.
- Keep provider credentials, endpoint configuration, retries, quotas and logs inside the proxy.
- Return a bounded TutorBoard-owned response DTO and stable problem codes.
- Allow at most one retry for transient transport, 429 and 502/503/504 failures.
- Enforce body, stroke, point, rate and concurrency limits before provider work begins.
- Propagate aborts from the browser, client disconnect and shutdown to the upstream request.
- Expose automatic recognition behind `VITE_FEATURE_MATH_INK_RECOGNITION`, disabled by default.
- Preserve the manual expression workflow when the adapter is disabled or unavailable.
- Extend the architecture gate with one explicit adapter-to-feature-port exception: `math-ink-http` may consume only `modules/handwritten-function/public`.

## Consequences

The browser contains no Mathpix credentials or provider-specific DTOs. The canvas workflow continues to depend only on `MathInkRecognizer`, so future providers can be added without modifying App capture or graph composition.

The optional proxy becomes an independently deployable and observable service. Enabling automatic recognition requires both the frontend feature flag and runtime proxy credentials.

The public CI validates behavior with an injected/mock upstream. It does not spend paid provider quota or require secrets.

Provider output remains untrusted. LaTeX is validated by the existing PR 2 bounded conversion and expression compiler before a graph can be created.
