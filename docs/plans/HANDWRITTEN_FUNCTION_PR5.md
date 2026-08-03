# Handwritten function PR 5 — configurable formula recognition

## Goal

Replace the single Mathpix production path with a provider-neutral formula-recognition gateway and a user-controlled provider selection in the board's advanced settings.

The three supported choices are:

1. **PaddleOCR Formula Recognition** — local, fast, default provider.
2. **Local OCR-LLM** — an OpenAI-compatible multimodal endpoint, including a locally hosted Ollama-compatible gateway.
3. **Yandex Cloud OCR** — the `math-markdown` model exposed by Yandex Vision OCR and configured with server-side Yandex Cloud credentials.

Provider choice is user preference state. It must never alter `BoardDocument`, command history, collaboration payloads or exported board data.

## Architecture

```text
handwritten strokes
  -> deterministic browser PNG rasterization
  -> MathInkRecognizer HTTP adapter
  -> same-origin /api/v1/formula-recognition/recognize
  -> provider-aware recognition gateway
       -> PaddleOCR sidecar
       -> local OpenAI-compatible VLM
       -> Yandex Vision OCR math-markdown
  -> bounded TutorBoard recognition result
  -> existing PR 2 interpretation and expression compiler
  -> existing PR 3 editable confirmation and coordinate plot creation
```

The gateway owns provider DTOs, credentials, timeouts, retries, concurrency, rate limiting and privacy-safe diagnostics. The browser sends the selected provider identifier and a bounded PNG representation of the captured strokes.

## User settings

Add a versioned local preference store:

- key: `tutorboard.formula-recognition-settings/1`;
- schema version: `tutorboard.formula-recognition-settings/1`;
- default provider: `paddleocr`;
- accepted providers: `paddleocr`, `local-ocr-llm`, `yandex-ai-studio`.

The Settings route receives a new **Расширенные настройки доски** section with three radio cards. Each card shows:

- processing location;
- expected latency/quality profile;
- privacy implication;
- current deployment availability.

Changing the selection takes effect for the next recognition request. An in-flight operation keeps its original recognizer instance. If the selected provider is unavailable, the editable manual formula path remains active.

## Browser adapter

Extend `adapters/math-ink-http`:

- recognizer construction requires a provider;
- deterministic PNG rasterization from normalized strokes;
- white background, black round strokes, bounded dimensions and fixed padding;
- injectable rasterizer for tests;
- request DTO includes provider, image MIME type and base64 content;
- same-origin URL, request/response byte limits, timeout and abort propagation remain mandatory;
- response DTO accepts the three providers and returns provider-specific recognizer metadata.

## Gateway contract

Request schema version: `tutorboard.formula-recognition-request/1`.

Required fields:

- `provider`;
- `recognitionId`;
- `sessionId`;
- `image.mimeType = image/png`;
- bounded base64 image;
- source width/height metadata.

Response schema version: `tutorboard.formula-recognition-result/1`.

The response contains bounded candidates, diagnostics, provider, provider version and request correlation IDs.

## Provider adapters

### PaddleOCR

- upstream contract: `POST /v1/recognize`;
- request: `{ imageBase64, mimeType }`;
- response: `{ latex, confidence?, modelVersion? }`;
- recommended model: `PP-FormulaNet-S` for CPU latency; deployment may select `PP-FormulaNet_plus-M` for higher quality;
- no cloud credentials.

### Local OCR-LLM

- OpenAI-compatible `POST /v1/chat/completions`;
- image passed as a PNG data URL;
- deterministic system instruction requests one LaTeX expression and no prose;
- configurable base URL, model and optional bearer token;
- default model name is deployment-controlled;
- localhost/private-network HTTP is allowed only when explicitly enabled.

### Yandex Cloud OCR

- `POST https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText`;
- model: `math-markdown`;
- server-side API key or IAM token plus folder ID;
- `x-data-logging-enabled: false` by default;
- extract formula markup from the bounded OCR response and normalize outer Markdown delimiters.

## Reliability and security

- provider credentials never enter Vite variables or browser bundles;
- per-provider readiness is reported without exposing secrets;
- provider timeout defaults to 15 seconds;
- one retry for transport failures, 429 and 502/503/504;
- bounded retry delay and `Retry-After` handling;
- request body, decoded image and response limits;
- fixed-window client rate limit and global concurrency limit;
- caller disconnect and shutdown abort upstream requests;
- logs include provider, request ID, status and duration only;
- image bytes, strokes, formulas, provider bodies and credentials are excluded from logs.

## Migration

- keep the public `MathInkRecognizer` feature port;
- replace the Mathpix-specific browser metadata and proxy implementation;
- retain the existing feature flag during this PR for deployment compatibility;
- route `VITE_MATH_INK_API_BASE_URL` to `/api/v1/formula-recognition`;
- remove Mathpix credentials and deployment requirements;
- update ADR-026 to superseded status and add a new ADR for provider selection.

## Verification

Focused PR gate:

- settings schema, persistence and invalid-data recovery;
- provider selection UI and recognizer switching;
- deterministic rasterization contract;
- browser adapter DTO, timeout, abort and bounds;
- gateway validation and provider dispatch;
- PaddleOCR, local VLM and Yandex response normalization;
- authentication, timeout, rate-limit and malformed-response paths;
- provider-secret exclusion from frontend bundle;
- read-only/non-root gateway image;
- Chromium and Firefox flows for every provider through deterministic mocks;
- strict HIGH/CRITICAL Trivy scan.

Repository gates remain mandatory: formatting, lint, strict TypeScript, unit suite, performance, architecture, build, browser smoke, coordinate-plot matrix, GeometryOS live contract, Smart Ink production gate and main production image scan.
