// @vitest-environment node

import { once } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  createMathpixStrokeRequest,
  mathInkProxyResultSchemaVersion,
  mathInkRequestSchemaVersion,
  normalizeMathpixResponse,
  stripOuterMathDelimiters,
  validateMathInkRequest,
} from "../../services/math-ink-proxy/contract.mjs";
import {
  createMathInkProxyService,
  createUnconfiguredMathInkProxyService,
} from "../../services/math-ink-proxy/service.mjs";
import { createMathInkProxyHttpServer } from "../../services/math-ink-proxy/server.mjs";

function request(overrides = {}) {
  return {
    normalization: { originX: 10, originY: 20, scale: 100 },
    normalizedHeight: 0.5,
    normalizedWidth: 1,
    recognitionId: "recognition:test",
    schemaVersion: mathInkRequestSchemaVersion,
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
    ...overrides,
  };
}

function providerResponse(overrides = {}, status = 200) {
  return new Response(
    JSON.stringify({
      confidence: 0.97,
      latex_styled: "\\( x^2 \\)",
      request_id: "mathpix:request",
      version: "2026.08",
      ...overrides,
    }),
    { headers: { "Content-Type": "application/json" }, status },
  );
}

function serviceOptions(overrides = {}) {
  return {
    allowInsecureUpstream: true,
    apiUrl: "http://mathpix.test/v3/strokes",
    appId: "app-id-secret",
    appKey: "app-key-secret",
    logger: vi.fn(),
    now: () => 1_000,
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("math ink proxy contract", () => {
  it("validates bounded TutorBoard requests", () => {
    expect(validateMathInkRequest(request())).toMatchObject({ valid: true });
    expect(
      validateMathInkRequest(request({ unexpected: true })),
    ).toMatchObject({ valid: false });
    expect(
      validateMathInkRequest(
        request({
          strokes: [
            {
              id: "stroke:1",
              points: [
                { timeMs: 10, x: 0, y: 0 },
                { timeMs: 5, x: 1, y: 1 },
              ],
            },
          ],
        }),
      ),
    ).toMatchObject({ valid: false });
  });

  it("translates normalized strokes into Mathpix coordinate arrays", () => {
    expect(createMathpixStrokeRequest(request())).toEqual({
      formats: ["latex_styled", "text"],
      metadata: {
        improve_mathpix: false,
        tutorboard_request_id: "recognition:test",
      },
      strokes: {
        strokes: {
          x: [[0, 10_000]],
          y: [[0, 5_000]],
        },
      },
    });
  });

  it("strips only matching outer math delimiters", () => {
    expect(stripOuterMathDelimiters("\\( x^2 \\)")).toBe("x^2");
    expect(stripOuterMathDelimiters("\\[ a*x+b \\]")).toBe("a*x+b");
    expect(stripOuterMathDelimiters("x + \\(y\\)")).toBe("x + \\(y\\)");
  });

  it("normalizes recognized and unrecognized provider responses", () => {
    expect(
      normalizeMathpixResponse(
        {
          confidence: 0.9,
          latex_styled: "\\(x^2\\)",
          request_id: "provider:1",
          version: "v1",
        },
        "recognition:test",
      ),
    ).toEqual({
      valid: true,
      value: {
        candidates: [
          { confidence: 0.9, expression: "x^2", format: "latex" },
        ],
        diagnostics: [],
        provider: "mathpix",
        providerRequestId: "provider:1",
        providerVersion: "v1",
        requestId: "recognition:test",
        schemaVersion: mathInkProxyResultSchemaVersion,
        status: "recognized",
      },
    });
    expect(
      normalizeMathpixResponse(
        { request_id: "provider:2", version: "v1" },
        "recognition:test",
      ),
    ).toMatchObject({
      valid: true,
      value: { candidates: [], status: "unrecognized" },
    });
  });
});

describe("math ink proxy service", () => {
  it("keeps credentials in upstream headers and returns a bounded DTO", async () => {
    const fetch = vi.fn(async () => providerResponse());
    const logger = vi.fn();
    const service = createMathInkProxyService(
      serviceOptions({ fetch, logger }),
    );

    const result = await service.recognize({
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:test",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      body: {
        candidates: [{ expression: "x^2", format: "latex" }],
        provider: "mathpix",
        status: "recognized",
      },
      status: 200,
    });
    const [_url, init] = fetch.mock.calls[0];
    expect(init.headers).toMatchObject({
      app_id: "app-id-secret",
      app_key: "app-key-secret",
    });
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain("app-id-secret");
    expect(logged).not.toContain("app-key-secret");
    expect(logged).not.toContain("stroke:1");
  });

  it("retries one transient provider failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(providerResponse({}, 503))
      .mockResolvedValueOnce(providerResponse());
    const sleep = vi.fn(async () => undefined);
    const service = createMathInkProxyService(
      serviceOptions({ fetch, sleep }),
    );

    const result = await service.recognize({
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:test",
      signal: new AbortController().signal,
    });

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("does not retry permanent authentication failures", async () => {
    const fetch = vi.fn(async () => providerResponse({}, 401));
    const service = createMathInkProxyService(serviceOptions({ fetch }));

    const result = await service.recognize({
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:test",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      body: { code: "math-ink.provider-authentication" },
      status: 502,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("enforces per-client rate limits", async () => {
    const service = createMathInkProxyService(
      serviceOptions({
        fetch: async () => providerResponse(),
        rateLimitPerWindow: 1,
      }),
    );
    const input = {
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:test",
      signal: new AbortController().signal,
    };

    expect((await service.recognize(input)).status).toBe(200);
    expect(await service.recognize(input)).toMatchObject({
      body: { code: "math-ink.rate-limited" },
      status: 429,
    });
  });

  it("rejects work above the concurrency limit without queuing", async () => {
    let release;
    const fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(providerResponse());
        }),
    );
    const service = createMathInkProxyService(
      serviceOptions({ fetch, maximumConcurrentRequests: 1 }),
    );
    const first = service.recognize({
      clientKey: "client:1",
      request: request(),
      requestId: "recognition:first",
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    const second = await service.recognize({
      clientKey: "client:2",
      request: request({ recognitionId: "recognition:second" }),
      requestId: "recognition:second",
      signal: new AbortController().signal,
    });
    expect(second).toMatchObject({
      body: { code: "math-ink.proxy-busy" },
      status: 503,
    });
    release();
    expect((await first).status).toBe(200);
  });

  it("fails closed when credentials are absent", async () => {
    const service = createUnconfiguredMathInkProxyService();
    expect(
      await service.recognize({ requestId: "recognition:test" }),
    ).toMatchObject({
      body: { code: "math-ink.proxy-unconfigured" },
      status: 503,
    });
  });
});

describe("math ink proxy HTTP server", () => {
  it("serves health and recognition contracts", async () => {
    const service = {
      recognize: vi.fn(async ({ requestId }) => ({
        body: {
          candidates: [],
          diagnostics: [],
          provider: "mathpix",
          providerRequestId: null,
          providerVersion: "test",
          requestId,
          schemaVersion: mathInkProxyResultSchemaVersion,
          status: "unrecognized",
        },
        status: 200,
      })),
    };
    const server = createMathInkProxyHttpServer({ configured: true, service });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test server has no TCP address.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const health = await fetch(`${baseUrl}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });

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
      expect(await recognized.json()).toMatchObject({
        requestId: "recognition:test",
        status: "unrecognized",
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
