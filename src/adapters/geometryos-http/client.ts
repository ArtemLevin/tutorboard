import {
  geometryOsRequestId,
  type GeometryOsClient,
  type GeometryOsGenerateResult,
  type GeometryOsGenerateTask,
  type GeometryOsRequestId,
} from "../../core/public";

import {
  readBoundedResponseBody,
  type BoundedBodyReadResult,
} from "./body-reader";
import { isJsonMediaType, isProblemMediaType } from "./content-type";
import {
  createDefaultGeometryOsRequestId,
  geometryOsRequestIdHeader,
} from "./request-id";
import {
  normalizeGenerateResponse,
  normalizeProblemDetail,
} from "./response-normalizer";
import {
  validateGenerateRequest,
  validateGenerateResponse,
  validateProblemDetail,
} from "./validation";

const defaultGenerateTimeoutMs = 25_000;
const defaultMaxResponseBytes = 2 * 1024 * 1024;
const maximumPromptLength = 20_000;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GeometryOsHttpClientOptions {
  readonly baseUrl: string;
  readonly createRequestId?: () => GeometryOsRequestId;
  readonly fetch?: FetchLike;
  readonly generateTimeoutMs?: number;
  readonly maxResponseBytes?: number;
}

interface ResolvedOptions {
  readonly createRequestId: () => GeometryOsRequestId;
  readonly endpoint: URL;
  readonly fetch: FetchLike;
  readonly generateTimeoutMs: number;
  readonly maxResponseBytes: number;
}

function positiveInteger(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function resolveEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("GeometryOS base URL must use HTTP or HTTPS.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError("GeometryOS base URL cannot contain credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new TypeError(
      "GeometryOS base URL cannot contain query or fragment data.",
    );
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return new URL("api/v1/generate", url);
}

function resolveOptions(options: GeometryOsHttpClientOptions): ResolvedOptions {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new Error("Fetch is required by the GeometryOS HTTP adapter.");
  }
  return {
    endpoint: resolveEndpoint(options.baseUrl),
    fetch: fetchImplementation,
    createRequestId:
      options.createRequestId ?? createDefaultGeometryOsRequestId,
    generateTimeoutMs: positiveInteger(
      options.generateTimeoutMs ?? defaultGenerateTimeoutMs,
      "GeometryOS generate timeout",
      120_000,
    ),
    maxResponseBytes: positiveInteger(
      options.maxResponseBytes ?? defaultMaxResponseBytes,
      "GeometryOS response limit",
      16 * 1024 * 1024,
    ),
  };
}

function incompatible(
  requestId: GeometryOsRequestId,
  code: Extract<
    GeometryOsGenerateResult,
    { kind: "incompatible-contract" }
  >["code"],
  httpStatus: number | null,
  issuePaths: readonly string[] = [],
  rawPayload: string | null = null,
): GeometryOsGenerateResult {
  return {
    kind: "incompatible-contract",
    requestId,
    code,
    httpStatus,
    issuePaths,
    rawPayload,
  };
}

function jsonValue(text: string):
  | { readonly parsed: true; readonly value: unknown }
  | {
      readonly parsed: false;
    } {
  try {
    return { parsed: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { parsed: false };
    }
    throw error;
  }
}

function readResponseRequestId(
  response: Response,
  expected: GeometryOsRequestId,
): GeometryOsGenerateResult | null {
  const actual = response.headers.get(geometryOsRequestIdHeader);
  if (actual === null || actual === "") {
    return incompatible(
      expected,
      "geometryos.missing-request-id",
      response.status,
    );
  }
  if (actual !== expected) {
    return incompatible(
      expected,
      "geometryos.request-id-mismatch",
      response.status,
    );
  }
  return null;
}

