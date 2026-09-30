import type { BoardDocument } from "../document";
import type { JsonValue } from "../json";
import {
  readBoardDocument,
  type BoardDocumentReadResult,
} from "../validation/read";
import {
  boardDocumentSchema14,
  boardDocumentSchema15,
} from "../validation/schema";
import {
  validateBoardDocument,
  type ValidationIssue,
} from "../validation/validate";

export type BoardDocumentSerializationResult =
  | {
      readonly json: string;
      readonly ok: true;
    }
  | {
      readonly issues: readonly ValidationIssue[];
      readonly ok: false;
    };

export type BoardDocumentDeserializationResult =
  | BoardDocumentReadResult
  | {
      readonly raw: string;
      readonly status: "invalid-json";
    };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function serializeBoardDocument(
  document: BoardDocument,
): BoardDocumentSerializationResult {
  const validation = validateBoardDocument(document);
  if (!validation.valid) {
    return { ok: false, issues: validation.issues };
  }

  return {
    ok: true,
    json: JSON.stringify(
      canonicalize(validation.document as unknown as JsonValue),
    ),
  };
}

/**
 * Canonical 1.4 projection used only to verify pre-1.5 server/cache digests.
 * media.asset has no 1.4 representation and therefore cannot be projected.
 */
/**
 * Canonical 1.5 projection used to verify pre-1.6 server/cache digests.
 * Single-sample Vector Ink dots have no 1.5 representation.
 */
export function serializeBoardDocument15ForCompatibility(
  document: BoardDocument,
): string | null {
  const validation = validateBoardDocument(document);
  if (!validation.valid) return null;

  const legacy = boardDocumentSchema15.safeParse({
    ...validation.document,
    schemaVersion: "1.5",
  });
  if (!legacy.success) return null;

  return JSON.stringify(canonicalize(legacy.data as unknown as JsonValue));
}

export function serializeBoardDocument14ForCompatibility(
  document: BoardDocument,
): string | null {
  const validation = validateBoardDocument(document);
  if (!validation.valid) return null;
  if (
    Object.values(validation.document.objects).some(
      (object) => object?.kind === "media.asset",
    )
  ) {
    return null;
  }

  const legacy = boardDocumentSchema14.safeParse({
    ...validation.document,
    schemaVersion: "1.4",
  });
  if (!legacy.success) return null;

  return JSON.stringify(canonicalize(legacy.data as unknown as JsonValue));
}

export function deserializeBoardDocument(
  json: string,
): BoardDocumentDeserializationResult {
  try {
    return readBoardDocument(JSON.parse(json) as unknown);
  } catch {
    return { status: "invalid-json", raw: json };
  }
}
