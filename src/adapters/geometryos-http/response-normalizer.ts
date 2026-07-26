import type {
  GeometryOsGenerateResult,
  GeometryOsLayoutDocument,
  GeometryOsLayoutResult,
  GeometryOsRequestId,
  GeometryOsValidationReport,
  JsonValue,
} from "../../core/public";

import type {
  GenerateResponseDto,
  LayoutResponseDto,
  ProblemDetailDto,
} from "./validation";

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
  report: Extract<
    LayoutResponseDto,
    { status: "success" }
  >["validation_report"],
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

function layoutDiagnostics(response: LayoutResponseDto) {
  return (response.diagnostics ?? []).map((item) => ({
    code: item.code,
    constraintIds: item.constraint_ids ?? [],
    message: item.message,
    objectIds: item.object_ids ?? [],
  }));
}

function layoutDocument(
  value: Extract<LayoutResponseDto, { status: "success" }>["layout"],
): GeometryOsLayoutDocument {
  const source = (item: (typeof value.points)[string]["source"]) => ({
    index: item.index ?? null,
    objectId: item.object_id,
    role: item.role,
  });
  return {
    coordinateSpace: {
      origin: value.coordinate_space.origin,
      unit: value.coordinate_space.unit,
      xDirection: value.coordinate_space.x_direction,
      yDirection: value.coordinate_space.y_direction,
    },
    height: value.height ?? 220,
    labels: (value.labels ?? []).map((item) => ({
      dx: item.dx ?? 6,
      dy: item.dy ?? -6,
      id: item.id,
      source: source(item.source),
      target: item.target,
      text: item.text,
    })),
    points: Object.fromEntries(
      Object.entries(value.points).map(([id, item]) => [
        id,
        {
          id: item.id,
          label: item.label ?? null,
          source: source(item.source),
          x: item.x,
          y: item.y,
        },
      ]),
    ),
    schemaVersion: value.schema_version,
    segments: value.segments.map((item) => ({
      end: item.end,
      id: item.id,
      source: source(item.source),
      start: item.start,
      style: item.style ?? "solid",
    })),
    sourceGirSchemaVersion: value.source_gir_schema_version,
    sourceGirSha256: value.source_gir_sha256,
    width: value.width ?? 280,
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

export function normalizeLayoutResponse(
  response: LayoutResponseDto,
  requestId: GeometryOsRequestId,
): GeometryOsLayoutResult {
  const report = validationReport(response.validation_report);
  const common = {
    requestId,
    canonicalGir: rawJson(response.canonical_gir),
    diagnostics: layoutDiagnostics(response),
    rawResponse: rawJson(response),
    validationReport: report,
  } as const;

  if (response.status === "success") {
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
      ...common,
      kind: "success",
      layoutDocument: layoutDocument(response.layout),
    };
  }

  if (response.status === "unsupported") {
    return { ...common, kind: "unsupported" };
  }

  return {
    ...common,
    kind: "invalid-scene",
    failureStage: response.failure_stage,
  };
}

export function normalizeProblemDetail(
  problem: ProblemDetailDto,
  requestId: GeometryOsRequestId,
): Extract<GeometryOsGenerateResult, { readonly kind: "problem" }> {
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
