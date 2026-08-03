# ADR-027 — Configurable formula-recognition gateway

## Status

Accepted for handwritten-function PR 5. Supersedes the provider-specific portion of ADR-026.

## Context

TutorBoard already captures bounded digital ink, interprets LaTeX candidates and creates editable coordinate plots. PR 4 connected that feature port to one remote provider. The board must support privacy-sensitive local processing, a configurable local vision-language model and Yandex Cloud OCR while allowing the user to choose the method in advanced settings.

The three providers consume raster images rather than the same digital-ink DTO. Provider credentials and endpoints require server-side policy. User preference belongs to browser configuration and must remain outside the collaborative board document.

## Decision

- Keep `MathInkRecognizer` as the application feature port.
- Rasterize normalized strokes deterministically to a bounded PNG in the browser adapter.
- Send the selected provider identifier and PNG to a same-origin TutorBoard gateway.
- Support `paddleocr`, `local-ocr-llm` and `yandex-ai-studio` provider identifiers.
- Use PaddleOCR Formula Recognition as the default user preference.
- Store the preference under the versioned local key `tutorboard.formula-recognition-settings/1`.
- Keep preference data outside `BoardDocument`, commands, collaboration, persistence exports and snapshots.
- Implement local OCR-LLM through an OpenAI-compatible multimodal chat-completions endpoint.
- Implement Yandex recognition through Vision OCR `math-markdown` with data logging disabled.
- Keep provider URLs, credentials, model selection, retries, rate limits and concurrency inside the gateway.
- Return one bounded TutorBoard-owned result contract for every provider.
- Preserve manual correction and graph confirmation for unavailable or uncertain recognition results.

## Consequences

Provider choice changes immediately for the next recognition operation. Existing capture, interpretation and graph creation code remains provider-neutral.

The gateway may expose several configured providers at once. Each deployment can enable only the providers it operates. Browser bundles contain no provider secrets.

OCR quality and latency differ by deployment hardware and model choice. The settings UI communicates processing location and expected profile without promising a fixed accuracy level.
