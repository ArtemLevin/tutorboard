import { describe, expect, it, vi } from "vitest";

import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import {
  geometryOsRequestId,
  type JsonValue,
} from "../../../../src/core/public";
import layoutInvalidRequestJson from "../../../../contracts/geometryos/fixtures/layout-invalid.request.json?raw";
import layoutInvalidJson from "../../../../contracts/geometryos/fixtures/layout-invalid.response.json?raw";
import layoutSuccessRequestJson from "../../../../contracts/geometryos/fixtures/layout-success.request.json?raw";
import layoutSuccessJson from "../../../../contracts/geometryos/fixtures/layout-success.response.json?raw";
import layoutUnsupportedRequestJson from "../../../../contracts/geometryos/fixtures/layout-unsupported.request.json?raw";
import layoutUnsupportedJson from "../../../../contracts/geometryos/fixtures/layout-unsupported.response.json?raw";

const requestId = geometryOsRequestId("tutorboard-test-request");
const canonicalGir = {
  schema_version: "0.2.0",
  scene_type: "2d",
  objects: [],
  constraints: [],
  construction_steps: [],
  metadata: {},
};
const success = {
  status: "success",
  confidence: 0.98,
  gir: canonicalGir,
  validation_report: { is_valid: true, issues: [], warnings: [] },
  warnings: [],
  ambiguities: [],
  explanation: null,
  svg: null,
  tikz: null,
  schema_version: "0.2.0",
};
const domainError = {
  status: "error",
  confidence: 0,
  warnings: [
    {
      code: "unsupported_construction",
      message: "Construction is unsupported.",
    },
  ],
  ambiguities: [],
  explanation: "No supported construction matched the input.",
  gir: null,
  validation_report: null,
  svg: null,
  tikz: null,
  schema_version: "0.2.0",
};
const problem = {
  type: "urn:geometryos:problem:request-validation",
  title: "Request validation failed",
  status: 422,
  detail: "The request payload does not satisfy the API contract.",
  instance: "/api/v1/generate",
  code: "request_validation_failed",
  request_id: requestId,
  errors: [],
};
const layoutSuccessRequest = JSON.parse(layoutSuccessRequestJson) as JsonValue;
const layoutUnsupportedRequest = JSON.parse(
  layoutUnsupportedRequestJson,
) as JsonValue;
const layoutInvalidRequest = JSON.parse(layoutInvalidRequestJson) as JsonValue;
const layoutSuccess = JSON.parse(layoutSuccessJson) as unknown;
const layoutUnsupported = JSON.parse(layoutUnsupportedJson) as unknown;
const layoutInvalid = JSON.parse(layoutInvalidJson) as unknown;

function response(
  body: unknown,
  options: {
    readonly status?: number;
    readonly contentType?: string;
    readonly responseRequestId?: string;
  } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      "X-Request-ID": options.responseRequestId ?? requestId,
    },
  });
}

function client(
  fetchImplementation: typeof globalThis.fetch,
  overrides: { readonly timeout?: number; readonly limit?: number } = {},
) {
  return createGeometryOsHttpClient({
    baseUrl: "https://geometry.example.test/",
    createRequestId: () => requestId,
    fetch: fetchImplementation,
    generateTimeoutMs: overrides.timeout ?? 1000,
    layoutTimeoutMs: overrides.timeout ?? 1000,
    maxResponseBytes: overrides.limit ?? 1024 * 1024,
    readinessTimeoutMs: overrides.timeout ?? 1000,
  });
}

