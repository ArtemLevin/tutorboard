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

export const validateGirScene: GeneratedValidator;
