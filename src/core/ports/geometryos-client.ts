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
