# Formula recognition gateway deployment

## Components

Automatic handwritten-function recognition uses two TutorBoard runtime components:

1. the static unprivileged Nginx application image;
2. `Dockerfile.math-ink-proxy`, a Node 24 formula-recognition gateway.

The browser rasterizes captured strokes to a bounded PNG and sends
`tutorboard.formula-recognition-request/1` to
`/api/v1/formula-recognition/recognize`. Nginx forwards the request to the gateway
at `math-ink-proxy:8787/v1/recognize`.

The gateway can expose any combination of:

- PaddleOCR Formula Recognition;
- a local OpenAI-compatible multimodal OCR-LLM;
- Yandex Vision OCR `math-markdown`.

## Frontend configuration

Enable both build flags:

```text
VITE_FEATURE_HANDWRITTEN_FUNCTIONS=true
VITE_FEATURE_MATH_INK_RECOGNITION=true
```

The same-origin API base defaults to:

```text
VITE_MATH_INK_API_BASE_URL=/api/v1/formula-recognition
```

Provider credentials and upstream URLs are runtime gateway settings. Keep them
out of Vite variables and Docker build arguments.

## Provider configuration

### PaddleOCR

```text
PADDLE_OCR_API_URL=http://paddle-formula:8080/v1/recognize
PADDLE_OCR_API_TOKEN=optional-bearer-token
PADDLE_OCR_ALLOW_INSECURE_UPSTREAM=true
```

Set the insecure-upstream switch only when PaddleOCR is reached over a trusted
container or loopback network. HTTPS remains required when the switch is absent.
The upstream receives `{ imageBase64, mimeType }` and returns a bounded JSON
object containing `latex` or `formula`, optional confidence and model version.
`PP-FormulaNet-S` is the recommended latency-oriented deployment model.

### Local OCR-LLM

```text
LOCAL_OCR_LLM_API_URL=http://ollama-gateway:11434/v1/chat/completions
LOCAL_OCR_LLM_MODEL=qwen2.5-vl:7b
LOCAL_OCR_LLM_API_KEY=optional-bearer-token
LOCAL_OCR_LLM_ALLOW_INSECURE_UPSTREAM=true
```

The endpoint must implement OpenAI-compatible multimodal chat completions and
accept image data URLs. The gateway requests one LaTeX expression with
temperature zero. Enable HTTP only for a trusted local endpoint.

### Yandex Cloud OCR

```text
YANDEX_FOLDER_ID=...
YANDEX_API_KEY=...
```

`YANDEX_IAM_TOKEN` can replace `YANDEX_API_KEY`. The gateway calls Yandex Vision
OCR with model `math-markdown`, `x-folder-id` and
`x-data-logging-enabled: false`. The default endpoint is restricted to
`https://ocr.api.cloud.yandex.net`. `YANDEX_OCR_ALLOW_INSECURE_UPSTREAM` exists
for isolated test environments and stays `false` in the production Compose file.

Provider URL validation runs during gateway startup. Invalid schemes,
credentials embedded in URLs, query strings, fragments and an unexpected Yandex
host prevent readiness from being advertised.

## Shared gateway configuration

| Variable | Default | Meaning |
| --- | ---: | --- |
| `FORMULA_RECOGNITION_GATEWAY_PORT` | `8787` | HTTP listen port |
| `FORMULA_RECOGNITION_MAX_CONCURRENCY` | `4` | Simultaneous upstream requests |
| `FORMULA_RECOGNITION_PROVIDER_TIMEOUT_MS` | `15000` | One provider attempt deadline |
| `FORMULA_RECOGNITION_RATE_LIMIT` | `30` | Requests per client window |
| `FORMULA_RECOGNITION_RATE_WINDOW_MS` | `60000` | Fixed rate window |
| `FORMULA_RECOGNITION_RETRY_DELAY_MS` | `150` | Fallback retry delay |
| `FORMULA_RECOGNITION_TRUSTED_PROXY_HOPS` | `0` | Trusted rightmost `X-Forwarded-For` hops |

