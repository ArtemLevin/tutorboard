import type { BoardDocument } from "../document";
import type { ValidationIssue } from "./validate";
import { knownBoardObjectKinds } from "./schema";
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

function findUnknownObjectKinds(raw: unknown): readonly string[] {
  if (!isRecord(raw) || !isRecord(raw.objects)) {
    return [];
  }

  const unknownKinds = new Set<string>();
  for (const object of Object.values(raw.objects)) {
    if (
      isRecord(object) &&
      typeof object.kind === "string" &&
      !knownBoardObjectKinds.has(object.kind)
    ) {
      unknownKinds.add(object.kind);
    }
  }

  return [...unknownKinds].sort();
}

export function readBoardDocument(raw: unknown): BoardDocumentReadResult {
  if (isRecord(raw) && "schemaVersion" in raw && raw.schemaVersion !== "0.1") {
    return {
      status: "incompatible-schema",
      raw,
      schemaVersion: raw.schemaVersion,
    };
  }

  const objectKinds = findUnknownObjectKinds(raw);
  if (objectKinds.length > 0) {
    return { status: "incompatible-object", raw, objectKinds };
  }

  const validation = validateBoardDocument(raw);
  return validation.valid
    ? { status: "ok", document: validation.document }
    : { status: "invalid-document", raw, issues: validation.issues };
}
