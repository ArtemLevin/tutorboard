from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + "\n", encoding="utf-8")


files: dict[str, str] = {
    "src/core/ports/geometryos-client.ts": r'''
import type { JsonValue } from "../board/json";

declare const geometryOsRequestIdBrand: unique symbol;

export type GeometryOsRequestId = string & {
  readonly [geometryOsRequestIdBrand]: "GeometryOsRequestId";
};

export function geometryOsRequestId(value: string): GeometryOsRequestId {
  if (!/^tutorboard-[A-Za-z0-9._:-]{1,220}$/.test(value)) {
    throw new TypeError("GeometryOS request ID has an invalid format.");
  }
  return value as GeometryOsRequestId;
}

export interface GeometryOsAmbiguity {
  readonly code: string;
  readonly message: string;
  readonly options: readonly string[];
}

export interface GeometryOsNotice {
  readonly code: string;
  readonly message: string;
}

export interface GeometryOsValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
  readonly severity: "error" | "warning";
}

export interface GeometryOsValidationReport {
  readonly isValid: boolean;
  readonly issues: readonly GeometryOsValidationIssue[];
  readonly warnings: readonly GeometryOsValidationIssue[];
}

export interface GeometryOsProblemError {
  readonly code: string;
  readonly location: readonly (number | string)[];
  readonly message: string;
}

export type GeometryOsIncompatibleContractCode =
  | "geometryos.invalid-json"
  | "geometryos.invalid-success"
  | "geometryos.invalid-utf8"
  | "geometryos.missing-request-id"
  | "geometryos.problem-request-id-mismatch"
  | "geometryos.request-id-mismatch"
  | "geometryos.response-schema-mismatch"
  | "geometryos.response-too-large"
  | "geometryos.unsupported-gir-version"
  | "geometryos.wrong-content-type";

export type GeometryOsGenerateResult =
  | {
      readonly confidence: number;
      readonly kind: "success";
      readonly canonicalGir: JsonValue;
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly validationReport: GeometryOsValidationReport;
      readonly warnings: readonly GeometryOsNotice[];
    }
  | {
      readonly ambiguities: readonly GeometryOsAmbiguity[];
      readonly confidence: number;
      readonly explanation: string | null;
      readonly kind: "needs-clarification";
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly warnings: readonly GeometryOsNotice[];
    }
  | {
      readonly confidence: number;
      readonly explanation: string | null;
      readonly kind: "domain-error";
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly warnings: readonly GeometryOsNotice[];
    }
  | {
      readonly code: string;
      readonly detail: string;
      readonly errors: readonly GeometryOsProblemError[];
      readonly httpStatus: number;
      readonly kind: "problem";
      readonly requestId: GeometryOsRequestId;
      readonly retryable: boolean;
      readonly title: string;
      readonly type: string;
    }
  | {
      readonly code:
        | "geometryos.network-failure"
        | "geometryos.timeout"
        | "geometryos.unavailable";
      readonly kind: "transport-failure";
      readonly requestId: GeometryOsRequestId;
      readonly retryable: true;
    }
  | {
      readonly kind: "cancelled";
      readonly requestId: GeometryOsRequestId;
    }
  | {
      readonly code:
        | "geometryos.generated-request-invalid"
        | "geometryos.prompt-empty"
        | "geometryos.prompt-too-long";
      readonly kind: "invalid-request";
      readonly requestId: GeometryOsRequestId;
    }
  | {
      readonly code: GeometryOsIncompatibleContractCode;
      readonly httpStatus: number | null;
      readonly issuePaths: readonly string[];
      readonly kind: "incompatible-contract";
      readonly rawPayload: string | null;
      readonly requestId: GeometryOsRequestId;
    };

export interface GeometryOsGenerateInput {
  readonly prompt: string;
}

export interface GeometryOsGenerateTask {
  readonly requestId: GeometryOsRequestId;
  readonly result: Promise<GeometryOsGenerateResult>;
  readonly cancel: () => void;
}

export interface GeometryOsClient {
  readonly startGenerate: (
    input: GeometryOsGenerateInput,
  ) => GeometryOsGenerateTask;
}
''',
    "src/adapters/geometryos-http/body-reader.ts": r'''
export type BoundedBodyReadResult =
  | { readonly status: "ok"; readonly text: string }
  | { readonly status: "invalid-utf8" }
  | { readonly status: "too-large" };

function declaredLength(response: Response): number | null {
  const value = response.headers.get("Content-Length");
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<BoundedBodyReadResult> {
  const expectedLength = declaredLength(response);
  if (expectedLength !== null && expectedLength > maxBytes) {
    return { status: "too-large" };
  }

  if (response.body === null) {
    return { status: "ok", text: "" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const item = await reader.read();
    if (item.done) {
      break;
    }
    totalBytes += item.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too-large" };
    }
    chunks.push(item.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(body),
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: "invalid-utf8" };
    }
    throw error;
  }
}
''',
    "src/adapters/geometryos-http/content-type.ts": r'''
export function mediaType(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const [type] = value.split(";", 1);
  return type?.trim().toLowerCase() || null;
}

export function isJsonMediaType(value: string | null): boolean {
  const type = mediaType(value);
  return type === "application/json" || type?.endsWith("+json") === true;
}

export function isProblemMediaType(value: string | null): boolean {
  return mediaType(value) === "application/problem+json";
}
''',
    "src/adapters/geometryos-http/request-id.ts": r'''
import {
  geometryOsRequestId,
  type GeometryOsRequestId,
} from "../../core/public";

export const geometryOsRequestIdHeader = "X-Request-ID" as const;

export function createDefaultGeometryOsRequestId(): GeometryOsRequestId {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Web Crypto randomUUID is required for GeometryOS requests.");
  }
  return geometryOsRequestId(`tutorboard-${globalThis.crypto.randomUUID()}`);
}
''',
    "src/adapters/geometryos-http/validation.ts": r'''
import type { components } from "./generated/geometryos.types";
import {
  validateGenerateRequest as generatedValidateGenerateRequest,
  validateGenerateResponse as generatedValidateGenerateResponse,
  validateProblemDetail as generatedValidateProblemDetail,
  type GeneratedValidator,
} from "./generated/geometryos.validators.mjs";

export type GenerateRequestDto = components["schemas"]["GenerateV1Request"];
export type GenerateResponseDto =
  | components["schemas"]["GenerateClarificationResponse"]
  | components["schemas"]["GenerateErrorResponse"]
  | components["schemas"]["GenerateSuccessResponse"];
export type ProblemDetailDto = components["schemas"]["ProblemDetail"];

function issuePaths(validator: GeneratedValidator): readonly string[] {
  return [
    ...new Set(
      (validator.errors ?? []).map((error) => error.instancePath || "/"),
    ),
  ].sort();
}

export function validateGenerateRequest(
  value: unknown,
): { readonly valid: true; readonly value: GenerateRequestDto } | {
  readonly valid: false;
  readonly issuePaths: readonly string[];
} {
  if (generatedValidateGenerateRequest(value)) {
    return { valid: true, value: value as GenerateRequestDto };
  }
  return { valid: false, issuePaths: issuePaths(generatedValidateGenerateRequest) };
}

export function validateGenerateResponse(
  value: unknown,
): { readonly valid: true; readonly value: GenerateResponseDto } | {
  readonly valid: false;
  readonly issuePaths: readonly string[];
} {
  if (generatedValidateGenerateResponse(value)) {
    return { valid: true, value: value as GenerateResponseDto };
  }
  return { valid: false, issuePaths: issuePaths(generatedValidateGenerateResponse) };
}

export function validateProblemDetail(
  value: unknown,
): { readonly valid: true; readonly value: ProblemDetailDto } | {
  readonly valid: false;
  readonly issuePaths: readonly string[];
} {
  if (generatedValidateProblemDetail(value)) {
    return { valid: true, value: value as ProblemDetailDto };
  }
  return { valid: false, issuePaths: issuePaths(generatedValidateProblemDetail) };
}
''',
    "src/adapters/geometryos-http/response-normalizer.ts": r'''
import type {
  GeometryOsGenerateResult,
  GeometryOsRequestId,
  GeometryOsValidationReport,
  JsonValue,
} from "../../core/public";

import type { GenerateResponseDto, ProblemDetailDto } from "./validation";

function rawJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function warnings(
  value: readonly { readonly code: string; readonly message: string }[] | undefined,
) {
  return (value ?? []).map((warning) => ({
    code: warning.code,
    message: warning.message,
  }));
}

function validationReport(
  report: NonNullable<
    Extract<GenerateResponseDto, { status: "success" }>["validation_report"]
  >,
): GeometryOsValidationReport {
  const convert = (
    issue: {
      readonly code: string;
      readonly message: string;
      readonly path?: string | null;
      readonly severity?: "error" | "warning";
    },
  ) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path ?? null,
    severity: issue.severity ?? "error",
  });

  return {
    isValid: report.is_valid,
    issues: (report.issues ?? []).map(convert),
    warnings: (report.warnings ?? []).map(convert),
  };
}

export function normalizeGenerateResponse(
  response: GenerateResponseDto,
  requestId: GeometryOsRequestId,
): GeometryOsGenerateResult {
  if (response.status === "success") {
    const report = validationReport(response.validation_report);
    if (!report.isValid) {
      return {
        kind: "incompatible-contract",
        code: "geometryos.invalid-success",
        requestId,
        httpStatus: 200,
        issuePaths: ["/validation_report/is_valid"],
        rawPayload: null,
      };
    }
    return {
      kind: "success",
      requestId,
      confidence: response.confidence,
      canonicalGir: rawJson(response.gir),
      rawResponse: rawJson(response),
      validationReport: report,
      warnings: warnings(response.warnings),
    };
  }

  if (response.status === "needs_clarification") {
    return {
      kind: "needs-clarification",
      requestId,
      confidence: response.confidence,
      explanation: response.explanation ?? null,
      ambiguities: (response.ambiguities ?? []).map((ambiguity) => ({
        code: ambiguity.code,
        message: ambiguity.message,
        options: ambiguity.options ?? [],
      })),
      warnings: warnings(response.warnings),
      rawResponse: rawJson(response),
    };
  }

  return {
    kind: "domain-error",
    requestId,
    confidence: response.confidence,
    explanation: response.explanation ?? null,
    warnings: warnings(response.warnings),
    rawResponse: rawJson(response),
  };
}

export function normalizeProblemDetail(
  problem: ProblemDetailDto,
  requestId: GeometryOsRequestId,
): GeometryOsGenerateResult {
  return {
    kind: "problem",
    requestId,
    httpStatus: problem.status,
    type: problem.type,
    title: problem.title,
    detail: problem.detail,
    code: problem.code,
    errors: (problem.errors ?? []).map((error) => ({
      code: error.code,
      location: error.location ?? [],
      message: error.message,
    })),
    retryable: problem.status === 503 || problem.status === 504,
  };
}
''',
    "src/adapters/geometryos-http/client.ts": r'''
import {
  geometryOsRequestId,
  type GeometryOsClient,
  type GeometryOsGenerateResult,
  type GeometryOsGenerateTask,
  type GeometryOsRequestId,
} from "../../core/public";

import { readBoundedResponseBody } from "./body-reader";
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
    throw new RangeError(`${label} must be a positive integer no greater than ${maximum}.`);
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
    throw new TypeError("GeometryOS base URL cannot contain query or fragment data.");
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
    createRequestId: options.createRequestId ?? createDefaultGeometryOsRequestId,
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
  code: Extract<GeometryOsGenerateResult, { kind: "incompatible-contract" }>["code"],
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

function jsonValue(text: string): { readonly parsed: true; readonly value: unknown } | {
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
    return incompatible(expected, "geometryos.missing-request-id", response.status);
  }
  if (actual !== expected) {
    return incompatible(expected, "geometryos.request-id-mismatch", response.status);
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

  const body = await readBoundedResponseBody(response, options.maxResponseBytes);
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

  if (response.status === 503 && !isProblemMediaType(response.headers.get("Content-Type"))) {
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
''',
    "src/adapters/geometryos-http/public.ts": r'''
export {
  createGeometryOsHttpClient,
  type GeometryOsHttpClientOptions,
} from "./client";
export { geometryOsRequestIdHeader } from "./request-id";
export { geometryOsContractMetadata } from "./generated/contract-metadata";
''',
    "src/adapters/geometryos-http/README.md": r'''
# GeometryOS HTTP adapter

This adapter is the only TutorBoard runtime owner of the GeometryOS transport
contract. It consumes a platform-neutral `GeometryOsClient` port from `core`,
uses DTOs and standalone validators generated from the pinned OpenAPI artifact,
and returns a normalized result union.

The adapter deliberately does not import the board store, create geometry
objects, retry requests, parse SVG for semantics, or persist imports. Those
responsibilities belong to the application flow and the later GIR-to-Board
adapter.

## Boundary guarantees

- one `POST /api/v1/generate` per task;
- caller-visible cancellation and a separate client timeout result;
- bounded response streaming before UTF-8 and JSON parsing;
- `X-Request-ID` correlation and mismatch rejection;
- distinct success, clarification, domain error, Problem Details, transport and
  incompatible-contract results;
- generated DTOs never escape this adapter;
- prompts and raw responses are never logged by the adapter.
''',
    "scripts/geometryos-contract-lib.mjs": r'''
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractRoot = path.join(repositoryRoot, "contracts/geometryos");
const openApiPath = path.join(contractRoot, "openapi.v1.json");
const girSchemaPath = path.join(contractRoot, "gir.schema.v0.2.json");
const fixtureManifestPath = path.join(contractRoot, "fixtures/manifest.json");

export const generatedFiles = [
  "src/adapters/geometryos-http/generated/geometryos.types.ts",
  "src/adapters/geometryos-http/generated/geometryos.validators.mjs",
  "src/adapters/geometryos-http/generated/geometryos.validators.d.mts",
  "src/adapters/geometryos-http/generated/contract-metadata.ts",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function verifyContractArtifacts() {
  const manifest = readJson(path.join(contractRoot, "contract-manifest.json"));
  const checks = [
    [openApiPath, manifest.openApiSha256, "OpenAPI"],
    [girSchemaPath, manifest.girSchemaSha256, "GIR schema"],
    [fixtureManifestPath, manifest.fixtureManifestSha256, "fixture manifest"],
  ];
  for (const [filePath, expected, label] of checks) {
    const actual = hashFile(filePath);
    if (actual !== expected) {
      throw new Error(`${label} checksum mismatch: expected ${expected}, received ${actual}`);
    }
  }

  const openapi = readJson(openApiPath);
  const expectedMetadata = {
    version: manifest.openApiVersion,
    apiMajor: manifest.apiMajor,
    girSchemaVersion: manifest.girSchemaVersion,
    consumerContract: manifest.consumerContract,
    serviceVersion: manifest.serviceVersion,
  };
  const actualMetadata = {
    version: openapi.info?.version,
    apiMajor: openapi.info?.["x-geometryos-api-major"],
    girSchemaVersion: openapi.info?.["x-geometryos-gir-schema-version"],
    consumerContract: openapi.info?.["x-geometryos-consumer-contract"],
    serviceVersion: openapi.info?.["x-geometryos-service-version"],
  };
  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error(`GeometryOS OpenAPI metadata mismatch: ${JSON.stringify(actualMetadata)}`);
  }
  return { manifest, openapi };
}

function rewriteSchema(value) {
  if (Array.isArray(value)) {
    return value.map(rewriteSchema);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "$id") {
      continue;
    }
    if (key === "$ref" && typeof item === "string") {
      output[key] = item.replace("#/components/schemas/", "#/$defs/");
    } else {
      output[key] = rewriteSchema(item);
    }
  }
  return output;
}

function bundledSchema(rootSchema, components, id) {
  return {
    $id: id,
    ...rewriteSchema(rootSchema),
    $defs: rewriteSchema(components),
  };
}

function generateValidators(openapi) {
  const components = openapi.components.schemas;
  const responseSchema =
    openapi.paths["/api/v1/generate"].post.responses["200"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    code: { esm: true, source: true },
    discriminator: true,
    strict: false,
    validateFormats: false,
  });
  const validateGenerateRequest = ajv.compile(
    bundledSchema(
      components.GenerateV1Request,
      components,
      "urn:tutorboard:geometryos:generate-request",
    ),
  );
  const validateGenerateResponse = ajv.compile(
    bundledSchema(
      responseSchema,
      components,
      "urn:tutorboard:geometryos:generate-response",
    ),
  );
  const validateProblemDetail = ajv.compile(
    bundledSchema(
      components.ProblemDetail,
      components,
      "urn:tutorboard:geometryos:problem-detail",
    ),
  );
  return standaloneCode(ajv, {
    validateGenerateRequest,
    validateGenerateResponse,
    validateProblemDetail,
  });
}

function writeMetadata(outputRoot, manifest) {
  const content = `export const geometryOsContractMetadata = ${JSON.stringify(
    {
      apiMajor: manifest.apiMajor,
      consumerContract: manifest.consumerContract,
      girSchemaVersion: manifest.girSchemaVersion,
      openApiSha256: manifest.openApiSha256,
      openApiVersion: manifest.openApiVersion,
      serviceVersion: manifest.serviceVersion,
      sourceCommit: manifest.sourceCommit,
      sourceRepository: manifest.sourceRepository,
    },
    null,
    2,
  )} as const;\n`;
  fs.writeFileSync(
    path.join(
      outputRoot,
      "src/adapters/geometryos-http/generated/contract-metadata.ts",
    ),
    content,
  );
}

export function generateContract(outputRoot = repositoryRoot) {
  const { manifest, openapi } = verifyContractArtifacts();
  const generatedRoot = path.join(
    outputRoot,
    "src/adapters/geometryos-http/generated",
  );
  fs.mkdirSync(generatedRoot, { recursive: true });
  const executable = path.join(
    repositoryRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "openapi-typescript.cmd" : "openapi-typescript",
  );
  execFileSync(executable, [openApiPath, "-o", path.join(generatedRoot, "geometryos.types.ts")], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  fs.writeFileSync(
    path.join(generatedRoot, "geometryos.validators.mjs"),
    generateValidators(openapi),
  );
  fs.writeFileSync(
    path.join(generatedRoot, "geometryos.validators.d.mts"),
    `export interface GeneratedValidationError {\n  readonly instancePath: string;\n  readonly keyword: string;\n  readonly message?: string;\n  readonly params: unknown;\n  readonly schemaPath: string;\n}\n\nexport interface GeneratedValidator {\n  (value: unknown): boolean;\n  readonly errors?: readonly GeneratedValidationError[] | null;\n}\n\nexport const validateGenerateRequest: GeneratedValidator;\nexport const validateGenerateResponse: GeneratedValidator;\nexport const validateProblemDetail: GeneratedValidator;\n`,
  );
  writeMetadata(outputRoot, manifest);
}

export function checkGeneratedContract() {
  verifyContractArtifacts();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tutorboard-geometryos-"));
  try {
    generateContract(temporaryRoot);
    const differences = [];
    for (const relativePath of generatedFiles) {
      const expected = fs.readFileSync(path.join(repositoryRoot, relativePath));
      const actual = fs.readFileSync(path.join(temporaryRoot, relativePath));
      if (!expected.equals(actual)) {
        differences.push(relativePath);
      }
    }
    if (differences.length > 0) {
      throw new Error(
        `Generated GeometryOS contract is stale: ${differences.join(", ")}. Run npm run geometryos:generate.`,
      );
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
''',
    "scripts/generate-geometryos-contract.mjs": r'''
import { generateContract } from "./geometryos-contract-lib.mjs";

generateContract();
console.log("Generated GeometryOS DTOs and runtime validators.");
''',
    "scripts/check-geometryos-contract.mjs": r'''
import { checkGeneratedContract } from "./geometryos-contract-lib.mjs";

checkGeneratedContract();
console.log("GeometryOS contract artifacts and generated output are current.");
''',
    "scripts/vendor-geometryos-contract.mjs": r'''
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractRoot = path.join(repositoryRoot, "contracts/geometryos");
const sourceRepository = "ArtemLevin/geometryos";
const sourceCommit = "a9eb95852328a4665f81d16cee30966cb227676c";
const expected = {
  openApi: "70815f28ee32e300744c7ac841a0b63b4c1153cccefa066507049ccd19034ea2",
  girSchema: "dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993",
  fixtureManifest: "3694c788e4e94d1c636510ec3ce73f70cebd63a0c42743e94f19ab6d29af12a3",
};
const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }
  : { Accept: "application/vnd.github+json" };

async function fetchBytes(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const treeResponse = await fetch(
  `https://api.github.com/repos/${sourceRepository}/git/trees/${sourceCommit}?recursive=1`,
  { headers },
);
if (!treeResponse.ok) {
  throw new Error(`Failed to read GeometryOS tree: ${treeResponse.status}`);
}
const tree = await treeResponse.json();
if (tree.truncated) {
  throw new Error("GeometryOS source tree response was truncated.");
}
const candidates = tree.tree
  .filter((entry) => entry.type === "blob" && entry.path.endsWith(".json"))
  .sort((left, right) => {
    const score = (value) => /openapi|schema|manifest|fixture|tutorboard/i.test(value) ? 0 : 1;
    return score(left.path) - score(right.path) || left.path.localeCompare(right.path);
  });
const matches = new Map();
for (const entry of candidates) {
  const bytes = await fetchBytes(
    `https://raw.githubusercontent.com/${sourceRepository}/${sourceCommit}/${entry.path}`,
  );
  const hash = sha256(bytes);
  for (const [kind, expectedHash] of Object.entries(expected)) {
    if (hash === expectedHash) {
      matches.set(kind, { path: entry.path, bytes });
    }
  }
  if (matches.size === Object.keys(expected).length) {
    break;
  }
}
for (const kind of Object.keys(expected)) {
  if (!matches.has(kind)) {
    throw new Error(`Unable to find pinned GeometryOS ${kind} artifact by checksum.`);
  }
}

fs.rmSync(contractRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(contractRoot, "fixtures"), { recursive: true });
fs.writeFileSync(path.join(contractRoot, "openapi.v1.json"), matches.get("openApi").bytes);
fs.writeFileSync(path.join(contractRoot, "gir.schema.v0.2.json"), matches.get("girSchema").bytes);
fs.writeFileSync(
  path.join(contractRoot, "fixtures/manifest.json"),
  matches.get("fixtureManifest").bytes,
);

const fixtureSourcePath = matches.get("fixtureManifest").path;
const fixtureDirectory = path.posix.dirname(fixtureSourcePath);
const fixtureEntries = candidates.filter(
  (entry) =>
    entry.path !== fixtureSourcePath &&
    entry.path.startsWith(`${fixtureDirectory}/`) &&
    entry.path.endsWith(".json"),
);
if (fixtureEntries.length > 100) {
  throw new Error("GeometryOS fixture directory exceeds the bounded vendor limit.");
}
for (const entry of fixtureEntries) {
  const relative = path.posix.relative(fixtureDirectory, entry.path);
  const target = path.join(contractRoot, "fixtures", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    await fetchBytes(
      `https://raw.githubusercontent.com/${sourceRepository}/${sourceCommit}/${entry.path}`,
    ),
  );
}

const openapi = JSON.parse(matches.get("openApi").bytes.toString("utf8"));
const manifest = {
  schemaVersion: "tutorboard.geometryos-contract/1",
  sourceRepository,
  sourceCommit,
  serviceVersion: openapi.info["x-geometryos-service-version"],
  openApiVersion: openapi.info.version,
  apiMajor: openapi.info["x-geometryos-api-major"],
  girSchemaVersion: openapi.info["x-geometryos-gir-schema-version"],
  consumerContract: openapi.info["x-geometryos-consumer-contract"],
  requestIdHeader: "X-Request-ID",
  openApiSha256: expected.openApi,
  girSchemaSha256: expected.girSchema,
  fixtureManifestSha256: expected.fixtureManifest,
  sourcePaths: {
    openApi: matches.get("openApi").path,
    girSchema: matches.get("girSchema").path,
    fixtureManifest: fixtureSourcePath,
  },
};
fs.writeFileSync(
  path.join(contractRoot, "contract-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Vendored GeometryOS contract from ${sourceCommit}.`);
''',
    "contracts/geometryos/README.md": r'''
# Pinned GeometryOS consumer contract

This directory contains immutable release artifacts copied from the GeometryOS
commit recorded in `contract-manifest.json`. Normal CI is offline with respect
to GeometryOS: it verifies local SHA-256 values and regenerates DTOs and runtime
validators into a temporary directory to detect drift.

Use `npm run geometryos:vendor` only for an explicit contract upgrade. Review the
source commit, artifact checksums, generated diff and compatibility matrix before
accepting the result.

The consumer fixture directory is evidence owned by GeometryOS. TutorBoard does
not modify those fixtures and does not infer semantic coordinates from SVG.
''',
    "docs/architecture/GEOMETRYOS_CLIENT.md": r'''
# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest
by source commit and SHA-256. Compile-time DTOs and standalone runtime validators
are generated from that same OpenAPI artifact. External DTOs remain private to
`adapters/geometryos-http`; the rest of TutorBoard consumes the platform-neutral
`GeometryOsClient` port from `core`.

## Flow

```text
prompt
  -> GeometryOsClient task
  -> one bounded HTTP request
  -> request-ID/content-type/body checks
  -> generated runtime validation
  -> normalized result union
```

The result union keeps HTTP 200 domain outcomes distinct from Problem Details,
transport failures, cancellation and incompatible contracts. The adapter marks
retryability but performs no retry. Application-level retry and import
deduplication require a durable import operation identity and belong to the
later geometry-import flow.

## Compatibility

Pinned versions:

- GeometryOS service `0.2.0`;
- HTTP API `v1` / `1.0.0`;
- GIR `0.2.0`;
- consumer fixtures `tutorboard/v1`.

A success response with another GIR version, invalid response schema, missing or
mismatched request ID, invalid content type, malformed UTF-8/JSON, or an
oversized body is rejected before any GIR-to-Board code can observe it.

## Privacy and security

The adapter never logs prompts, response bodies or credential-bearing URLs.
Base URLs cannot include credentials, query strings or fragments. Response
bodies are streamed through a byte limit before decoding. Generated validators
are compiled at build time; the browser does not dynamically compile schemas.

## Known producer follow-up

The pinned OpenAPI does not yet formally describe `X-Request-ID` response headers
or the generate endpoint's `503` response. Browser integration also requires
GeometryOS CORS to expose `X-Request-ID`. PR 2.8 enforces the protocol against
mocked responses; a live browser gate is required before the PR 2.9 vertical
slice is declared complete.
''',
    "docs/adr/ADR-006-geometryos-generated-client.md": r'''
# ADR-006: Generated GeometryOS client boundary

- Status: accepted
- Date: 2026-07-24

## Context

TutorBoard must consume a large OpenAPI 3.1 contract containing canonical GIR.
Static TypeScript types alone do not validate untrusted network responses, while
handwritten runtime schemas would create a second contract likely to drift.

## Decision

Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same
pinned `openapi-typescript` version used by the producer contract smoke, and
generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all
generated DTOs private to `adapters/geometryos-http` and expose only a normalized
`GeometryOsClient` port from `core`.

The adapter performs no automatic retry and does not create Board objects.

## Consequences

- contract upgrades produce an explicit artifact and generated-code diff;
- network responses are validated at runtime before entering TutorBoard;
- generated validator output is committed and reproducibility-checked;
- the production bundle may include small Ajv runtime helpers referenced by the
  standalone output;
- request-ID/CORS and machine-readable layout remain explicit GeometryOS
  follow-ups before the full vertical import slice.

## Rejected alternatives

- handwritten DTOs or Zod copies: duplicate source of truth;
- using generated TypeScript types without runtime validation: unsafe boundary;
- compiling OpenAPI dynamically in the browser: unnecessary code generation and
  CSP complexity;
- returning generated DTOs from the core port: external contract leakage;
- parsing SVG to recover layout or semantics: violates the GIR-first boundary.
''',
    "tests/contracts/geometryos-contract.test.ts": r'''
// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { geometryOsContractMetadata } from "../../src/adapters/geometryos-http/public";
import {
  validateGenerateRequest,
  validateGenerateResponse,
  validateProblemDetail,
} from "../../src/adapters/geometryos-http/validation";

const root = path.resolve(process.cwd(), "contracts/geometryos");

function json(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function collectJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? collectJsonFiles(value) : entry.name.endsWith(".json") ? [value] : [];
  });
}

function visit(value: unknown, callback: (candidate: unknown) => void): void {
  callback(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) visit(item, callback);
  }
}

describe("pinned GeometryOS contract", () => {
  it("matches the approved artifact hashes and metadata", () => {
    const manifest = json(path.join(root, "contract-manifest.json")) as {
      openApiSha256: string;
      girSchemaSha256: string;
      fixtureManifestSha256: string;
      sourceCommit: string;
    };
    expect(sha256(path.join(root, "openapi.v1.json"))).toBe(manifest.openApiSha256);
    expect(sha256(path.join(root, "gir.schema.v0.2.json"))).toBe(manifest.girSchemaSha256);
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

  it("validates producer consumer fixtures without handwritten DTO copies", () => {
    const counts = { request: 0, response: 0, problem: 0 };
    for (const filePath of collectJsonFiles(path.join(root, "fixtures"))) {
      if (filePath.endsWith(`${path.sep}manifest.json`)) continue;
      visit(json(filePath), (candidate) => {
        if (candidate === null || typeof candidate !== "object") return;
        const record = candidate as Record<string, unknown>;
        if (record.input_type === "text" && typeof record.input === "string") {
          if (validateGenerateRequest(candidate).valid) counts.request += 1;
        }
        if (["success", "needs_clarification", "error"].includes(String(record.status))) {
          if (validateGenerateResponse(candidate).valid) counts.response += 1;
        }
        if (
          typeof record.status === "number" &&
          typeof record.request_id === "string" &&
          typeof record.code === "string"
        ) {
          if (validateProblemDetail(candidate).valid) counts.problem += 1;
        }
      });
    }
    expect(counts.request).toBeGreaterThan(0);
    expect(counts.response).toBeGreaterThan(0);
    expect(counts.problem).toBeGreaterThan(0);
  });
});
''',
    "tests/unit/adapters/geometryos-http/client.test.ts": r'''
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import { geometryOsRequestId } from "../../../../src/core/public";

const openapi = JSON.parse(
  fs.readFileSync(path.resolve("contracts/geometryos/openapi.v1.json"), "utf8"),
) as {
  components: {
    schemas: Record<string, { examples?: unknown[] }>;
  };
};
const success = openapi.components.schemas.GenerateSuccessResponse?.examples?.[0];
const domainError = openapi.components.schemas.GenerateErrorResponse?.examples?.[0];
const problem = openapi.components.schemas.ProblemDetail?.examples?.[0];
const requestId = geometryOsRequestId("tutorboard-test-request");

function response(
  body: unknown,
  options: { status?: number; contentType?: string; responseRequestId?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      "X-Request-ID": options.responseRequestId ?? requestId,
    },
  });
}

function client(fetch: typeof globalThis.fetch, overrides: { timeout?: number; limit?: number } = {}) {
  return createGeometryOsHttpClient({
    baseUrl: "https://geometry.example.test/",
    createRequestId: () => requestId,
    fetch,
    generateTimeoutMs: overrides.timeout ?? 1000,
    maxResponseBytes: overrides.limit ?? 1024 * 1024,
  });
}

describe("GeometryOS HTTP client", () => {
  it("sends the pinned generate request once and normalizes success", async () => {
    const fetch = vi.fn(async () => response(success));
    const task = client(fetch).startGenerate({ prompt: "Построй треугольник ABC" });
    const result = await task.result;
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
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
      ambiguities: [{ code: "ambiguous", message: "Choose", options: ["A", "B"] }],
      warnings: [],
      explanation: null,
      gir: null,
      svg: null,
      tikz: null,
      validation_report: null,
      schema_version: "0.2.0",
    };
    await expect(
      client(vi.fn(async () => response(clarification))).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "needs-clarification" });
  });

  it("keeps domain errors separate from Problem Details", async () => {
    await expect(
      client(vi.fn(async () => response(domainError))).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "domain-error" });

    const problemBody = { ...(problem as Record<string, unknown>), request_id: requestId };
    await expect(
      client(
        vi.fn(async () =>
          response(problemBody, { status: 422, contentType: "application/problem+json" }),
        ),
      ).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "problem", httpStatus: 422, retryable: false });
  });

  it("rejects invalid content, JSON, request IDs and GIR versions", async () => {
    const wrongType = await client(
      vi.fn(async () => response(success, { contentType: "text/html" })),
    ).startGenerate({ prompt: "x" }).result;
    expect(wrongType).toMatchObject({ kind: "incompatible-contract", code: "geometryos.wrong-content-type" });

    const invalidJsonFetch = vi.fn(async () =>
      new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
      }),
    );
    await expect(
      client(invalidJsonFetch).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "incompatible-contract", code: "geometryos.invalid-json" });

    await expect(
      client(vi.fn(async () => response(success, { responseRequestId: "tutorboard-other" })))
        .startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "incompatible-contract", code: "geometryos.request-id-mismatch" });

    const incompatible = structuredClone(success) as Record<string, unknown>;
    (incompatible.gir as Record<string, unknown>).schema_version = "0.3.0";
    await expect(
      client(vi.fn(async () => response(incompatible))).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "incompatible-contract", code: "geometryos.unsupported-gir-version" });
  });

  it("bounds response bodies before parsing", async () => {
    await expect(
      client(vi.fn(async () => response(success)), { limit: 16 }).startGenerate({ prompt: "x" }).result,
    ).resolves.toMatchObject({ kind: "incompatible-contract", code: "geometryos.response-too-large" });
  });

  it("distinguishes timeout from caller cancellation", async () => {
    vi.useFakeTimers();
    const hangingFetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const timeoutTask = client(hangingFetch, { timeout: 10 }).startGenerate({ prompt: "x" });
    await vi.advanceTimersByTimeAsync(11);
    await expect(timeoutTask.result).resolves.toMatchObject({
      kind: "transport-failure",
      code: "geometryos.timeout",
    });

    const cancelledTask = client(hangingFetch, { timeout: 100 }).startGenerate({ prompt: "x" });
    cancelledTask.cancel();
    await expect(cancelledTask.result).resolves.toMatchObject({ kind: "cancelled" });
    vi.useRealTimers();
  });

  it("does not retry retryable failures and isolates concurrent cancellation", async () => {
    const calls: AbortSignal[] = [];
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.signal !== undefined) calls.push(init.signal);
        return await new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          if (calls.length === 2) resolve(response(success));
        });
      },
    );
    let sequence = 0;
    const concurrentClient = createGeometryOsHttpClient({
      baseUrl: "https://geometry.example.test",
      createRequestId: () => geometryOsRequestId(`tutorboard-concurrent-${++sequence}`),
      fetch,
      generateTimeoutMs: 1000,
    });
    const first = concurrentClient.startGenerate({ prompt: "first" });
    const second = concurrentClient.startGenerate({ prompt: "second" });
    first.cancel();
    await expect(first.result).resolves.toMatchObject({ kind: "cancelled" });
    await expect(second.result).resolves.toMatchObject({ kind: "success" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it("rejects invalid prompts before network access", async () => {
    const fetch = vi.fn();
    await expect(client(fetch).startGenerate({ prompt: "" }).result).resolves.toMatchObject({
      kind: "invalid-request",
      code: "geometryos.prompt-empty",
    });
    await expect(
      client(fetch).startGenerate({ prompt: "x".repeat(20_001) }).result,
    ).resolves.toMatchObject({ kind: "invalid-request", code: "geometryos.prompt-too-long" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
''',
}

