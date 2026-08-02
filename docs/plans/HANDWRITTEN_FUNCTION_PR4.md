# Handwritten function PR 4 plan

## Goal

Connect the PR 1–3 handwritten-function workflow to a production-capable digital-ink provider without exposing provider credentials to the browser. PR 4 adds a Mathpix strokes adapter, a same-origin TutorBoard client contract and a separately deployable backend proxy.

The browser continues to consume the provider-neutral `MathInkRecognizer` port. Provider authentication, payload translation, retry policy, quotas and operational diagnostics remain behind the proxy boundary.

## Provider choice

PR 4 targets Mathpix `POST /v3/strokes` because it accepts coordinate arrays directly and returns LaTeX plus confidence. TutorBoard sends the privacy control `metadata.improve_mathpix=false` for every request.

The provider endpoint and credentials are server-side configuration:

- `MATHPIX_APP_ID`;
- `MATHPIX_APP_KEY`;
- `MATHPIX_API_URL`, default `https://api.mathpix.com/v3/strokes`;
- `MATH_INK_PROXY_PORT`, default `8787`.

Production configuration requires HTTPS and the `api.mathpix.com` hostname. Test composition may inject a fetch implementation and endpoint without changing runtime environment policy.

## Architecture

```text
App handwritten workflow
  -> MathInkRecognizer
  -> adapters/math-ink-http
  -> POST /api/v1/math-ink/recognize
  -> unprivileged Nginx reverse proxy
  -> services/math-ink-proxy
  -> POST https://api.mathpix.com/v3/strokes
```

### Browser adapter owns

- same-origin endpoint resolution;
- bounded request serialization;
- caller abort propagation;
- client timeout;
- request ID header;
- bounded response reading;
- response contract validation;
- conversion into `MathInkRecognitionResult`;
- stable user-facing transport errors.

### Backend proxy owns

- provider credentials;
- request/body limits;
- semantic stroke validation;
- normalized-coordinate conversion into Mathpix coordinate arrays;
- provider request options and privacy metadata;
- provider timeout and one bounded retry;
- retry-after handling;
- concurrency limiting;
- per-client rate limiting;
- response normalization;
- structured logs without stroke data or credentials;
- readiness and liveness endpoints;
- graceful shutdown.

### Existing layers remain authoritative

- `modules/handwritten-function` owns the `MathInkRecognizer` port and result semantics;
- `App` owns capture, correction, graph preview and history composition;
- the proxy never creates board commands or parses TutorBoard plot expressions;
- provider LaTeX is interpreted only by the PR 2 pipeline in the browser.

## Same-origin contract

Endpoint:

```text
POST /api/v1/math-ink/recognize
```

Request body is `tutorboard.math-ink-request/0.1` from PR 1. The proxy rejects unknown top-level properties, invalid identifiers, non-finite coordinates, non-monotonic time, empty strokes and values beyond the domain limits.

Response body uses:

```text
tutorboard.math-ink-proxy-result/0.1
```

It contains:

- TutorBoard request ID;
- provider request ID when available;
- provider model version;
- recognized, ambiguous or unrecognized status;
- bounded candidate list;
- provider confidence;
- sanitized diagnostics.

Provider payloads and raw error bodies are never returned to the browser.

## Coordinate translation

PR 1 normalized coordinates stay within one aspect-preserving unit square. The proxy maps them to integer provider coordinates in `[0, 10_000]`:

```text
providerX = round(normalizedX * 10_000)
providerY = round(normalizedY * 10_000)
```

Stroke order and point order are preserved. X/Y arrays must have equal lengths. Time values stay within the TutorBoard request and are excluded from the provider DTO because Mathpix strokes use coordinate arrays.

## Provider request

The proxy sends:

- `app_id` and `app_key` headers;
- `Content-Type: application/json`;
- double-nested Mathpix `strokes.strokes.x/y` arrays;
- `formats: ["latex_styled", "text"]`;
- `metadata.improve_mathpix=false`;
- a bounded request identifier in metadata for operational correlation.

The proxy accepts `latex_styled` first and falls back to `text`. Inline and block Mathpix delimiters are stripped only at the outer boundary. The resulting candidate format is `latex`.

