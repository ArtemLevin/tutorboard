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
  value:
    readonly { readonly code: string; readonly message: string }[] | undefined,
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
  const convert = (issue: {
    readonly code: string;
    readonly message: string;
    readonly path?: string | null;
    readonly severity?: "error" | "warning";
  }) => ({
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
