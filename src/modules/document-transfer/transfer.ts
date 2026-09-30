import {
  readBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
  type ValidationIssue,
} from "../../core/public";

export const tutorBoardDocumentMediaType =
  "application/vnd.tutorboard.document+json" as const;
export const maximumTutorBoardDocumentImportBytes = 10 * 1024 * 1024;

export type TutorBoardDocumentImportResult =
  | {
      readonly document: BoardDocument;
      readonly migrated: boolean;
      readonly sourceSchemaVersion: string;
      readonly status: "ok";
    }
  | {
      readonly code:
        | "document-import.asset-bundle-required"
        | "document-import.incompatible-object"
        | "document-import.incompatible-schema"
        | "document-import.invalid-document"
        | "document-import.invalid-json"
        | "document-import.too-large";
      readonly message: string;
      readonly objectKinds?: readonly string[];
      readonly schemaVersion?: unknown;
      readonly issues?: readonly ValidationIssue[];
      readonly status: "error";
    };

export type TutorBoardDocumentExportResult =
  | {
      readonly bytes: number;
      readonly filename: string;
      readonly json: string;
      readonly mediaType: typeof tutorBoardDocumentMediaType;
      readonly status: "ok";
    }
  | {
      readonly code: "document-export.invalid-document";
      readonly issues: readonly ValidationIssue[];
      readonly message: string;
      readonly status: "error";
    }
  | {
      readonly code: "document-export.asset-bundle-required";
      readonly message: string;
      readonly status: "error";
    };

function sourceSchemaVersion(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    typeof value.schemaVersion === "string"
  ) {
    return value.schemaVersion;
  }
  return null;
}

function exceedsImportLimit(json: string): boolean {
  return (
    json.length > maximumTutorBoardDocumentImportBytes ||
    new TextEncoder().encode(json).byteLength >
      maximumTutorBoardDocumentImportBytes
  );
}

function filenamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized.length === 0 ? "board" : normalized;
}

function containsMediaAssets(document: BoardDocument): boolean {
  return Object.values(document.objects).some(
    (object) => object?.kind === "media.asset",
  );
}

export function importTutorBoardDocument(
  json: string,
): TutorBoardDocumentImportResult {
  if (exceedsImportLimit(json)) {
    return {
      code: "document-import.too-large",
      message: "The selected document exceeds the 10 MiB import limit.",
      status: "error",
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    return {
      code: "document-import.invalid-json",
      message: "The selected file is not valid JSON.",
      status: "error",
    };
  }
  return importTutorBoardDocumentValue(value);
}

export function importTutorBoardDocumentValue(
  value: unknown,
): TutorBoardDocumentImportResult {
  const sourceVersion = sourceSchemaVersion(value);
  const read = readBoardDocument(value);
  switch (read.status) {
    case "ok":
      if (containsMediaAssets(read.document)) {
        return {
          code: "document-import.asset-bundle-required",
          message:
            "Asset-backed documents require the portable TutorBoard bundle format.",
          status: "error",
        };
      }
      return {
        document: read.document,
        migrated:
          sourceVersion !== null &&
          sourceVersion !== read.document.schemaVersion,
        sourceSchemaVersion: sourceVersion ?? read.document.schemaVersion,
        status: "ok",
      };
    case "incompatible-schema":
      return {
        code: "document-import.incompatible-schema",
        message: "The document schema version is not supported.",
        schemaVersion: read.schemaVersion,
        status: "error",
      };
    case "incompatible-object":
      return {
        code: "document-import.incompatible-object",
        message: "The document contains unsupported object kinds.",
        objectKinds: read.objectKinds,
        status: "error",
      };
    case "invalid-document":
      return {
        code: "document-import.invalid-document",
        issues: read.issues,
        message: "The document does not satisfy the TutorBoard schema.",
        status: "error",
      };
  }
}

export function exportTutorBoardDocument(
  document: BoardDocument,
): TutorBoardDocumentExportResult {
  if (containsMediaAssets(document)) {
    return {
      code: "document-export.asset-bundle-required",
      message:
        "Asset-backed documents require the portable TutorBoard bundle format.",
      status: "error",
    };
  }
  const serialized = serializeBoardDocument(document);
  if (!serialized.ok) {
    return {
      code: "document-export.invalid-document",
      issues: serialized.issues,
      message: "The document cannot be exported because it is invalid.",
      status: "error",
    };
  }
  return {
    bytes: new TextEncoder().encode(serialized.json).byteLength,
    filename: `${filenamePart(document.title)}.tutorboard.json`,
    json: serialized.json,
    mediaType: tutorBoardDocumentMediaType,
    status: "ok",
  };
}
