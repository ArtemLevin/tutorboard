// @vitest-environment node

import { once } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  formulaRecognitionRequestSchemaVersion,
  formulaRecognitionResultSchemaVersion,
  normalizeLocalOcrLlmResponse,
  normalizePaddleOcrResponse,
  normalizeYandexOcrResponse,
  stripOuterMathDelimiters,
  validateFormulaRecognitionRequest,
} from "../../services/math-ink-proxy/contract.mjs";
import { createFormulaRecognitionGatewayService } from "../../services/math-ink-proxy/service.mjs";
import { createFormulaRecognitionGatewayHttpServer } from "../../services/math-ink-proxy/server.mjs";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3wAAAABJRU5ErkJggg==";

function request(provider = "paddleocr", overrides = {}) {
  return {
    image: { data: png, height: 144, mimeType: "image/png", width: 320 },
    provider,
    recognitionId: "recognition:test",
    schemaVersion: formulaRecognitionRequestSchemaVersion,
    sessionId: "session:test",
    source: {
      normalizedHeight: 0.4,
      normalizedWidth: 1,
      pointCount: 4,
      strokeCount: 2,
    },
    ...overrides,
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });
}

function serviceOptions(overrides = {}) {
  return {
    logger: vi.fn(),
    now: () => 1_000,
    providers: {
      "local-ocr-llm": {
        allowInsecure: true,
        apiKey: "local-secret",
        apiUrl: "http://local-llm.test/v1/chat/completions",
        model: "qwen-vl-local",
      },
      paddleocr: {
        allowInsecure: true,
        apiUrl: "http://paddle.test/v1/recognize",
      },
      "yandex-ai-studio": {
        apiKey: "yandex-secret",
        folderId: "folder:test",
      },
    },
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

function providerPayload(provider) {
  switch (provider) {
    case "paddleocr":
      return { confidence: 0.98, latex: "\\(x^2+1\\)", modelVersion: "S" };
    case "local-ocr-llm":
      return {
        choices: [{ message: { content: "```latex\nx^2+1\n```" } }],
        id: "chat:1",
        model: "qwen-vl-local",
      };
    case "yandex-ai-studio":
      return {
        modelVersion: "math-markdown",
        result: { textAnnotation: { fullText: "$$x^2+1$$" } },
      };
    default:
      throw new Error("Unknown provider");
  }
}

describe("formula recognition gateway contract", () => {
  it("validates strict bounded image requests", () => {
    expect(validateFormulaRecognitionRequest(request())).toMatchObject({
      valid: true,
    });
    expect(validateFormulaRecognitionRequest(request("unknown"))).toMatchObject(
      { valid: false },
    );
    expect(
      validateFormulaRecognitionRequest(
        request("paddleocr", {
          image: { data: "?", height: 1, mimeType: "image/png", width: 1 },
        }),
      ),
    ).toMatchObject({ valid: false });
    expect(
      validateFormulaRecognitionRequest(request("paddleocr", { extra: true })),
    ).toMatchObject({ valid: false });
  });

  it("normalizes all provider response shapes to LaTeX", () => {
    expect(
      normalizePaddleOcrResponse(providerPayload("paddleocr"), "request:1"),
    ).toMatchObject({
      valid: true,
      value: {
        candidates: [{ expression: "x^2+1", format: "latex" }],
        provider: "paddleocr",
        status: "recognized",
      },
    });
    expect(
      normalizeLocalOcrLlmResponse(
        providerPayload("local-ocr-llm"),
        "request:1",
      ),
    ).toMatchObject({
      valid: true,
      value: {
        candidates: [{ expression: "x^2+1", format: "latex" }],
        provider: "local-ocr-llm",
      },
    });
    expect(
      normalizeYandexOcrResponse(
        providerPayload("yandex-ai-studio"),
        "request:1",
      ),
    ).toMatchObject({
      valid: true,
      value: {
        candidates: [{ expression: "x^2+1", format: "latex" }],
        provider: "yandex-ai-studio",
      },
    });
    expect(stripOuterMathDelimiters("\\[a+b\\]")).toBe("a+b");
  });
});

describe("formula recognition gateway service", () => {
  it.each(["paddleocr", "local-ocr-llm", "yandex-ai-studio"])(
    "dispatches and normalizes %s",
    async (provider) => {
      const fetch = vi.fn(async () => jsonResponse(providerPayload(provider)));
      const logger = vi.fn();
      const service = createFormulaRecognitionGatewayService(
        serviceOptions({ fetch, logger }),
      );

      const result = await service.recognize({
        clientKey: "client:1",
        request: request(provider),
        requestId: "recognition:test",
        signal: new AbortController().signal,
      });

      expect(result).toMatchObject({
        body: {
          candidates: [{ expression: "x^2+1", format: "latex" }],
          provider,
          schemaVersion: formulaRecognitionResultSchemaVersion,
          status: "recognized",
        },
        status: 200,
      });
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBeInstanceOf(URL);
      const body = JSON.parse(init.body);
      if (provider === "paddleocr") {
        expect(body).toMatchObject({ imageBase64: png, mimeType: "image/png" });
      }
      if (provider === "local-ocr-llm") {
        expect(body.model).toBe("qwen-vl-local");
        expect(JSON.stringify(body)).toContain("data:image/png;base64,");
        expect(init.headers.Authorization).toBe("Bearer local-secret");
      }
      if (provider === "yandex-ai-studio") {
        expect(body).toMatchObject({ model: "math-markdown", content: png });
        expect(init.headers.Authorization).toBe("Api-Key yandex-secret");
        expect(init.headers["x-data-logging-enabled"]).toBe("false");
      }
      const logged = JSON.stringify(logger.mock.calls);
      expect(logged).not.toContain(png);
      expect(logged).not.toContain("local-secret");
      expect(logged).not.toContain("yandex-secret");
    },
  );

  it("returns an explicit error for an unconfigured selected provider", async () => {
    const service = createFormulaRecognitionGatewayService(
      serviceOptions({ providers: {} }),
    );
    expect(
      await service.recognize({
        clientKey: "client:1",
        request: request("paddleocr"),
        requestId: "recognition:test",
        signal: new AbortController().signal,
      }),
    ).toMatchObject({
      body: { code: "formula-recognition.provider-unconfigured" },
      status: 503,
    });
  });

  it("retries one transient failure and keeps permanent auth failures single-shot", async () => {
    const transientFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(providerPayload("paddleocr")));
    const transientService = createFormulaRecognitionGatewayService(
      serviceOptions({ fetch: transientFetch }),
    );
    expect(
      (
        await transientService.recognize({
          clientKey: "client:1",
          request: request(),
          requestId: "recognition:test",
          signal: new AbortController().signal,
        })
      ).status,
    ).toBe(200);
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const authFetch = vi.fn(async () => jsonResponse({}, 401));
    const authService = createFormulaRecognitionGatewayService(
      serviceOptions({ fetch: authFetch }),
    );
    expect(
      await authService.recognize({
        clientKey: "client:2",
        request: request(),
        requestId: "recognition:auth",
        signal: new AbortController().signal,
      }),
    ).toMatchObject({
      body: { code: "formula-recognition.provider-authentication" },
      status: 502,
    });
    expect(authFetch).toHaveBeenCalledOnce();
  });

  it("enforces rate and concurrency limits", async () => {
    const rateService = createFormulaRecognitionGatewayService(
      serviceOptions({
        fetch: async () => jsonResponse(providerPayload("paddleocr")),
        rateLimitPerWindow: 1,
      }),
    );
    const input = {
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:test",
      signal: new AbortController().signal,
    };
    expect((await rateService.recognize(input)).status).toBe(200);
    expect(await rateService.recognize(input)).toMatchObject({
      body: { code: "formula-recognition.rate-limited" },
      status: 429,
    });

    let release;
    const fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(jsonResponse(providerPayload("paddleocr")));
        }),
    );
    const concurrencyService = createFormulaRecognitionGatewayService(
      serviceOptions({ fetch, maximumConcurrentRequests: 1 }),
    );
    const first = concurrencyService.recognize({
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:first",
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      await concurrencyService.recognize({
        clientKey: "client:2",
        request: request("paddleocr", {
          recognitionId: "recognition:second",
        }),
        requestId: "recognition:second",
        signal: new AbortController().signal,
      }),
    ).toMatchObject({
      body: { code: "formula-recognition.gateway-busy" },
      status: 503,
    });
    release();
    expect((await first).status).toBe(200);
  });
});

