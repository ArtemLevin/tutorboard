import {
  localDiagnosticSchemaVersion,
  type BoardDocument,
  type DocumentId,
} from "../../core/public";
import {
  importTutorBoardDocument,
  importTutorBoardDocumentValue,
  maximumTutorBoardDocumentImportBytes,
} from "../document-transfer/public";

export const maximumLocalDiagnosticImportRevisions = 1_000;

export type LocalDocumentImportResult =
  | { readonly document: BoardDocument; readonly status: "ok" }
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "error";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDirectDocumentValue(
  value: unknown,
  expectedDocumentId: DocumentId,
): LocalDocumentImportResult {
  const read = importTutorBoardDocumentValue(value);
  if (read.status === "error") {
    return read;
  }
  return {
    document:
      read.document.id === expectedDocumentId
        ? read.document
        : { ...read.document, id: expectedDocumentId },
    status: "ok",
  };
}

export function importLocalDocumentJson(
  json: string,
  expectedDocumentId: DocumentId,
): LocalDocumentImportResult {
  let raw: unknown;
  if (
    json.length > maximumTutorBoardDocumentImportBytes ||
    new TextEncoder().encode(json).byteLength >
      maximumTutorBoardDocumentImportBytes
  ) {
    return {
      code: "persistence.import-too-large",
      message: "Selected file exceeds the 10 MiB import limit.",
      status: "error",
    };
  }
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return {
      code: "persistence.import-invalid-json",
      message: "Selected file is not valid JSON.",
      status: "error",
    };
  }
  const direct = readDirectDocumentValue(raw, expectedDocumentId);
  if (direct.status === "ok") {
    return direct;
  }
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== localDiagnosticSchemaVersion ||
    !Array.isArray(raw.revisions)
  ) {
    return {
      code: direct.code,
      message: direct.message,
      status: "error",
    };
  }
  if (raw.revisions.length > maximumLocalDiagnosticImportRevisions) {
    return {
      code: "persistence.import-too-complex",
      message: "Diagnostic bundle contains too many revisions.",
      status: "error",
    };
  }

  const candidates = raw.revisions.filter(isRecord).sort((left, right) => {
    const leftSequence =
      typeof left.sequence === "number"
        ? left.sequence
        : Number.MIN_SAFE_INTEGER;
    const rightSequence =
      typeof right.sequence === "number"
        ? right.sequence
        : Number.MIN_SAFE_INTEGER;
    return rightSequence - leftSequence;
  });
  for (const candidate of candidates) {
    if (typeof candidate.serializedDocument !== "string") {
      continue;
    }
    const imported = importTutorBoardDocument(candidate.serializedDocument);
    const read =
      imported.status === "ok"
        ? {
            document:
              imported.document.id === expectedDocumentId
                ? imported.document
                : { ...imported.document, id: expectedDocumentId },
            status: "ok" as const,
          }
        : imported;
    if (read.status === "ok") {
      return read;
    }
  }
  return {
    code: "persistence.import-no-compatible-revision",
    message: "Diagnostic bundle contains no compatible board revision.",
    status: "error",
  };
}
