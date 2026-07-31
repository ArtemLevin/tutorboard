import type { ExpressionDiagnostic, ExpressionDiagnosticCode } from "./types";

export function expressionDiagnostic(
  code: ExpressionDiagnosticCode,
  message: string,
  start: number,
  end: number,
): ExpressionDiagnostic {
  return {
    code,
    end: Math.max(start, end),
    message,
    severity: "error",
    start: Math.max(0, start),
  };
}