describe("formula recognition gateway HTTP server", () => {
  it("reports provider readiness and preserves request correlation", async () => {
    const service = {
      configuredProviders: {
        "local-ocr-llm": false,
        paddleocr: true,
        "yandex-ai-studio": false,
      },
      recognize: vi.fn(async ({ requestId }) => ({
        body: {
          candidates: [],
          diagnostics: [],
          provider: "paddleocr",
          providerRequestId: null,
          providerVersion: "test",
          requestId,
          schemaVersion: formulaRecognitionResultSchemaVersion,
          status: "unrecognized",
        },
        status: 200,
      })),
    };
    const server = createFormulaRecognitionGatewayHttpServer({ service });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test server has no TCP address.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const readiness = await fetch(`${baseUrl}/readyz`);
      expect(readiness.status).toBe(200);
      expect(await readiness.json()).toMatchObject({
        providers: { paddleocr: true },
        status: "ready",
      });

      const recognized = await fetch(`${baseUrl}/v1/recognize`, {
        body: JSON.stringify(request()),
        headers: {
          "Content-Type": "application/json",
          "X-TutorBoard-Request-Id": "recognition:test",
        },
        method: "POST",
      });
      expect(recognized.status).toBe(200);
      expect(recognized.headers.get("x-tutorboard-request-id")).toBe(
        "recognition:test",
      );
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
