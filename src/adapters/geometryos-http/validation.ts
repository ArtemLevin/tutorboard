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
