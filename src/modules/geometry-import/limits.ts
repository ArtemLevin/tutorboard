import type { GeometryImportDiagnostic } from "./contract";
import { diagnostic } from "./diagnostics";
import type { CanonicalGirScene } from "./validation";

export const geometryImportLimits = {
  maxConstraints: 8_192,
  maxConstructionSteps: 4_096,
  maxEntityIdCodePoints: 256,
  maxLabelCodePoints: 4_096,
  maxObjects: 4_096,
  maxReferences: 65_536,
} as const;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function checkComplexity(
  gir: CanonicalGirScene,
): readonly GeometryImportDiagnostic[] {
  const diagnostics: GeometryImportDiagnostic[] = [];
  const collections = [
    [gir.objects.length, geometryImportLimits.maxObjects, "/objects"],
    [gir.constraints.length, geometryImportLimits.maxConstraints, "/constraints"],
    [
      gir.construction_steps.length,
      geometryImportLimits.maxConstructionSteps,
      "/construction_steps",
    ],
  ] as const;

  for (const [actual, maximum, path] of collections) {
    if (actual > maximum) {
      diagnostics.push(
        diagnostic("geometry-import.complexity-limit-exceeded", "error", {
          path,
        }),
      );
    }
  }

  for (const [category, entities] of [
    ["objects", gir.objects],
    ["constraints", gir.constraints],
    ["construction_steps", gir.construction_steps],
  ] as const) {
    entities.forEach((entity, index) => {
      const length = codePointLength(entity.id);
      if (length === 0) {
        diagnostics.push(
          diagnostic("geometry-import.invalid-gir", "error", {
            path: `/${category}/${index}/id`,
          }),
        );
      } else if (length > geometryImportLimits.maxEntityIdCodePoints) {
        diagnostics.push(
          diagnostic("geometry-import.complexity-limit-exceeded", "error", {
            path: `/${category}/${index}/id`,
            girEntityId: entity.id,
          }),
        );
      }
    });
  }

  gir.objects.forEach((object, index) => {
    if (
      object.type === "point" &&
      object.label !== null &&
      object.label !== undefined &&
      codePointLength(object.label) > geometryImportLimits.maxLabelCodePoints
    ) {
      diagnostics.push(
        diagnostic("geometry-import.complexity-limit-exceeded", "error", {
          path: `/objects/${index}/label`,
          girEntityId: object.id,
        }),
      );
    }
    if (
      object.type === "label" &&
      codePointLength(object.text) > geometryImportLimits.maxLabelCodePoints
    ) {
      diagnostics.push(
        diagnostic("geometry-import.complexity-limit-exceeded", "error", {
          path: `/objects/${index}/text`,
          girEntityId: object.id,
        }),
      );
    }
  });

  return diagnostics;
}
