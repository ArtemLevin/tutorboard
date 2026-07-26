import type { components } from "./generated/geometryos.types";
import {
  validateGenerateRequest as generatedValidateGenerateRequest,
  validateGenerateResponse as generatedValidateGenerateResponse,
  validateLayoutRequest as generatedValidateLayoutRequest,
  validateLayoutResponse as generatedValidateLayoutResponse,
  validateProblemDetail as generatedValidateProblemDetail,
  validateReadinessResponse as generatedValidateReadinessResponse,
  type GeneratedValidator,
} from "./generated/geometryos.validators.mjs";

export type GenerateRequestDto = components["schemas"]["GenerateV1Request"];
export type GenerateResponseDto =
  | components["schemas"]["GenerateClarificationResponse"]
  | components["schemas"]["GenerateErrorResponse"]
  | components["schemas"]["GenerateSuccessResponse"];
export type LayoutRequestDto = components["schemas"]["GirScene"];
export type LayoutResponseDto =
  | components["schemas"]["LayoutInvalidSceneResponse"]
  | components["schemas"]["LayoutSuccessResponse"]
  | components["schemas"]["LayoutUnsupportedResponse"];
export type ProblemDetailDto = components["schemas"]["ProblemDetail"];
export type ReadinessResponseDto = components["schemas"]["ReadinessResponse"];

function issuePaths(validator: GeneratedValidator): readonly string[] {
  return [
    ...new Set(
      (validator.errors ?? []).map((error) => error.instancePath || "/"),
    ),
  ].sort();
}

export function validateGenerateRequest(value: unknown):
  | { readonly valid: true; readonly value: GenerateRequestDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateGenerateRequest(value)) {
    return { valid: true, value: value as GenerateRequestDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateGenerateRequest),
  };
}

export function validateGenerateResponse(value: unknown):
  | { readonly valid: true; readonly value: GenerateResponseDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateGenerateResponse(value)) {
    return { valid: true, value: value as GenerateResponseDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateGenerateResponse),
  };
}

export function validateLayoutRequest(value: unknown):
  | { readonly valid: true; readonly value: LayoutRequestDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateLayoutRequest(value)) {
    return { valid: true, value: value as LayoutRequestDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateLayoutRequest),
  };
}

export function validateLayoutResponse(value: unknown):
  | { readonly valid: true; readonly value: LayoutResponseDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateLayoutResponse(value)) {
    return { valid: true, value: value as LayoutResponseDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateLayoutResponse),
  };
}

export function validateProblemDetail(value: unknown):
  | { readonly valid: true; readonly value: ProblemDetailDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateProblemDetail(value)) {
    return { valid: true, value: value as ProblemDetailDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateProblemDetail),
  };
}

export function validateReadinessResponse(value: unknown):
  | { readonly valid: true; readonly value: ReadinessResponseDto }
  | {
      readonly valid: false;
      readonly issuePaths: readonly string[];
    } {
  if (generatedValidateReadinessResponse(value)) {
    return { valid: true, value: value as ReadinessResponseDto };
  }
  return {
    valid: false,
    issuePaths: issuePaths(generatedValidateReadinessResponse),
  };
}
