import type { BoardDocument } from "../document";
import type { JsonValue } from "../json";
import {
  readBoardDocument,
  type BoardDocumentReadResult,
} from "../validation/read";
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

export function deserializeBoardDocument(
  json: string,
): BoardDocumentDeserializationResult {
  try {
    return readBoardDocument(JSON.parse(json) as unknown);
  } catch {
    return { status: "invalid-json", raw: json };
  }
}
