import { describe, expect, it, vi } from "vitest";

import {
  mathInkRecognitionRequestSchemaVersion,
  type MathInkRecognitionProvider,
  type MathInkRecognitionRequest,
} from "../../modules/handwritten-function/public";
import { createMathInkHttpRecognizer, mathInkRequestIdHeader } from "./public";
import { formulaRecognitionResultSchemaVersion } from "./validation";

const request: MathInkRecognitionRequest = {
  normalization: { originX: 10, originY: 20, scale: 100 },
  normalizedHeight: 0.5,
  normalizedWidth: 1,
  recognitionId: "recognition:test",
  schemaVersion: mathInkRecognitionRequestSchemaVersion,
  sessionId: "session:test",
  sourceBounds: {
    height: 50,
    maxX: 110,
    maxY: 70,
    minX: 10,
    minY: 20,
    width: 100,
  },
  strokes: [
    {
      id: "stroke:1",
      points: [
        { timeMs: 0, x: 0, y: 0 },
        { timeMs: 10, x: 1, y: 0.5 },
      ],
    },
  ],
};

const rasterize = vi.fn().mockResolvedValue({
  data: "iVBORw0KGgo=",
  height: 200,
  mimeType: "image/png" as const,
  width: 400,
});

function resultResponse(
  provider: MathInkRecognitionProvider,
  overrides: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ confidence: 0.98, expression: "x^2", format: "latex" }],
      diagnostics: [],
      provider,
      providerRequestId: "provider:1",
      providerVersion: "2026.08",
      requestId: request.recognitionId,
      schemaVersion: formulaRecognitionResultSchemaVersion,
      status: "recognized",
      ...overrides,
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );
}

function recognizerOptions(
  provider: MathInkRecognitionProvider,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return {
    baseUrl: "/api/v1/formula-recognition",
    fetch,
    origin: "https://board.example",
    provider,
    rasterize,
  } as const;
}

describe("formula recognition HTTP adapter", () => {
  it.each(["paddleocr", "local-ocr-llm", "yandex-ai-studio"] as const)(
    "sends a bounded raster request for %s",
    async (provider) => {
      let capturedInput: RequestInfo | URL | undefined;
      let capturedInit: RequestInit | undefined;
      const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        capturedInput = input;
        capturedInit = init;
        return Promise.resolve(resultResponse(provider));
      });
      const recognizer = createMathInkHttpRecognizer(
        recognizerOptions(provider, fetch),
      );

      const result = await recognizer.recognize(
        request,
        new AbortController().signal,
      );

      expect(capturedInput).toBeInstanceOf(URL);
      if (!(capturedInput instanceof URL)) {
        throw new Error("Expected the adapter to call fetch with a URL.");
      }
      expect(capturedInput.href).toBe(
        "https://board.example/api/v1/formula-recognition/recognize",
      );
      expect(capturedInit?.headers).toMatchObject({
        "Content-Type": "application/json",
        [mathInkRequestIdHeader]: request.recognitionId,
      });
      const capturedBody = capturedInit?.body;
      expect(typeof capturedBody).toBe("string");
      if (typeof capturedBody !== "string") {
        throw new Error("Expected the adapter request body to be JSON text.");
      }
      expect(JSON.parse(capturedBody)).toEqual({
        image: {
          data: "iVBORw0KGgo=",
          height: 200,
          mimeType: "image/png",
          width: 400,
        },
        provider,
        recognitionId: request.recognitionId,
        schemaVersion: "tutorboard.formula-recognition-request/1",
        sessionId: request.sessionId,
        source: {
          normalizedHeight: 0.5,
          normalizedWidth: 1,
          pointCount: 2,
          strokeCount: 1,
        },
      });
      expect(result).toMatchObject({
        candidates: [{ confidence: 0.98, expression: "x^2", format: "latex" }],
        recognizerId: `${provider}.via-tutorboard-gateway`,
        status: "recognized",
      });
    },
  );

  it("rejects cross-origin and credential-bearing base URLs", () => {
    expect(() =>
      createMathInkHttpRecognizer({
        ...recognizerOptions("paddleocr", vi.fn()),
        baseUrl: "https://ocr.example/v1",
      }),
    ).toThrow(/same-origin/u);
    expect(() =>
      createMathInkHttpRecognizer({
        ...recognizerOptions("paddleocr", vi.fn()),
        baseUrl: "https://user:pass@board.example/api",
      }),
    ).toThrow(/same-origin/u);
  });

  it("maps gateway problems to typed errors", async () => {
    const recognizer = createMathInkHttpRecognizer(
      recognizerOptions("paddleocr", () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "formula-recognition.gateway-busy",
              detail: "busy",
              requestId: request.recognitionId,
              retryable: true,
              status: 503,
              title: "Gateway busy",
              type: "https://tutorboard.local/problems/formula-recognition.gateway-busy",
            }),
            {
              headers: { "Content-Type": "application/problem+json" },
              status: 503,
            },
          ),
        ),
      ),
    );

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "formula-recognition.gateway-busy",
      retryable: true,
    });
  });

  it("rejects request ID and provider mismatches", async () => {
    const requestIdMismatch = createMathInkHttpRecognizer(
      recognizerOptions("paddleocr", () =>
        Promise.resolve(
          resultResponse("paddleocr", { requestId: "recognition:other" }),
        ),
      ),
    );
    const providerMismatch = createMathInkHttpRecognizer(
      recognizerOptions("paddleocr", () =>
        Promise.resolve(resultResponse("local-ocr-llm")),
      ),
    );

    await expect(
      requestIdMismatch.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "formula-recognition.response-schema-mismatch",
    });
    await expect(
      providerMismatch.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "formula-recognition.response-schema-mismatch",
    });
  });

  it("preserves caller abort semantics", async () => {
    const recognizer = createMathInkHttpRecognizer(
      recognizerOptions(
        "local-ocr-llm",
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();
    const operation = recognizer.recognize(request, controller.signal);
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns adapter deadlines into retryable timeout errors", async () => {
    const recognizer = createMathInkHttpRecognizer({
      ...recognizerOptions(
        "yandex-ai-studio",
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
      timeoutMs: 1,
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "formula-recognition.timeout",
      retryable: true,
    });
  });

  it("rejects oversized declared responses before parsing", async () => {
    const recognizer = createMathInkHttpRecognizer({
      ...recognizerOptions("paddleocr", () =>
        Promise.resolve(
          new Response("{}", {
            headers: {
              "Content-Length": "1000",
              "Content-Type": "application/json",
            },
            status: 200,
          }),
        ),
      ),
      maximumResponseBytes: 64,
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "formula-recognition.response-too-large",
    });
  });
});