for path, content in files.items():
    write(path, content)

# package.json
package_path = ROOT / "package.json"
package_data = json.loads(package_path.read_text(encoding="utf-8"))
package_data["scripts"]["geometryos:vendor"] = "node scripts/vendor-geometryos-contract.mjs"
package_data["scripts"]["geometryos:generate"] = "node scripts/generate-geometryos-contract.mjs"
package_data["scripts"]["geometryos:check"] = "node scripts/check-geometryos-contract.mjs"
package_data["scripts"]["check"] = (
    "npm run geometryos:check && npm run format:check && npm run lint && "
    "npm run typecheck && npm run test && npm run architecture && npm run build"
)
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# tsconfig includes contract tests.
tsconfig_path = ROOT / "tsconfig.app.json"
tsconfig = json.loads(tsconfig_path.read_text(encoding="utf-8"))
includes = tsconfig["include"]
if "tests/contracts" not in includes:
    includes.append("tests/contracts")
tsconfig_path.write_text(json.dumps(tsconfig, indent=2) + "\n", encoding="utf-8")

# Core public exports.
core_public = ROOT / "src/core/public.ts"
core_text = core_public.read_text(encoding="utf-8")
if 'export type { JsonPrimitive, JsonValue } from "./board/json";' not in core_text:
    core_text += '\nexport type { JsonPrimitive, JsonValue } from "./board/json";\n'
