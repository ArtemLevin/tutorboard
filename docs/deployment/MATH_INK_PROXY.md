# Math ink recognition proxy deployment

## Components

Automatic handwritten-function recognition uses two runtime components:

1. the existing TutorBoard static Nginx image;
2. `Dockerfile.math-ink-proxy`, a Node 24 service that owns Mathpix credentials.

The browser sends `tutorboard.math-ink-request/0.1` to the same-origin path
`/api/v1/math-ink/recognize`. Nginx forwards the request to
`math-ink-proxy:8787/v1/recognize`.

## Required configuration

Enable both frontend build flags:

```text
VITE_FEATURE_HANDWRITTEN_FUNCTIONS=true
VITE_FEATURE_MATH_INK_RECOGNITION=true
```

Provide the proxy runtime secrets through the deployment platform:

```text
MATHPIX_APP_ID
MATHPIX_APP_KEY
```

Store these values in an orchestrator secret store or protected runtime
environment. Keep them out of Docker build arguments, Vite variables, source
files, logs and browser configuration.

Optional proxy configuration:

| Variable | Default | Meaning |
| --- | ---: | --- |
| `MATH_INK_PROXY_PORT` | `8787` | HTTP listen port |
| `MATHPIX_API_URL` | `https://api.mathpix.com/v3/strokes` | Provider endpoint |
| `MATH_INK_MAX_CONCURRENCY` | `4` | Simultaneous upstream requests |
| `MATH_INK_PROVIDER_TIMEOUT_MS` | `10000` | One provider attempt deadline |
| `MATH_INK_RATE_LIMIT` | `30` | Requests per client window |
| `MATH_INK_RATE_WINDOW_MS` | `60000` | Fixed rate window |
| `MATH_INK_RETRY_DELAY_MS` | `150` | Fallback retry backoff |

`MATH_INK_ALLOW_INSECURE_UPSTREAM=true` exists for isolated tests with a local
mock. Production configuration accepts the HTTPS Mathpix hostname.

## Example deployment

`deploy/math-ink.compose.yml` demonstrates both containers, read-only filesystems,
`no-new-privileges`, dropped Linux capabilities and runtime secret injection.

```bash
MATHPIX_APP_ID='...' MATHPIX_APP_KEY='...' \
  docker compose -f deploy/math-ink.compose.yml up --build
```

The static image remains usable when the optional proxy is absent. The handwritten
function tool retains its manual expression workflow. Requests to the automatic
recognition endpoint fail closed.

## Health and readiness

Proxy endpoints:

```text
GET /healthz
GET /readyz
```

`/healthz` reports process availability. `/readyz` returns `200` only when both
Mathpix credentials are present. Missing credentials produce the stable
`math-ink.proxy-unconfigured` problem.

TutorBoard Nginx continues to expose its own `/healthz` endpoint.

## Request protection

The proxy applies the following guards before provider work:

- 256 KiB HTTP body limit;
- strict request schema and unknown-property rejection;
- at most 128 strokes;
- at most 4,096 points per stroke;
- at most 16,384 points in total;
- finite normalized coordinates within `[0, 1]`;
- monotonic per-stroke time;
- fixed-window per-client rate limit;
- bounded upstream concurrency without an unbounded queue.

Each provider attempt has a deadline. One retry is allowed for transport failure,
HTTP 429 and HTTP 502/503/504. Numeric `Retry-After` values are capped at two
seconds.

## Privacy and logging

Every Mathpix request contains:

```json
{
  "metadata": {
    "improve_mathpix": false
  }
}
```

Structured proxy logs contain request identifiers, duration, outcome and HTTP
status. They exclude coordinates, expressions, provider response bodies,
`MATHPIX_APP_ID` and `MATHPIX_APP_KEY`.

The browser receives a TutorBoard-owned bounded DTO. Raw provider errors and
provider payloads stay inside the proxy.

## Verification without paid-provider calls

Public CI uses an injected or local mock upstream. It verifies:

- exact coordinate translation;
- authentication headers inside the proxy boundary;
- privacy metadata;
- timeout, abort and retry behavior;
- stable problem mapping;
- non-root and read-only container runtime;
- health/readiness behavior;
- secret absence from the frontend bundle;
- container vulnerability scan.

A live Mathpix smoke test belongs in a protected deployment environment with
explicit quota and billing controls.