The former global `FORMULA_RECOGNITION_ALLOW_INSECURE_UPSTREAM` switch is
rejected. Use the provider-specific switches so an internal HTTP Paddle endpoint
cannot weaken TLS enforcement for Yandex or another provider.

The gateway ignores `X-Forwarded-For` by default. Set trusted proxy hops to `1`
when one controlled reverse proxy appends the client address. The supplied
Compose deployment uses this value because TutorBoard Nginx is the only proxy
between the browser and the gateway.

## Example deployment

`deploy/math-ink.compose.yml` demonstrates both TutorBoard containers, read-only
filesystems, `no-new-privileges`, dropped Linux capabilities and optional runtime
provider settings.

At least one provider must be configured for readiness to succeed:

```bash
PADDLE_OCR_API_URL='http://paddle-formula:8080/v1/recognize' \
PADDLE_OCR_ALLOW_INSECURE_UPSTREAM=true \
  docker compose -f deploy/math-ink.compose.yml up --build
```

For the bundled Paddle sidecar, use the dedicated overlay and a generated bearer
token:

```bash
docker compose \
  --env-file deploy/paddle-formula.env \
  --file deploy/math-ink.compose.yml \
  --file deploy/paddle-formula.compose.yml \
  up --build --detach
```

The handwritten-function tool keeps its editable manual expression path when the
selected automatic provider is unavailable.

## User selection

The Settings route contains **Расширенные настройки доски** with three provider
radio cards. The selected provider is stored in the browser under the versioned
key:

```text
tutorboard.formula-recognition-settings/1
```

This preference stays outside `BoardDocument`, command history, collaboration,
snapshots and document exports. PaddleOCR is the default.

## Health and readiness

Gateway endpoints:

```text
GET /healthz
GET /readyz
```

`/healthz` reports process availability. `/readyz` returns a provider map and
status `200` when at least one provider is configured. Requests for an unavailable
selected provider return `formula-recognition.provider-unconfigured`.

## Request protection

The gateway applies these guards before provider work:

- 1 MiB HTTP request limit;
- strict schema and unknown-property rejection;
- PNG-only image input;
- maximum raster side of 768 pixels;
- maximum decoded image size of 768 KiB;
- source stroke and point count bounds;
- fixed-window per-client rate limiting;
- explicit trusted-proxy handling for forwarded client addresses;
- bounded global concurrency without an unbounded queue.

Each provider attempt has a deadline. One retry is allowed for transport failure,
HTTP 429 and HTTP 502/503/504. Numeric `Retry-After` values are capped at two
seconds. Browser abort, client disconnect and process shutdown cancel upstream
work.

The bundled Paddle sidecar also bounds its raw HTTP request before JSON parsing.
A cancelled request keeps the single Paddle inference lock until the native
inference call has actually completed, preventing concurrent access to one model
instance.

## Privacy and logging

Structured logs contain provider identifier, request identifier, duration,
outcome and HTTP status. They exclude image bytes, strokes, expressions, raw
provider bodies, model responses and credentials.

Provider secrets stay in the gateway environment. Public CI verifies that sample
Paddle, local VLM and Yandex secrets are absent from the frontend bundle.

## Verification

The production gate uses deterministic local mocks and validates:

- browser PNG request creation;
- user provider selection in Chromium and Firefox;
- PaddleOCR request and response normalization;
- OpenAI-compatible multimodal payloads;
- Yandex authentication, folder and disabled-logging headers;
- provider-specific transport policy and startup URL validation;
- trusted-proxy rate-limit identity handling;
- timeout, abort, retry, rate and concurrency behavior;
- non-root and read-only container runtime;
- provider-secret exclusion from the frontend bundle;
- strict HIGH/CRITICAL container vulnerability scanning.

Live provider smoke tests belong in protected deployment environments with
explicit quota, model and billing controls.
