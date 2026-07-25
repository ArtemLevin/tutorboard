import type { GeometryImportDiagnostic } from "./contract";
import { diagnostic } from "./diagnostics";
import type {
  CanonicalGirConstraint,
  CanonicalGirConstructionStep,
  CanonicalGirObject,
  CanonicalGirScene,
} from "./validation";

export type ObjectKind = CanonicalGirObject["type"];

export type IndexedEntity<T> = {
  readonly index: number;
  readonly value: T;
};

export interface EntityIndexes {
  readonly constraintsById: ReadonlyMap<
    string,
    IndexedEntity<CanonicalGirConstraint>
  >;
  readonly objectsById: ReadonlyMap<string, IndexedEntity<CanonicalGirObject>>;
  readonly stepsById: ReadonlyMap<
    string,
    IndexedEntity<CanonicalGirConstructionStep>
  >;
}

function buildIndex<T extends { readonly id: string }>(
  entities: readonly T[],
  duplicateCode:
    | "geometry-import.duplicate-constraint-id"
    | "geometry-import.duplicate-construction-step-id"
    | "geometry-import.duplicate-object-id",
  pathPrefix: string,
  diagnostics: GeometryImportDiagnostic[],
): ReadonlyMap<string, IndexedEntity<T>> {
  const result = new Map<string, IndexedEntity<T>>();
  entities.forEach((value, index) => {
    const existing = result.get(value.id);
    if (existing !== undefined) {
      diagnostics.push(
        diagnostic(duplicateCode, "error", {
          path: `${pathPrefix}/${index}/id`,
          girEntityId: value.id,
          relatedGirEntityIds: [existing.value.id],
        }),
      );
      return;
    }
    result.set(value.id, { index, value });
  });
  return result;
}

export function buildIndexes(
  gir: CanonicalGirScene,
  diagnostics: GeometryImportDiagnostic[],
): EntityIndexes {
  return {
    objectsById: buildIndex(
      gir.objects,
      "geometry-import.duplicate-object-id",
      "/objects",
      diagnostics,
    ),
    constraintsById: buildIndex(
      gir.constraints,
      "geometry-import.duplicate-constraint-id",
      "/constraints",
      diagnostics,
    ),
    stepsById: buildIndex(
      gir.construction_steps,
      "geometry-import.duplicate-construction-step-id",
      "/construction_steps",
      diagnostics,
    ),
  };
}
