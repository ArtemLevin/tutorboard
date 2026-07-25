import type {
  CreateGeometryImportSemanticPlanInput,
  GeometryImportSemanticPlanResult,
} from "./contract";
import { buildSemanticPlan } from "./candidate-mapper";
import { diagnostic, failure, hasErrors } from "./diagnostics";
import { buildIndexes } from "./entity-index";
import { checkComplexity, geometryImportLimits } from "./limits";
import { resolveReferences } from "./reference-resolver";
import { validateCanonicalGir } from "./validation";

export { geometryImportLimits };

export function createGeometryImportSemanticPlan(
  input: CreateGeometryImportSemanticPlanInput,
): GeometryImportSemanticPlanResult {
  const validation = validateCanonicalGir(input.canonicalGir);
  if (validation.status === "unsupported-version") {
    return failure([
      diagnostic("geometry-import.unsupported-gir-version", "error", {
        path: "/schema_version",
      }),
    ]);
  }
  if (validation.status === "invalid") {
    return failure(
      validation.issuePaths.length === 0
        ? [diagnostic("geometry-import.invalid-gir", "error")]
        : validation.issuePaths.map((path) =>
            diagnostic("geometry-import.invalid-gir", "error", { path }),
          ),
    );
  }

  const diagnostics = [...checkComplexity(validation.value)];
  if (hasErrors(diagnostics)) {
    return failure(diagnostics);
  }
  const indexes = buildIndexes(validation.value, diagnostics);
  if (hasErrors(diagnostics)) {
    return failure(diagnostics);
  }
  const references = resolveReferences(indexes, diagnostics);
  if (hasErrors(diagnostics)) {
    return failure(diagnostics);
  }
  return buildSemanticPlan(
    validation.value,
    input,
    indexes,
    references,
    diagnostics,
  );
}
