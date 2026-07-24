import Dexie, { type Table } from "dexie";
import { z } from "zod";

import {
  deserializeBoardDocument,
  localDiagnosticSchemaVersion,
  localRevisionId,
  serializeBoardDocument,
  type BoardDocument,
  type BoardDocumentDiagnosticBundle,
  type BoardDocumentLoadResult,
  type BoardDocumentRecoveryReason,
  type BoardDocumentRecoveryRecord,
  type BoardDocumentRepository,
  type DocumentId,
  type LocalRevisionId,
  type SaveBoardDocumentInput,
  type SaveBoardDocumentResult,
} from "../../core/public";

export const defaultTutorBoardDatabaseName = "tutorboard-local-v1";

interface StoredDocumentHead {
  readonly currentRevisionId: string | null;
  readonly documentId: string;
  readonly lastGoodRevisionId: string | null;
  readonly nextSequence: number;
  readonly updatedAt: string;
}

interface StoredDocumentRevision {
  readonly documentId: string;
  readonly documentSchemaVersion: string;
  readonly operationId: string;
  readonly revisionId: string;
  readonly savedAt: string;
  readonly sequence: number;
  readonly serializedDocument: string;
}

interface StoredRecoveryRecord {
  readonly capturedAt: string;
  readonly documentId: string;
  readonly failedRevisionId: string | null;
  readonly issueCodes: readonly string[];
  readonly raw: string;
  readonly reason: BoardDocumentRecoveryReason;
}

const isoTimestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Expected an ISO-compatible timestamp.",
  );
const storedDocumentHeadSchema = z
  .object({
    currentRevisionId: z.string().min(1).max(256).nullable(),
    documentId: z.string().min(1).max(256),
    lastGoodRevisionId: z.string().min(1).max(256).nullable(),
    nextSequence: z.number().int().positive(),
    updatedAt: isoTimestampSchema,
  })
  .strict();
const storedRevisionSchema = z
  .object({
    documentId: z.string().min(1).max(256),
    documentSchemaVersion: z.string().min(1).max(64),
    operationId: z.string().min(1).max(256),
    revisionId: z.string().min(1).max(256),
    savedAt: isoTimestampSchema,
    sequence: z.number().int().positive(),
    serializedDocument: z.string(),
  })
  .strict();
const recoveryReasonSchema = z.enum([
  "document-id-mismatch",
  "incompatible-object",
  "incompatible-schema",
  "invalid-document",
  "invalid-json",
  "invalid-storage-record",
  "missing-current-revision",
  "missing-head",
]);
const storedRecoverySchema = z
  .object({
    capturedAt: isoTimestampSchema,
    documentId: z.string().min(1).max(256),
    failedRevisionId: z.string().min(1).max(256).nullable(),
    issueCodes: z.array(z.string()),
    raw: z.string(),
    reason: recoveryReasonSchema,
  })
  .strict();

interface LocalPersistenceMigration {
  readonly stores: {
    readonly documents: string;
    readonly recoveries: string;
    readonly revisions: string;
  };
  readonly version: number;
}

export const localPersistenceMigrations: readonly LocalPersistenceMigration[] =
  [
    {
      version: 1,
      stores: {
        documents: "documentId",
        revisions:
          "revisionId,&operationId,documentId,[documentId+sequence],savedAt",
        recoveries: "documentId",
      },
    },
  ];

class TutorBoardLocalDatabase extends Dexie {
  documents!: Table<StoredDocumentHead, string>;
  recoveries!: Table<StoredRecoveryRecord, string>;
  revisions!: Table<StoredDocumentRevision, string>;

  constructor(name: string) {
    super(name);
    for (const migration of localPersistenceMigrations) {
      this.version(migration.version).stores(migration.stores);
    }
  }
}

interface ValidRevision {
  readonly document: BoardDocument;
  readonly record: StoredDocumentRevision;
}

function unknownMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown persistence failure.";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable storage record]";
  }
}

function recoveryFromSerializedRevision(
  documentId: DocumentId,
  revision: StoredDocumentRevision,
  capturedAt: string,
): BoardDocumentRecoveryRecord | null {
  const read = deserializeBoardDocument(revision.serializedDocument);
  if (read.status === "ok") {
    if (read.document.id === documentId) {
      return null;
    }
    return {
      capturedAt,
      documentId,
      failedRevisionId: localRevisionId(revision.revisionId),
      issueCodes: [`stored-document-id:${read.document.id}`],
      raw: revision.serializedDocument,
      reason: "document-id-mismatch",
    };
  }
  if (read.status === "invalid-json") {
    return {
      capturedAt,
      documentId,
      failedRevisionId: localRevisionId(revision.revisionId),
      issueCodes: [],
      raw: read.raw,
      reason: "invalid-json",
    };
  }
  if (read.status === "invalid-document") {
    return {
      capturedAt,
      documentId,
      failedRevisionId: localRevisionId(revision.revisionId),
      issueCodes: read.issues.map((item) => item.code),
      raw: revision.serializedDocument,
      reason: "invalid-document",
    };
  }
  if (read.status === "incompatible-object") {
    return {
      capturedAt,
      documentId,
      failedRevisionId: localRevisionId(revision.revisionId),
      issueCodes: read.objectKinds.map((kind) => `object-kind:${kind}`),
      raw: revision.serializedDocument,
      reason: "incompatible-object",
    };
  }
  return {
    capturedAt,
    documentId,
    failedRevisionId: localRevisionId(revision.revisionId),
    issueCodes: [`schema-version:${String(read.schemaVersion)}`],
    raw: revision.serializedDocument,
    reason: "incompatible-schema",
  };
}

