# Handwritten function architecture

## Ownership

| Boundary | Responsibility |
| --- | --- |
| `modules/handwritten-function` | Multi-stroke session, provider-neutral recognition port, bounded candidate conversion, production expression validation and ranking |
| `app/App` | Toolbar entry, pointer routing, cancellation, editable confirmation, accessibility and history composition |
| `app/handwritten-function-composition` | Pure stroke materialization, draft validation, coordinate-plot construction and replace-command creation |
| `app/HandwrittenFunctionPanel` | Non-modal review, candidate choice, manual correction and graph controls |
| `app/configuration/formula-recognition-settings` | Versioned browser-local provider preference outside `BoardDocument` |
| `app/FormulaRecognitionSettingsPanel` | Advanced board settings for provider choice and privacy/location guidance |
| `adapters/math-ink-http` | Deterministic PNG rasterization, same-origin `MathInkRecognizer`, timeout, abort and bounded DTO validation |
| `services/math-ink-proxy` | Provider gateway, credentials, provider DTOs, retry/load policy and sanitized diagnostics |

The feature module remains transient. It owns no board document, React component,
Konva node, storage record or network request. Application composition and
adapters inject every external operation.

## Public identifiers and versions

```text
math.handwritten-function
tutorboard.handwritten-function-session/0.1
tutorboard.math-ink-request/0.1
tutorboard.math-ink-result/0.1
tutorboard.handwritten-function-interpretation/0.1
tutorboard.formula-recognition-request/1
tutorboard.formula-recognition-result/1
tutorboard.formula-recognition-settings/1
```

Recognition and preference contracts are independent from BoardDocument 1.1.
The selected provider never enters document history, collaboration payloads,
snapshots or exports.

## Capture and graph lifecycle

```text
transient strokes
  -> one core.objects.add command
  -> optional automatic recognition or manual expression
  -> bounded interpretation
  -> editable coordinate-plot preview
  -> one core.objects.replace command
```

The `math.handwritten-function` tool collects one active pointer and multiple
completed strokes. Bounds, duration, stroke and point limits are enforced before
recognition. Escape, tool changes and recognition failures preserve completed ink.

A graph replacement command contains exact source-stroke snapshots. One undo
restores all source strokes and one redo restores the graph.

## Provider-neutral recognizer port

```ts
interface MathInkRecognizer {
  readonly id: string;
  readonly version: string;
  recognize(
    request: MathInkRecognitionRequest,
    signal: AbortSignal,
  ): Promise<MathInkRecognitionResult>;
}
```

Application code consumes only this port. Provider absence keeps the manual
formula workflow available. Late results are rejected by recognition ID, and an
operation abort propagates through rasterization, browser fetch, client
disconnect and gateway upstream work.

## User provider selection

The Settings route exposes **Расширенные настройки доски** with three choices:

- `paddleocr` — PaddleOCR Formula Recognition, default;
- `local-ocr-llm` — local OpenAI-compatible multimodal endpoint;
- `yandex-ai-studio` — Yandex Vision OCR `math-markdown`.

The browser stores the selection under
`tutorboard.formula-recognition-settings/1`. Invalid, malformed and future values
fall back to PaddleOCR. A change affects the next recognition request; an
in-flight operation retains its original recognizer.

`ProductShell` owns a registry of recognizers and passes the selected instance to
local or synchronized workspaces. The UI reports processing location, expected
resource profile, privacy boundary and current build availability.

## Raster recognition request

Normalized strokes are rendered to a PNG before leaving the browser:

- white background;
- black round strokes;
- fixed padding;
- preserved aspect ratio;
- maximum side 768 pixels;
- PNG only;
- maximum gateway body 1 MiB;
- maximum decoded image 768 KiB.

The adapter sends only a same-origin request:

```text
POST /api/v1/formula-recognition/recognize
```

The request contains provider ID, correlation IDs, bounded PNG data and source
stroke/point counts. Provider credentials and provider-specific DTOs remain
outside the frontend bundle.

## Gateway provider adapters

### PaddleOCR

The gateway sends `{ imageBase64, mimeType }` to a configured local formula
recognition endpoint and accepts bounded `latex` or `formula` output with optional
confidence and model version. `PP-FormulaNet-S` is the latency-oriented deployment
recommendation.

### Local OCR-LLM

The gateway calls an OpenAI-compatible `POST /v1/chat/completions` endpoint with a
PNG data URL, temperature zero and a fixed instruction requesting exactly one
LaTeX expression. This supports local Ollama-compatible gateways and other local
multimodal servers.

### Yandex Cloud OCR

The gateway calls Yandex Vision OCR with:

```text
model = math-markdown
x-folder-id = configured folder
x-data-logging-enabled = false
```

Authorization uses a server-side API key or IAM token. Formula markup is extracted
from the bounded OCR response and outer Markdown/math delimiters are removed.

## Interpretation pipeline

```text
provider result
  -> bounded TutorBoard candidate
  -> native / LaTeX / JIIX conversion
  -> compile without parameters
  -> discover and validate parameter identifiers
  -> compile with parameters
  -> deterministic ranking
  -> accepted | ambiguous | rejected
```

Every provider output remains untrusted. Unsupported LaTeX, malformed groups,
unknown functions, excessive parameters and production compiler failures receive
stable diagnostics. Manual edits pass through the same interpretation pipeline.

## Reliability and load protection

The gateway provides:

- strict unknown-property rejection;
- provider-specific readiness without secret disclosure;
- 15-second provider-attempt timeout by default;
- one retry for transport failure, 429 and 502/503/504;
- capped numeric `Retry-After` handling;
- four concurrent upstream requests by default;
- 30 requests per client per minute by default;
- immediate concurrency overflow failure with no unbounded queue;
- caller-disconnect and shutdown cancellation;
- bounded success and problem responses.

Structured logs include provider, request ID, outcome, duration and status. They
exclude images, strokes, expressions, raw provider bodies, model responses and
credentials.

## Feature and deployment boundary

`VITE_FEATURE_HANDWRITTEN_FUNCTIONS` enables the canvas workflow.
`VITE_FEATURE_MATH_INK_RECOGNITION` enables automatic recognition composition.
Both flags are required for recognizer creation. The same-origin API base defaults
to `/api/v1/formula-recognition`.

`Dockerfile.math-ink-proxy` builds a pinned Node 24 non-root gateway image. The
runtime supports a read-only filesystem, dropped capabilities and
`no-new-privileges`. Nginx forwards only the exact recognition route.

`GET /healthz` reports process availability. `GET /readyz` returns the configured
provider map and succeeds when at least one provider is available. A request for
an unavailable selection returns a stable
`formula-recognition.provider-unconfigured` problem.

## Verification boundary

Public CI uses deterministic local mocks for all three providers and spends no
cloud quota. It verifies provider DTO translation, Yandex disabled-logging
headers, OpenAI-compatible image payloads, browser provider selection,
canvas-to-graph composition in Chromium and Firefox, secret exclusion, non-root
read-only runtime and strict HIGH/CRITICAL image scanning.

Live provider smoke tests belong in protected deployment environments with
explicit model, quota and billing controls.