if 'from "./ports/geometryos-client"' not in core_text:
    core_text += r'''
export {
  geometryOsRequestId,
  type GeometryOsAmbiguity,
  type GeometryOsClient,
  type GeometryOsGenerateInput,
  type GeometryOsGenerateResult,
  type GeometryOsGenerateTask,
  type GeometryOsIncompatibleContractCode,
  type GeometryOsNotice,
  type GeometryOsProblemError,
  type GeometryOsRequestId,
  type GeometryOsValidationIssue,
  type GeometryOsValidationReport,
} from "./ports/geometryos-client";
'''
core_public.write_text(core_text, encoding="utf-8")

# Architecture enforcement.
architecture_path = ROOT / "scripts/architecture-rules.mjs"
architecture = architecture_path.read_text(encoding="utf-8")
architecture = architecture.replace(
    '  "dompurify",\n  "konva",',
    '  "dompurify",\n  "ajv",\n  "konva",\n  "openapi-typescript",',
)
fetch_helper = r'''
function collectDirectFetchUsage(sourceFile) {
  const usages = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const call = propertyPath(node.expression);
      if (call === "fetch" || call === "globalThis.fetch" || call === "window.fetch") {
        usages.push(call);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return usages;
}
'''
marker = "function isReducerFile(filePath, srcRoot) {"
if "function collectDirectFetchUsage" not in architecture:
    architecture = architecture.replace(marker, fetch_helper + "\n" + marker)
