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

export interface GeometryOsLayoutDiagnostic {
  readonly code: string;
  readonly constraintIds: readonly string[];
  readonly message: string;
  readonly objectIds: readonly string[];
}

export interface GeometryOsReadinessCheck {
  readonly name: string;
  readonly status: "fail" | "pass";
}

export interface GeometryOsLayoutSource {
  readonly index: number | null;
  readonly objectId: string;
  readonly role: "auto_label" | "gir_object" | "triangle_edge";
}

export interface GeometryOsLayoutPoint {
  readonly id: string;
  readonly label: string | null;
  readonly source: GeometryOsLayoutSource;
  readonly x: number;
  readonly y: number;
}

export interface GeometryOsLayoutSegment {
  readonly end: string;
  readonly id: string;
  readonly source: GeometryOsLayoutSource;
  readonly start: string;
  readonly style: "dashed" | "solid";
}

export interface GeometryOsLayoutLabel {
  readonly dx: number;
  readonly dy: number;
  readonly id: string;
  readonly source: GeometryOsLayoutSource;
  readonly target: string;
  readonly text: string;
}

export interface GeometryOsLayoutDocument {
  readonly coordinateSpace: {
    readonly origin: "top_left";
    readonly unit: "abstract";
    readonly xDirection: "right";
    readonly yDirection: "down";
  };
  readonly height: number;
  readonly labels: readonly GeometryOsLayoutLabel[];
  readonly points: Readonly<Record<string, GeometryOsLayoutPoint>>;
  readonly schemaVersion: "0.1.0";
  readonly segments: readonly GeometryOsLayoutSegment[];
  readonly sourceGirSchemaVersion: "0.2.0";
  readonly sourceGirSha256: string;
  readonly width: number;
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
  | "geometryos.unsupported-layout-version"
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

type GeometryOsSharedFailureResult = Extract<
  GeometryOsGenerateResult,
  | { readonly kind: "cancelled" }
  | { readonly kind: "incompatible-contract" }
  | { readonly kind: "problem" }
  | { readonly kind: "transport-failure" }
>;

export type GeometryOsReadinessResult =
  | {
      readonly checks: readonly GeometryOsReadinessCheck[];
      readonly kind: "ready";
      readonly requestId: GeometryOsRequestId;
    }
  | {
      readonly checks: readonly GeometryOsReadinessCheck[];
      readonly kind: "not-ready";
      readonly requestId: GeometryOsRequestId;
      readonly retryable: true;
    }
  | GeometryOsSharedFailureResult;

export type GeometryOsLayoutResult =
  | {
      readonly canonicalGir: JsonValue;
      readonly diagnostics: readonly GeometryOsLayoutDiagnostic[];
      readonly kind: "success";
      readonly layoutDocument: GeometryOsLayoutDocument;
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly validationReport: GeometryOsValidationReport;
    }
  | {
      readonly canonicalGir: JsonValue;
      readonly diagnostics: readonly GeometryOsLayoutDiagnostic[];
      readonly kind: "unsupported";
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly validationReport: GeometryOsValidationReport;
    }
  | {
      readonly canonicalGir: JsonValue;
      readonly diagnostics: readonly GeometryOsLayoutDiagnostic[];
      readonly failureStage: "draft_validation" | "normalized_validation";
      readonly kind: "invalid-scene";
      readonly rawResponse: JsonValue;
      readonly requestId: GeometryOsRequestId;
      readonly validationReport: GeometryOsValidationReport;
    }
  | GeometryOsSharedFailureResult
  | {
      readonly code: "geometryos.layout-request-invalid";
      readonly kind: "invalid-request";
      readonly requestId: GeometryOsRequestId;
    };

export interface GeometryOsLayoutInput {
  readonly canonicalGir: JsonValue;
}

export interface GeometryOsGenerateTask {
  readonly requestId: GeometryOsRequestId;
  readonly result: Promise<GeometryOsGenerateResult>;
  readonly cancel: () => void;
}

export interface GeometryOsLayoutTask {
  readonly cancel: () => void;
  readonly requestId: GeometryOsRequestId;
  readonly result: Promise<GeometryOsLayoutResult>;
}

export interface GeometryOsReadinessTask {
  readonly cancel: () => void;
  readonly requestId: GeometryOsRequestId;
  readonly result: Promise<GeometryOsReadinessResult>;
}

export interface GeometryOsClient {
  readonly startReadiness: () => GeometryOsReadinessTask;
  readonly startGenerate: (
    input: GeometryOsGenerateInput,
  ) => GeometryOsGenerateTask;
  readonly startLayout: (input: GeometryOsLayoutInput) => GeometryOsLayoutTask;
}