## Reliability policy

### Timeouts

- browser request timeout: 15 seconds;
- provider attempt timeout: 10 seconds;
- total proxy operation budget: 20 seconds.

Caller abort, browser navigation, client disconnect and service shutdown abort the upstream request.

### Retry

At most one retry is performed for:

- network failure;
- HTTP 429;
- HTTP 502, 503 or 504.

The proxy respects a numeric `Retry-After` value up to two seconds. Otherwise it waits a configured bounded backoff. Validation errors, authentication failures and other 4xx responses are never retried.

### Load protection

- request body maximum: 256 KiB;
- maximum 128 strokes;
- maximum 4,096 points per stroke;
- maximum 16,384 points total;
- configurable concurrent upstream requests, default 4;
- configurable per-client fixed-window rate limit, default 30 requests per minute;
- immediate `429` or `503` response when a guard rejects work.

No unbounded queue is introduced.

## Error mapping

The proxy returns RFC 9457-style problem JSON with stable codes:

- `math-ink.invalid-request` — 400;
- `math-ink.request-too-large` — 413;
- `math-ink.rate-limited` — 429;
- `math-ink.proxy-unconfigured` — 503;
- `math-ink.proxy-busy` — 503;
- `math-ink.provider-authentication` — 502;
- `math-ink.provider-rate-limited` — 503;
- `math-ink.provider-invalid-response` — 502;
- `math-ink.provider-unavailable` — 503;
- `math-ink.provider-timeout` — 504.

The browser adapter converts these problems into typed `MathInkHttpError` instances. `App` keeps the source ink and exposes the stable human-readable message already used by its failure flow.

## Configuration and feature gates

Add:

- `VITE_MATH_INK_API_BASE_URL`, default `/api/v1/math-ink`;
- `VITE_FEATURE_MATH_INK_RECOGNITION`.

The recognition feature defaults to disabled in every stage. It must be explicitly enabled when the proxy is deployed and configured. The handwritten-function tool remains independently controlled by `VITE_FEATURE_HANDWRITTEN_FUNCTIONS`, preserving the manual expression workflow.

The environment parser accepts only a same-origin path for the browser endpoint. Credentials, query strings, fragments and cross-origin URLs are rejected.

## Deployment

Add a separate `Dockerfile.math-ink-proxy` using Node 24 Alpine and a non-root runtime user. The image contains only the proxy service files and package metadata.

Nginx forwards the exact recognition path to the service name `math-ink-proxy:8787`. Dynamic DNS resolution keeps the existing static image bootable when the optional service is absent; requests then fail closed with a gateway error.

A deployment example documents the two containers and secret injection. Secrets are provided through runtime environment or an orchestrator secret store and are excluded from image layers, Vite variables, logs and browser responses.

## Verification

### Browser adapter unit tests

- same-origin URL policy;
- request headers and body;
- successful recognized response;
- ambiguous and unrecognized responses;
- caller abort;
- timeout;
- problem response mapping;
- wrong content type;
- invalid JSON;
- oversized response;
- schema mismatch.

### Proxy unit tests

- TutorBoard request validation;
- exact Mathpix DTO translation;
- privacy metadata;
- delimiter normalization;
- recognized and unrecognized mapping;
- authentication and provider problem mapping;
- timeout and abort;
- one retry for transient failures;
- no retry for permanent failures;
- retry-after cap;
- request size, stroke and point limits;
- concurrency and rate guards;
- logs exclude payload and credentials.

### Application tests

- bootstrap creates the recognizer only when explicitly enabled;
- ProductShell passes the recognizer to local and synchronized workspaces;
- manual fallback remains available when disabled;
- environment rejects cross-origin API configuration.

### Production gate

- full repository quality gate;
- Chromium and Firefox handwritten workflow against a local mock proxy;
- proxy container builds and runs as non-root;
- read-only filesystem operation;
- health/readiness checks;
- Trivy scan;
- secret strings absent from the frontend bundle and container history.

## Out of scope

- live paid-provider calls in public CI;
- browser-visible provider credentials;
- multiple provider routing;
- long-lived recognition result storage;
- handwriting accuracy certification on a representative educational corpus;
- automatic provider billing reconciliation.