fetch_rule = r'''
  if (
    !(importer.layer === "adapters" && importer.owner === "geometryos-http")
  ) {
    for (const source of collectDirectFetchUsage(sourceFile)) {
      violations.push(
        violation(
          "ARCH-003",
          filePath,
          source,
          "network requests must cross a declared adapter boundary",
        ),
      );
    }
  }

'''
loop_marker = "  for (const specifier of collectSpecifiers(sourceFile)) {"
if "network requests must cross a declared adapter boundary" not in architecture:
    architecture = architecture.replace(loop_marker, fetch_rule + loop_marker)
generated_rule = r'''
    const generatedRelativePath = path.relative(srcRoot, targetPath);
    if (
      /(?:^|[/\\])adapters[/\\]geometryos-http[/\\]generated(?:[/\\]|$)/.test(
        generatedRelativePath,
      ) &&
      !(importer.layer === "adapters" && importer.owner === "geometryos-http")
    ) {
      violations.push(
        violation(
          "GEO-003",
          filePath,
          specifier,
          "generated GeometryOS DTOs are private to the HTTP adapter",
        ),
      );
      continue;
    }

'''
target_marker = "    const target = sourceLocation(targetPath, srcRoot);"
if "generated GeometryOS DTOs are private" not in architecture:
    architecture = architecture.replace(target_marker, generated_rule + target_marker)
