from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]

eslint_path = root / "eslint.config.js"
eslint = eslint_path.read_text(encoding="utf-8")
needle = '      "dist",\n'
replacement = '      "dist",\n      "src/adapters/geometryos-http/generated",\n'
if replacement not in eslint:
    if needle not in eslint:
        raise RuntimeError("ESLint ignore list was not found")
    eslint = eslint.replace(needle, replacement, 1)
eslint_path.write_text(eslint, encoding="utf-8")

tsconfig_path = root / "tsconfig.app.json"
tsconfig = json.loads(tsconfig_path.read_text(encoding="utf-8"))
tsconfig["include"] = [item for item in tsconfig["include"] if item != "tests/contracts"]
tsconfig_path.write_text(json.dumps(tsconfig, indent=2) + "\n", encoding="utf-8")

contract_ts = root / "tests/contracts/geometryos-contract.test.ts"
if contract_ts.exists():
    contract_ts.unlink()
contract_mjs = root / "tests/contracts/geometryos-contract.test.mjs"
contract_mjs.write_text(
    '''// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { geometryOsContractMetadata } from "../../src/adapters/geometryos-http/public.ts";
import {
  validateGenerateRequest,
  validateGenerateResponse,
  validateProblemDetail,
} from "../../src/adapters/geometryos-http/validation.ts";

const root = path.resolve(process.cwd(), "contracts/geometryos");

function json(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function collectJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJsonFiles(value);
    }
    return entry.name.endsWith(".json") ? [value] : [];
  });
}

function visit(value, callback) {
  callback(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, callback);
    }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      visit(item, callback);
    }
  }
}

describe("pinned GeometryOS contract", () => {
  it("matches the approved artifact hashes and metadata", () => {
    const manifest = json(path.join(root, "contract-manifest.json"));
    expect(sha256(path.join(root, "openapi.v1.json"))).toBe(
      manifest.openApiSha256,
    );
    expect(sha256(path.join(root, "gir.schema.v0.2.json"))).toBe(
      manifest.girSchemaSha256,
    );
    expect(sha256(path.join(root, "fixtures/manifest.json"))).toBe(
      manifest.fixtureManifestSha256,
    );
    expect(geometryOsContractMetadata).toMatchObject({
      sourceCommit: manifest.sourceCommit,
      openApiVersion: "1.0.0",
      apiMajor: "v1",
      girSchemaVersion: "0.2.0",
      consumerContract: "tutorboard/v1",
    });
  });

  it("validates producer consumer fixtures through generated validators", () => {
    const counts = { request: 0, response: 0, problem: 0 };
    for (const filePath of collectJsonFiles(path.join(root, "fixtures"))) {
      if (filePath.endsWith(`${path.sep}manifest.json`)) {
        continue;
      }
      visit(json(filePath), (candidate) => {
        if (candidate === null || typeof candidate !== "object") {
          return;
        }
        if (
          candidate.input_type === "text" &&
          typeof candidate.input === "string" &&
          validateGenerateRequest(candidate).valid
        ) {
          counts.request += 1;
        }
        if (
          ["success", "needs_clarification", "error"].includes(
            String(candidate.status),
          ) &&
          validateGenerateResponse(candidate).valid
        ) {
          counts.response += 1;
        }
        if (
          typeof candidate.status === "number" &&
          typeof candidate.request_id === "string" &&
          typeof candidate.code === "string" &&
          validateProblemDetail(candidate).valid
        ) {
          counts.problem += 1;
        }
      });
    }
    expect(counts.request).toBeGreaterThan(0);
    expect(counts.response).toBeGreaterThan(0);
    expect(counts.problem).toBeGreaterThan(0);
  });
});
''',
    encoding="utf-8",
)

unit_path = root / "tests/unit/adapters/geometryos-http/client.test.ts"
unit_path.write_text(
    '''import { describe, expect, it, vi } from "vitest";

import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import { geometryOsRequestId } from "../../../../src/core/public";

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
    { code: "unsupported_construction", message: "Construction is unsupported." },
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
    maxResponseBytes: overrides.limit ?? 1024 * 1024,
  });
}

function resolvedFetch(body: unknown): typeof globalThis.fetch {
  return () => Promise.resolve(response(body));
}

describe("GeometryOS HTTP client", () => {
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
    expect(String(url)).toBe("https://geometry.example.test/api/v1/generate");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Request-ID")).toBe(requestId);
    expect(JSON.parse(String(init?.body))).toEqual({
      input_type: "text",
      input: "Построй треугольник ABC",
      mode: "strict",
    });
    expect(result).toMatchObject({ kind: "success", requestId });
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
      client(resolvedFetch(clarification)).startGenerate({ prompt: "x" }).result,
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
      client(resolvedFetch(success), { limit: 16 }).startGenerate({ prompt: "x" })
        .result,
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
      if (init?.signal !== undefined) {
        calls.push(init.signal);
      }
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        if (calls.length === 2) {
          resolve(response(success, { responseRequestId: "tutorboard-concurrent-2" }));
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
''',
    encoding="utf-8",
)

print("Separated generated output and Node fixture tests from browser TypeScript linting.")
