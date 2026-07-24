import { boardDocumentSchemaVersion, type BoardDocument } from "../document";
import { migrateBoardDocument01To02 } from "../migrations";
import type { ValidationIssue } from "./validate";
import { knownBoardObjectKinds, legacyBoardObjectKinds } from "./schema";
import { validateBoardDocument } from "./validate";

export type BoardDocumentReadResult =
  | {
      readonly document: BoardDocument;
      readonly status: "ok";
    }
  | {
      readonly issues: readonly ValidationIssue[];
      readonly raw: unknown;
      readonly status: "invalid-document";
    }
  | {
      readonly objectKinds: readonly string[];
      readonly raw: unknown;
      readonly status: "incompatible-object";
    }
  | {
      readonly raw: unknown;
      readonly schemaVersion: unknown;
      readonly status: "incompatible-schema";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findUnknownObjectKinds(
  raw: unknown,
  knownKinds: ReadonlySet<string>,
): readonly string[] {
  if (!isRecord(raw) || !isRecord(raw.objects)) {
    return [];
  }

  const unknownKinds = new Set<string>();
  for (const object of Object.values(raw.objects)) {
    if (
      isRecord(object) &&
      typeof object.kind === "string" &&
      !knownKinds.has(object.kind)
    ) {
      unknownKinds.add(object.kind);
    }
  }

  return [...unknownKinds].sort();
}

export function readBoardDocument(raw: unknown): BoardDocumentReadResult {
  const schemaVersion = isRecord(raw) ? raw.schemaVersion : undefined;
  if (schemaVersion === "0.1") {
    const objectKinds = findUnknownObjectKinds(raw, legacyBoardObjectKinds);
    if (objectKinds.length > 0) {
      return { status: "incompatible-object", raw, objectKinds };
    }
    const migrated = migrateBoardDocument01To02(raw);
    return migrated.ok
      ? { status: "ok", document: migrated.document }
      : { status: "invalid-document", raw, issues: migrated.issues };
  }

  if (
    schemaVersion !== undefined &&
    schemaVersion !== boardDocumentSchemaVersion
  ) {
    return {
      status: "incompatible-schema",
      raw,
      schemaVersion,
    };
  }

  const objectKinds = findUnknownObjectKinds(raw, knownBoardObjectKinds);
  if (objectKinds.length > 0) {
    return { status: "incompatible-object", raw, objectKinds };
  }

  const validation = validateBoardDocument(raw);
  return validation.valid
    ? { status: "ok", document: validation.document }
    : { status: "invalid-document", raw, issues: validation.issues };
}