function resolvedFetch(body: unknown): typeof globalThis.fetch {
  return () => Promise.resolve(response(body));
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe("GeometryOS HTTP client", () => {
  it("checks readiness with correlation and keeps not-ready typed", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        response(
          {
            checks: [
              { name: "lifecycle", status: "pass" },
              { name: "executor", status: "pass" },
            ],
            status: "ready",
          },
          { responseRequestId: requestId },
        ),
      ),
    );
    const result = await client(fetchMock).startReadiness().result;
    expect(result).toMatchObject({ kind: "ready", requestId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected one GeometryOS readiness request.");
    }
    expect(requestUrl(call[0])).toBe("https://geometry.example.test/ready");
    expect(call[1]?.method).toBe("GET");

    await expect(
      client(() =>
        Promise.resolve(
          response(
            {
              checks: [{ name: "executor", status: "fail" }],
              status: "not_ready",
            },
            { status: 503 },
          ),
        ),
      ).startReadiness().result,
    ).resolves.toMatchObject({ kind: "not-ready", retryable: true });
  });

  it("sends the pinned generate request once and normalizes success", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(resolvedFetch(success));
    const task = client(fetchMock).startGenerate({
      prompt: "Построй треугольник ABC",
    });
    const result = await task.result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected one GeometryOS request.");
    }
    const [url, init] = call;
    const requestedUrl =
      typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    expect(requestedUrl).toBe("https://geometry.example.test/api/v1/generate");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Request-ID")).toBe(requestId);
    if (typeof init?.body !== "string") {
      throw new TypeError("Expected a JSON string request body.");
    }
    expect(JSON.parse(init.body)).toEqual({
      input_type: "text",
      input: "Построй треугольник ABC",
      mode: "strict",
    });
    expect(result).toMatchObject({ kind: "success", requestId });
  });

  it("sends canonical GIR to layout and normalizes the versioned document", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      resolvedFetch(layoutSuccess),
    );
    const task = client(fetchMock).startLayout({
      canonicalGir: layoutSuccessRequest,
    });
    const result = await task.result;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected one GeometryOS layout request.");
    }
    const [url, init] = call;
    const requestedUrl =
      typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    expect(requestedUrl).toBe("https://geometry.example.test/api/v1/layout");
    if (typeof init?.body !== "string") {
      throw new TypeError("Expected a JSON string layout request body.");
    }
    expect(JSON.parse(init.body)).toEqual(layoutSuccessRequest);
    expect(result).toMatchObject({
      kind: "success",
      requestId,
      layoutDocument: {
        schemaVersion: "0.1.0",
        sourceGirSchemaVersion: "0.2.0",
        points: { A: { x: 120, y: 40 } },
      },
    });
  });

  it("keeps unsupported and invalid layout outcomes typed", async () => {
    const unsupportedResult = await client(
      resolvedFetch(layoutUnsupported),
    ).startLayout({
      canonicalGir: layoutUnsupportedRequest,
    }).result;
    expect(unsupportedResult.kind).toBe("unsupported");
    if (unsupportedResult.kind === "unsupported") {
      expect(
        unsupportedResult.diagnostics.some(
          (item) => item.code === "layout_requires_triangle",
        ),
      ).toBe(true);
    }

    await expect(
      client(resolvedFetch(layoutInvalid)).startLayout({
        canonicalGir: layoutInvalidRequest,
      }).result,
    ).resolves.toMatchObject({
      kind: "invalid-scene",
      failureStage: "draft_validation",
    });
  });

  it("rejects invalid layout GIR before network access", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    await expect(
      client(fetchMock).startLayout({
        canonicalGir: { schema_version: "0.3.0" },
      }).result,
    ).resolves.toMatchObject({
      kind: "invalid-request",
      code: "geometryos.layout-request-invalid",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps clarification separate from failures", async () => {
    const clarification = {
      status: "needs_clarification",
      confidence: 0.4,
      ambiguities: [
        { code: "ambiguous", message: "Choose", options: ["A", "B"] },
      ],
      warnings: [],
      explanation: null,
      gir: null,
      svg: null,
      tikz: null,
      validation_report: null,
      schema_version: "0.2.0",
    };
    await expect(
      client(resolvedFetch(clarification)).startGenerate({ prompt: "x" })
        .result,
    ).resolves.toMatchObject({ kind: "needs-clarification" });
  });

  it("keeps domain errors separate from Problem Details", async () => {
    await expect(
      client(resolvedFetch(domainError)).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "domain-error" });

    const problemFetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        response(problem, {
          status: 422,
          contentType: "application/problem+json",
        }),
      );
    await expect(
      client(problemFetch).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({
      kind: "problem",
      httpStatus: 422,
      retryable: false,
    });
  });

  it("rejects invalid content, JSON, request IDs and GIR versions", async () => {
    const wrongTypeFetch: typeof globalThis.fetch = () =>
      Promise.resolve(response(success, { contentType: "text/html" }));
    await expect(
      client(wrongTypeFetch).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.wrong-content-type",
    });

    const invalidJsonFetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response("{", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
        }),
      );
    await expect(
      client(invalidJsonFetch).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.invalid-json",
    });

    const wrongIdFetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        response(success, { responseRequestId: "tutorboard-other" }),
      );
    await expect(
      client(wrongIdFetch).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.request-id-mismatch",
    });

    const incompatible = structuredClone(success);
    incompatible.gir.schema_version = "0.3.0";
    await expect(
      client(resolvedFetch(incompatible)).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.unsupported-gir-version",
    });
  });

  it("bounds response bodies before parsing", async () => {
    await expect(
      client(resolvedFetch(success), { limit: 16 }).startGenerate({
        prompt: "x",
      }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.response-too-large",
    });
  });

  it("distinguishes timeout from caller cancellation", async () => {
    vi.useFakeTimers();
    const hangingFetch: typeof globalThis.fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const timeoutTask = client(hangingFetch, { timeout: 10 }).startGenerate({
      prompt: "x",
    });
    await vi.advanceTimersByTimeAsync(11);
    await expect(timeoutTask.result).resolves.toMatchObject({
      kind: "transport-failure",
      code: "geometryos.timeout",
    });

    const cancelledTask = client(hangingFetch, { timeout: 100 }).startGenerate({
      prompt: "x",
    });
    cancelledTask.cancel();
    await expect(cancelledTask.result).resolves.toMatchObject({
      kind: "cancelled",
    });
    vi.useRealTimers();
  });

  it("does not retry and isolates concurrent cancellation", async () => {
    const calls: AbortSignal[] = [];
    const fetchImplementation: typeof globalThis.fetch = (_input, init) => {
      if (init?.signal != null) {
        calls.push(init.signal);
      }
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        if (calls.length === 2) {
          resolve(
            response(success, { responseRequestId: "tutorboard-concurrent-2" }),
          );
        }
      });
    };
    let sequence = 0;
    const concurrentClient = createGeometryOsHttpClient({
      baseUrl: "https://geometry.example.test",
      createRequestId: () =>
        geometryOsRequestId(`tutorboard-concurrent-${++sequence}`),
      fetch: fetchImplementation,
      generateTimeoutMs: 1000,
    });
    const first = concurrentClient.startGenerate({ prompt: "first" });
    const second = concurrentClient.startGenerate({ prompt: "second" });
    first.cancel();
    await expect(first.result).resolves.toMatchObject({ kind: "cancelled" });
    await expect(second.result).resolves.toMatchObject({ kind: "success" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it("rejects invalid prompts before network access", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    await expect(
      client(fetchMock).startGenerate({ prompt: "" }).result,
    ).resolves.toMatchObject({
      kind: "invalid-request",
      code: "geometryos.prompt-empty",
    });
    await expect(
      client(fetchMock).startGenerate({ prompt: "x".repeat(20_001) }).result,
    ).resolves.toMatchObject({
      kind: "invalid-request",
      code: "geometryos.prompt-too-long",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
