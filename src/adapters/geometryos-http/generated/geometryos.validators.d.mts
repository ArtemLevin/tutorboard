export interface GeneratedValidationError {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message?: string;
  readonly params: unknown;
  readonly schemaPath: string;
}

export interface GeneratedValidator {
  (value: unknown): boolean;
  readonly errors?: readonly GeneratedValidationError[] | null;
}

export const validateGenerateRequest: GeneratedValidator;
export const validateGenerateResponse: GeneratedValidator;
export const validateLayoutRequest: GeneratedValidator;
export const validateLayoutResponse: GeneratedValidator;
export const validateProblemDetail: GeneratedValidator;