architecture_path.write_text(architecture, encoding="utf-8")

architecture_tests = ROOT / "tests/architecture/architecture-rules.test.mjs"
architecture_test_text = architecture_tests.read_text(encoding="utf-8")
new_arch_tests = r'''

  it("keeps generated GeometryOS DTOs private to the adapter", () => {
    expect(
      analyze(
        "modules/geometry-import/import.ts",
        'import type { components } from "../../adapters/geometryos-http/generated/geometryos.types";',
      ),
    ).toEqual([expect.objectContaining({ invariant: "GEO-003" })]);
    expect(
      analyze(
        "adapters/geometryos-http/validation.ts",
        'import type { components } from "./generated/geometryos.types";',
      ),
    ).toEqual([]);
  });

  it("restricts direct fetch calls to technology adapters", () => {
    expect(
      analyze("app/App.tsx", 'const response = fetch("https://example.test");'),
    ).toEqual([expect.objectContaining({ invariant: "ARCH-003" })]);
    expect(
      analyze(
        "adapters/geometryos-http/client.ts",
        'const response = globalThis.fetch("https://example.test");',
      ),
    ).toEqual([]);
  });
'''
if "keeps generated GeometryOS DTOs private" not in architecture_test_text:
    index = architecture_test_text.rfind("});")
    architecture_test_text = architecture_test_text[:index] + new_arch_tests + architecture_test_text[index:]