function readValidRevision(
  documentId: DocumentId,
  raw: unknown,
): ValidRevision | null {
  const parsed = storedRevisionSchema.safeParse(raw);
  if (!parsed.success || parsed.data.documentId !== documentId) {
    return null;
  }
  const read = deserializeBoardDocument(parsed.data.serializedDocument);
  return read.status === "ok" && read.document.id === documentId
    ? { document: read.document, record: parsed.data }
    : null;
}

function makeInvalidStorageRecovery(
  documentId: DocumentId,
  raw: unknown,
  capturedAt: string,
  failedRevisionId: LocalRevisionId | null,
  reason:
    "invalid-storage-record" | "missing-current-revision" | "missing-head",
): BoardDocumentRecoveryRecord {
  return {
    capturedAt,
    documentId,
    failedRevisionId,
    issueCodes: [],
    raw: safeJson(raw),
    reason,
  };
}

export class DexieBoardDocumentRepository implements BoardDocumentRepository {
  readonly #database: TutorBoardLocalDatabase;

  constructor(databaseName = defaultTutorBoardDatabaseName) {
    this.#database = new TutorBoardLocalDatabase(databaseName);
  }

  close(): void {
    this.#database.close();
  }

  async deleteDatabase(): Promise<void> {
    await this.#database.delete();
  }

