import type {
  GeometryImportDiagnostic,
  GeometryImportDiagnosticCode,
  GeometryImportFailureCode,
  GeometryImportSemanticPlanResult,
} from "./contract";

export function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareText(left: string | null, right: string | null): number {
  return compareString(left ?? "", right ?? "");
}

export function sortDiagnostics(
  diagnostics: readonly GeometryImportDiagnostic[],
): readonly GeometryImportDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const severity =
      left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1;
    return severity !== 0
      ? severity
      : compareString(left.code, right.code) ||
          compareText(left.path, right.path) ||
          compareText(left.girEntityId, right.girEntityId) ||
          compareString(
            left.relatedGirEntityIds.join("\0"),
            right.relatedGirEntityIds.join("\0"),
          );
  });
}

export function diagnostic(
  code: GeometryImportDiagnosticCode,
  severity: "error" | "warning",
  options: {
    readonly girEntityId?: string | null;
    readonly path?: string | null;
    readonly relatedGirEntityIds?: readonly string[];
  } = {},
): GeometryImportDiagnostic {
  return {
    code,
    severity,
    path: options.path ?? null,
    girEntityId: options.girEntityId ?? null,
    relatedGirEntityIds: [...(options.relatedGirEntityIds ?? [])].sort((a, b) =>
      compareString(a, b),
    ),
  };
}

export function failure(
  diagnostics: readonly GeometryImportDiagnostic[],
): GeometryImportSemanticPlanResult {
  const sorted = sortDiagnostics(diagnostics);
  const firstError = sorted.find((item) => item.severity === "error");
  if (firstError === undefined) {
    throw new Error("Geometry import failure requires an error diagnostic.");
  }
  return {
    status: "failure",
    code: firstError.code as GeometryImportFailureCode,
    diagnostics: sorted,
  };
}

export function hasErrors(
  diagnostics: readonly GeometryImportDiagnostic[],
): boolean {
  return diagnostics.some((item) => item.severity === "error");
}