async function executeGenerate(
  options: ResolvedOptions,
  prompt: string,
  requestId: GeometryOsRequestId,
  signal: AbortSignal,
): Promise<GeometryOsGenerateResult> {
  const request = {
    input_type: "text" as const,
    input: prompt,
    mode: "strict" as const,
  };
  const requestValidation = validateGenerateRequest(request);
  if (!requestValidation.valid) {
    return {
      kind: "invalid-request",
      requestId,
      code: "geometryos.generated-request-invalid",
    };
  }

  let response: Response;
  try {
    response = await options.fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [geometryOsRequestIdHeader]: requestId,
      },
      body: JSON.stringify(requestValidation.value),
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return {
      kind: "transport-failure",
      requestId,
      code: "geometryos.network-failure",
      retryable: true,
    };
  }

  const requestIdFailure = readResponseRequestId(response, requestId);
  if (requestIdFailure !== null) {
    return requestIdFailure;
  }

  let body: BoundedBodyReadResult;
  try {
    body = await readBoundedResponseBody(response, options.maxResponseBytes);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return {
      kind: "transport-failure",
      requestId,
      code: "geometryos.network-failure",
      retryable: true,
    };
  }
  if (body.status === "too-large") {
    return incompatible(
      requestId,
      "geometryos.response-too-large",
      response.status,
    );
  }
  if (body.status === "invalid-utf8") {
    return incompatible(requestId, "geometryos.invalid-utf8", response.status);
  }

  if (
    response.status === 503 &&
    !isProblemMediaType(response.headers.get("Content-Type"))
  ) {
    return {
      kind: "transport-failure",
      requestId,
      code: "geometryos.unavailable",
      retryable: true,
    };
  }

  const expectedProblem = response.status !== 200;
  const contentType = response.headers.get("Content-Type");
  if (
    (expectedProblem && !isProblemMediaType(contentType)) ||
    (!expectedProblem && !isJsonMediaType(contentType))
  ) {
    return incompatible(
      requestId,
      "geometryos.wrong-content-type",
      response.status,
      [],
      body.text,
    );
  }

  const parsed = jsonValue(body.text);
  if (!parsed.parsed) {
    return incompatible(
      requestId,
      "geometryos.invalid-json",
      response.status,
      [],
      body.text,
    );
  }

  if (response.status === 200) {
    const possible = parsed.value as {
      readonly gir?: { readonly schema_version?: unknown };
      readonly status?: unknown;
    };
    if (
      possible.status === "success" &&
      possible.gir?.schema_version !== "0.2.0"
    ) {
      return incompatible(
        requestId,
        "geometryos.unsupported-gir-version",
        200,
        ["/gir/schema_version"],
        body.text,
      );
    }
    const validation = validateGenerateResponse(parsed.value);
    if (!validation.valid) {
      return incompatible(
        requestId,
        "geometryos.response-schema-mismatch",
        200,
        validation.issuePaths,
        body.text,
      );
    }
    return normalizeGenerateResponse(validation.value, requestId);
  }

  const validation = validateProblemDetail(parsed.value);
  if (!validation.valid) {
    return incompatible(
      requestId,
      "geometryos.response-schema-mismatch",
      response.status,
      validation.issuePaths,
      body.text,
    );
  }
  if (validation.value.request_id !== requestId) {
    return incompatible(
      requestId,
      "geometryos.problem-request-id-mismatch",
      response.status,
      ["/request_id"],
      body.text,
    );
  }
  if (validation.value.status !== response.status) {
    return incompatible(
      requestId,
      "geometryos.response-schema-mismatch",
      response.status,
      ["/status"],
      body.text,
    );
  }
  return normalizeProblemDetail(validation.value, requestId);
}

function invalidTask(
  requestId: GeometryOsRequestId,
  code: Extract<GeometryOsGenerateResult, { kind: "invalid-request" }>["code"],
): GeometryOsGenerateTask {
  return {
    requestId,
    result: Promise.resolve({ kind: "invalid-request", requestId, code }),
    cancel: () => undefined,
  };
}

export function createGeometryOsHttpClient(
  clientOptions: GeometryOsHttpClientOptions,
): GeometryOsClient {
  const options = resolveOptions(clientOptions);

  return {
    startGenerate(input): GeometryOsGenerateTask {
      const requestId = geometryOsRequestId(options.createRequestId());
      const promptLength = Array.from(input.prompt).length;
      if (promptLength === 0) {
        return invalidTask(requestId, "geometryos.prompt-empty");
      }
      if (promptLength > maximumPromptLength) {
        return invalidTask(requestId, "geometryos.prompt-too-long");
      }

      const controller = new AbortController();
      let abortReason: "cancelled" | "timeout" | null = null;
      let terminal = false;
      const timeout = setTimeout(() => {
        if (!terminal && abortReason === null) {
          abortReason = "timeout";
          controller.abort();
        }
      }, options.generateTimeoutMs);

      const result = executeGenerate(
        options,
        input.prompt,
        requestId,
        controller.signal,
      )
        .catch((error: unknown): GeometryOsGenerateResult => {
          if (controller.signal.aborted) {
            if (abortReason === "cancelled") {
              return { kind: "cancelled", requestId };
            }
            return {
              kind: "transport-failure",
              requestId,
              code: "geometryos.timeout",
              retryable: true,
            };
          }
          throw error;
        })
        .finally(() => {
          terminal = true;
          clearTimeout(timeout);
        });

      return {
        requestId,
        result,
        cancel(): void {
          if (!terminal && abortReason === null) {
            abortReason = "cancelled";
            controller.abort();
          }
        },
      };
    },
  };
}
