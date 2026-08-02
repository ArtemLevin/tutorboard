import { describe, expect, it, vi } from "vitest";

import {
  mathInkRecognitionRequestSchemaVersion,
  type MathInkRecognitionRequest,
} from "../../modules/handwritten-function/public";
import { createMathInkHttpRecognizer, mathInkRequestIdHeader } from "./public";
import { mathInkProxyResultSchemaVersion } from "./validation";

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

function resultResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ confidence: 0.98, expression: "x^2", format: "latex" }],
      diagnostics: [],
      provider: "mathpix",
      providerRequestId: "provider:1",
      providerVersion: "2026.08",
      requestId: request.recognitionId,
      schemaVersion: mathInkProxyResultSchemaVersion,
      status: "recognized",
      ...overrides,
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );
}

describe("math ink HTTP recognizer", () => {
  it("sends the provider-neutral request to the same-origin proxy", async () => {
    let capturedInput: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      capturedInput = input;
      capturedInit = init;
      return Promise.resolve(resultResponse());
    });
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch,
      origin: "https://board.example",
    });

    const result = await recognizer.recognize(
      request,
      new AbortController().signal,
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(capturedInput).toBeInstanceOf(URL);
    if (!(capturedInput instanceof URL)) {
      throw new Error("Expected the adapter to call fetch with a URL.");
    }
    expect(capturedInput.href).toBe(
      "https://board.example/api/v1/math-ink/recognize",
    );
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toMatchObject({
      "Content-Type": "application/json",
      [mathInkRequestIdHeader]: request.recognitionId,
    });
    const capturedBody = capturedInit?.body;
    expect(typeof capturedBody).toBe("string");
    if (typeof capturedBody !== "string") {
      throw new Error("Expected the adapter request body to be JSON text.");
    }
    expect(JSON.parse(capturedBody)).toEqual(request);
    expect(result).toMatchObject({
      candidates: [{ confidence: 0.98, expression: "x^2", format: "latex" }],
      recognizerId: "mathpix.strokes.via-tutorboard-proxy",
      status: "recognized",
    });
  });

  it("rejects cross-origin and credential-bearing base URLs", () => {
    expect(() =>
      createMathInkHttpRecognizer({
        baseUrl: "https://api.mathpix.com/v3/strokes",
        fetch: vi.fn(),
        origin: "https://board.example",
      }),
    ).toThrow(/same-origin/u);
    expect(() =>
      createMathInkHttpRecognizer({
        baseUrl: "https://user:pass@board.example/api",
        fetch: vi.fn(),
        origin: "https://board.example",
      }),
    ).toThrow(/same-origin/u);
  });

  it("maps bounded proxy problems to typed errors", async () => {
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "math-ink.proxy-busy",
              detail: "busy",
              requestId: request.recognitionId,
              retryable: true,
              status: 503,
              title: "Proxy busy",
              type: "https://tutorboard.local/problems/math-ink.proxy-busy",
            }),
            {
              headers: { "Content-Type": "application/problem+json" },
              status: 503,
            },
          ),
        ),
      origin: "https://board.example",
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "math-ink.proxy-busy",
      retryable: true,
    });
  });

  it("rejects response request ID mismatches", async () => {
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch: () =>
        Promise.resolve(resultResponse({ requestId: "recognition:other" })),
      origin: "https://board.example",
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: "math-ink.response-schema-mismatch" });
  });

  it("preserves caller abort semantics", async () => {
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      origin: "https://board.example",
    });
    const controller = new AbortController();
    const operation = recognizer.recognize(request, controller.signal);
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns adapter deadlines into retryable timeout errors", async () => {
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      origin: "https://board.example",
      timeoutMs: 1,
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: "math-ink.timeout", retryable: true });
  });

  it("rejects oversized declared responses before parsing", async () => {
    const recognizer = createMathInkHttpRecognizer({
      baseUrl: "/api/v1/math-ink",
      fetch: () =>
        Promise.resolve(
          new Response("{}", {
            headers: {
              "Content-Length": "1000",
              "Content-Type": "application/json",
            },
            status: 200,
          }),
        ),
      maximumResponseBytes: 64,
      origin: "https://board.example",
    });

    await expect(
      recognizer.recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: "math-ink.response-too-large" });
  });
});
