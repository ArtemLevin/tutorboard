import type { JsonValue } from "../../core/public";

import type { components } from "./generated/gir.types";
import { validateGirScene } from "./generated/gir.validators.mjs";

export type CanonicalGirScene = components["schemas"]["GirScene"];
export type CanonicalGirObject = CanonicalGirScene["objects"][number];
export type CanonicalGirConstraint = CanonicalGirScene["constraints"][number];
export type CanonicalGirConstructionStep =
  CanonicalGirScene["construction_steps"][number];

export type CanonicalGirValidation =
  | {
      readonly issuePaths: readonly string[];
      readonly status: "invalid";
    }
  | {
      readonly actualVersion: string;
      readonly status: "unsupported-version";
    }
  | {
      readonly status: "valid";
      readonly value: CanonicalGirScene;
    };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCanonicalGir(
  value: JsonValue,
): CanonicalGirValidation {
  if (isRecord(value) && typeof value.schema_version === "string") {
    if (value.schema_version !== "0.2.0") {
      return {
        status: "unsupported-version",
        actualVersion: value.schema_version,
      };
    }
  }

  if (!validateGirScene(value)) {
    const issuePaths = [...new Set(
      (validateGirScene.errors ?? []).map((error) => error.instancePath),
    )].sort();
    return { status: "invalid", issuePaths };
  }

  return { status: "valid", value: value as CanonicalGirScene };
}