architecture_tests.write_text(architecture_test_text, encoding="utf-8")

# Documentation status updates.
plan_path = ROOT / "PLAN.md"
plan = plan_path.read_text(encoding="utf-8")
plan = plan.replace(
    "10. **PR 2.8 — GeometryOS generated client — следующий**\n   - подключить pinned OpenAPI-generated DTO и HTTP adapter;\n   - разделить success, clarification, domain error и Problem Details;\n   - обеспечить timeout/abort, request ID и incompatible contract diagnostics.\n11. Далее выполнять PR 2.9–2.12",
    "10. **PR 2.8 — GeometryOS generated client — завершён**\n   - pinned OpenAPI/GIR/consumer artifacts проверяются по SHA-256;\n   - compile-time DTO и standalone runtime validators воспроизводимо генерируются из одного OpenAPI;\n   - HTTP adapter разделяет success, clarification, domain error, Problem Details, transport, cancellation и incompatible contract;\n   - bounded body, timeout/abort и request ID проверяются до передачи canonical GIR.\n11. **PR 2.9 — deterministic GIR-to-Board import — следующий**\n   - реализовать layout policy, pure GIR adapter и атомарный import command.\n12. Далее выполнять PR 2.10–2.12",
)
plan_path.write_text(plan, encoding="utf-8")

readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "| TutorBoard                   | Safe visual-import spike: BoardDocument 0.2, canvas/tools/selection, Dexie recovery и bounded SVG insertion                    |",
    "| TutorBoard                   | GeometryOS client spike: BoardDocument 0.2, canvas/tools/selection, Dexie recovery, safe SVG и generated validated HTTP boundary |",
)
readme = readme.replace(
    "повторной проверкой перед render. Следующий этап — generated GeometryOS client.",
    "повторной проверкой перед render. Pinned GeometryOS DTO, standalone runtime validators и bounded HTTP adapter готовы; следующий этап — deterministic GIR-to-Board import.",
)
readme_path.write_text(readme, encoding="utf-8")

adapter_readme_path = ROOT / "src/adapters/README.md"
adapter_readme = adapter_readme_path.read_text(encoding="utf-8")
if "`geometryos-http`" not in adapter_readme:
    adapter_readme += "\n- `geometryos-http` owns the pinned generated DTO/runtime-validation boundary, bounded HTTP transport, request correlation and normalized GeometryOS outcomes.\n"
adapter_readme_path.write_text(adapter_readme, encoding="utf-8")

print(f"Prepared {len(files)} new PR 2.8 files and patched repository contracts.")