  async load(documentId: DocumentId): Promise<BoardDocumentLoadResult> {
    try {
      return await this.#database.transaction(
        "rw",
        this.#database.documents,
        this.#database.revisions,
        this.#database.recoveries,
        async () => {
          const capturedAt = new Date().toISOString();
          const rawHead = await this.#database.documents.get(documentId);
          const rawRevisions = await this.#database.revisions
            .where("documentId")
            .equals(documentId)
            .toArray();
          rawRevisions.sort((left, right) => right.sequence - left.sequence);

          if (rawHead === undefined && rawRevisions.length === 0) {
            return { status: "empty" };
          }

          const parsedHead = storedDocumentHeadSchema.safeParse(rawHead);
          const validHead =
            parsedHead.success && parsedHead.data.documentId === documentId
              ? parsedHead.data
              : null;
          const currentRevisionId =
            validHead?.currentRevisionId === null || validHead === null
              ? null
              : localRevisionId(validHead.currentRevisionId);
          const currentRaw =
            validHead?.currentRevisionId === null || validHead === null
              ? undefined
              : rawRevisions.find(
                  (item) => item.revisionId === validHead.currentRevisionId,
                );

          const recovery: BoardDocumentRecoveryRecord | null =
            validHead === null
              ? makeInvalidStorageRecovery(
                  documentId,
                  rawHead,
                  capturedAt,
                  null,
                  rawHead === undefined
                    ? "missing-head"
                    : "invalid-storage-record",
                )
              : currentRaw === undefined
                ? makeInvalidStorageRecovery(
                    documentId,
                    validHead,
                    capturedAt,
                    currentRevisionId,
                    "missing-current-revision",
                  )
                : (() => {
                    const parsedCurrent =
                      storedRevisionSchema.safeParse(currentRaw);
                    return parsedCurrent.success
                      ? recoveryFromSerializedRevision(
                          documentId,
                          parsedCurrent.data,
                          capturedAt,
                        )
                      : makeInvalidStorageRecovery(
                          documentId,
                          currentRaw,
                          capturedAt,
                          currentRevisionId,
                          "invalid-storage-record",
                        );
                  })();

          const current =
            currentRaw === undefined
              ? null
              : readValidRevision(documentId, currentRaw);
          if (current !== null && recovery === null) {
            return {
              document: current.document,
              revisionId: localRevisionId(current.record.revisionId),
              status: "restored",
            };
          }

          const fallback = rawRevisions
            .map((item) => readValidRevision(documentId, item))
            .find((item): item is ValidRevision => item !== null);
          if (fallback !== undefined) {
            const repairedHead: StoredDocumentHead = {
              currentRevisionId: fallback.record.revisionId,
              documentId,
              lastGoodRevisionId: fallback.record.revisionId,
              nextSequence:
                Math.max(0, ...rawRevisions.map((item) => item.sequence)) + 1,
              updatedAt: capturedAt,
            };
            const activeRecovery =
              recovery ??
              makeInvalidStorageRecovery(
                documentId,
                rawHead,
                capturedAt,
                currentRevisionId,
                "invalid-storage-record",
              );
            await this.#database.documents.put(repairedHead);
            await this.#database.recoveries.put({
              ...activeRecovery,
              documentId,
              failedRevisionId: activeRecovery.failedRevisionId,
              issueCodes: [...activeRecovery.issueCodes],
            });
            return {
              document: fallback.document,
              recovery: activeRecovery,
              revisionId: localRevisionId(fallback.record.revisionId),
              status: "recovered",
            };
          }

          const activeRecovery =
            recovery ??
            makeInvalidStorageRecovery(
              documentId,
              rawHead,
              capturedAt,
              currentRevisionId,
              "invalid-storage-record",
            );
          await this.#database.recoveries.put({
            ...activeRecovery,
            documentId,
            failedRevisionId: activeRecovery.failedRevisionId,
            issueCodes: [...activeRecovery.issueCodes],
          });
          return {
            currentRevisionId,
            recovery: activeRecovery,
            status: "recovery-required",
          };
        },
      );
    } catch (error) {
      return {
        code: "persistence.load-failed",
        message: unknownMessage(error),
        status: "failure",
      };
    }
  }

  async save(input: SaveBoardDocumentInput): Promise<SaveBoardDocumentResult> {
    const serialized = serializeBoardDocument(input.document);
    if (!serialized.ok) {
      return {
        issues: serialized.issues,
        status: "invalid-document",
      };
    }

    try {
      return await this.#database.transaction(
        "rw",
        this.#database.documents,
        this.#database.revisions,
        this.#database.recoveries,
        async () => {
          const rawHead = await this.#database.documents.get(input.document.id);
          const parsedHead = storedDocumentHeadSchema.safeParse(rawHead);
          if (rawHead !== undefined && !parsedHead.success) {
            return {
              code: "persistence.head-invalid",
              message: "Stored document head is invalid and must be recovered.",
              status: "failure",
            };
          }
          const head = parsedHead.success ? parsedHead.data : null;

          const duplicateRaw = await this.#database.revisions
            .where("operationId")
            .equals(input.operationId)
            .first();
          if (duplicateRaw !== undefined) {
            const duplicate = storedRevisionSchema.safeParse(duplicateRaw);
            if (
              duplicate.success &&
              duplicate.data.documentId === input.document.id &&
              duplicate.data.serializedDocument === serialized.json
            ) {
              return {
                duplicate: true,
                revisionId: localRevisionId(duplicate.data.revisionId),
                status: "saved",
              };
            }
            return {
              code: "persistence.operation-id-collision",
              message:
                "Persistence operation ID was reused for different data.",
              status: "failure",
            };
          }
          const currentRevisionId =
            head?.currentRevisionId === null || head === null
              ? null
              : localRevisionId(head.currentRevisionId);
          if (currentRevisionId !== input.expectedRevisionId) {
            return { currentRevisionId, status: "conflict" };
          }

          const revisionId = localRevisionId(`revision:${input.operationId}`);
          const sequence = head?.nextSequence ?? 1;
          const revision: StoredDocumentRevision = {
            documentId: input.document.id,
            documentSchemaVersion: input.document.schemaVersion,
            operationId: input.operationId,
            revisionId,
            savedAt: input.savedAt,
            sequence,
            serializedDocument: serialized.json,
          };
          await this.#database.revisions.add(revision);
          await this.#database.documents.put({
            currentRevisionId: revisionId,
            documentId: input.document.id,
            lastGoodRevisionId: revisionId,
            nextSequence: sequence + 1,
            updatedAt: input.savedAt,
          });
          await this.#database.recoveries.delete(input.document.id);
          return { duplicate: false, revisionId, status: "saved" };
        },
      );
    } catch (error) {
      return {
        code: "persistence.save-failed",
        message: unknownMessage(error),
        status: "failure",
      };
    }
  }

  async diagnose(
    documentId: DocumentId,
    generatedAt: string,
  ): Promise<BoardDocumentDiagnosticBundle> {
    const [head, revisions, recovery] = await Promise.all([
      this.#database.documents.get(documentId),
      this.#database.revisions.where("documentId").equals(documentId).toArray(),
      this.#database.recoveries.get(documentId),
    ]);
    revisions.sort((left, right) => right.sequence - left.sequence);
    const validatedRecovery = storedRecoverySchema.safeParse(recovery);
    return {
      documentId,
      generatedAt,
      head: head ?? null,
      recovery:
        recovery === undefined
          ? null
          : validatedRecovery.success
            ? validatedRecovery.data
            : { invalidStorageRecord: recovery },
      revisions,
      schemaVersion: localDiagnosticSchemaVersion,
    };
  }
}

export function createDexieBoardDocumentRepository(
  databaseName = defaultTutorBoardDatabaseName,
): DexieBoardDocumentRepository {
  return new DexieBoardDocumentRepository(databaseName);
}
