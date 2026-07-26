import {
  localDiagnosticSchemaVersion,
  type BoardDocument,
  type DocumentId,
} from "../../core/public";
import { importTutorBoardDocument } from "../document-transfer/public";

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

function readDirectDocument(
  json: string,
  expectedDocumentId: DocumentId,
): LocalDocumentImportResult {
  const read = importTutorBoardDocument(json);
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
  const direct = readDirectDocument(json, expectedDocumentId);
  if (direct.status === "ok") {
    return direct;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return {
      code: "persistence.import-invalid-json",
      message: "Selected file is not valid JSON.",
      status: "error",
    };
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
    const read = readDirectDocument(
      candidate.serializedDocument,
      expectedDocumentId,
    );
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
