import Dexie, { type Table } from "dexie";
import { z } from "zod";

import {
  deserializeBoardDocument,
  localDiagnosticSchemaVersion,
  localRevisionId,
  serializeBoardDocument,
  type BoardDocument,
  type BoardDocumentComputation,
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
export const localRevisionRetention = {
  maximumRevisions: 8,
  maximumJsonBytes: 32 * 1024 * 1024,
} as const;

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

class LifecycleBatchFailure extends Error {
  constructor(readonly result: SaveBoardDocumentResult) {
    super("Lifecycle batch was rolled back.");
  }
}

export class DexieBoardDocumentRepository implements BoardDocumentRepository {
  readonly #database: TutorBoardLocalDatabase;
  readonly #documentComputation: BoardDocumentComputation | null;

  constructor(
    databaseName = defaultTutorBoardDatabaseName,
    documentComputation: BoardDocumentComputation | null = null,
  ) {
    this.#database = new TutorBoardLocalDatabase(databaseName);
    this.#documentComputation = documentComputation;
  }

  prepareSave(document: BoardDocument): void {
    this.#documentComputation?.prepareSerialization?.(document);
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
          if (
            rawHead === undefined &&
            (await this.#database.revisions
              .where("documentId")
              .equals(documentId)
              .count()) === 0
          ) {
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
              : await this.#database.revisions.get(validHead.currentRevisionId);
          const current =
            currentRaw === undefined
              ? null
              : readValidRevision(documentId, currentRaw);
          if (current !== null) {
            return {
              status: "restored",
              document: current.document,
              revisionId: localRevisionId(current.record.revisionId),
            };
          }

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

          let fallback: ValidRevision | undefined;
          await this.#revisionsDescending(documentId)
            .until(() => fallback !== undefined)
            .each((item) => {
              const valid = readValidRevision(documentId, item);
              if (valid !== null) {
                fallback = valid;
              }
            });
          const newest = await this.#revisionsDescending(documentId).first();
          if (fallback !== undefined) {
            const repairedHead: StoredDocumentHead = {
              currentRevisionId: fallback.record.revisionId,
              documentId,
              lastGoodRevisionId: fallback.record.revisionId,
              nextSequence:
                Math.max(
                  Math.ceil(newest?.sequence ?? 0),
                  fallback.record.sequence,
                  (validHead?.nextSequence ?? 1) - 1,
                ) + 1,
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
    const priority = input.priority ?? "background";
    const serialized =
      this.#documentComputation === null
        ? serializeBoardDocument(input.document)
        : priority === "lifecycle"
          ? this.#documentComputation.serializeSync(input.document)
          : await this.#documentComputation.serialize(
              input.document,
              "background",
            );
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
          return this.#writeRevision(input, serialized.json);
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

  async saveLifecycleBatch(
    inputs: readonly SaveBoardDocumentInput[],
  ): Promise<readonly SaveBoardDocumentResult[]> {
    if (inputs.length === 0) return [];
    const serialized = inputs.map((input) =>
      this.#documentComputation === null
        ? serializeBoardDocument(input.document)
        : this.#documentComputation.serializeSync(input.document),
    );
    const invalid = serialized.find((item) => !item.ok);
    if (invalid !== undefined && !invalid.ok) {
      return inputs.map(() => ({
        status: "invalid-document",
        issues: invalid.issues,
      }));
    }
    if (inputs.some((input) => input.document.id !== inputs[0]!.document.id)) {
      return inputs.map(() => ({
        status: "failure",
        code: "persistence.batch-document-mismatch",
        message: "Lifecycle batch must belong to one document.",
      }));
    }
    try {
      return await this.#database.transaction(
        "rw",
        this.#database.documents,
        this.#database.revisions,
        this.#database.recoveries,
        async () => {
          let expectedRevisionId = inputs[0]!.expectedRevisionId;
          const results: SaveBoardDocumentResult[] = [];
          for (let index = 0; index < inputs.length; index += 1) {
            const item = serialized[index]!;
            if (!item.ok) throw new Error("Invalid lifecycle serialization");
            const result = await this.#writeRevision(
              { ...inputs[index]!, expectedRevisionId },
              item.json,
            );
            if (result.status !== "saved")
              throw new LifecycleBatchFailure(result);
            expectedRevisionId = result.revisionId;
            results.push(result);
          }
          return results;
        },
      );
    } catch (error) {
      const result: SaveBoardDocumentResult =
        error instanceof LifecycleBatchFailure
          ? error.result
          : {
              status: "failure",
              code: "persistence.save-failed",
              message: unknownMessage(error),
            };
      return inputs.map(() => result);
    }
  }

  async #writeRevision(
    input: SaveBoardDocumentInput,
    json: string,
  ): Promise<SaveBoardDocumentResult> {
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
        duplicate.data.serializedDocument === json
      ) {
        return {
          duplicate: true,
          revisionId: localRevisionId(duplicate.data.revisionId),
          status: "saved",
        };
      }
      return {
        code: "persistence.operation-id-collision",
        message: "Persistence operation ID was reused for different data.",
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
      serializedDocument: json,
    };
    // Compact legacy bloat before allocating another full snapshot. Keep the
    // current/recovery anchor; all deletes and the new write share this CAS tx.
    if (
      (await this.#database.revisions
        .where("documentId")
        .equals(input.document.id)
        .count()) > localRevisionRetention.maximumRevisions
    ) {
      await this.#pruneRevisions(input.document.id, [
        head?.currentRevisionId,
        head?.lastGoodRevisionId,
      ]);
    }
    await this.#database.revisions.add(revision);
    await this.#database.documents.put({
      currentRevisionId: revisionId,
      documentId: input.document.id,
      lastGoodRevisionId: revisionId,
      nextSequence: sequence + 1,
      updatedAt: input.savedAt,
    });
    await this.#database.recoveries.delete(input.document.id);
    await this.#pruneRevisions(input.document.id, [
      revisionId,
      head?.currentRevisionId,
      head?.lastGoodRevisionId,
    ]);
    return { duplicate: false, revisionId, status: "saved" };
  }

  #revisionsDescending(documentId: DocumentId) {
    return this.#database.revisions
      .where("[documentId+sequence]")
      .between(
        [documentId, 0],
        [documentId, Number.MAX_SAFE_INTEGER],
        true,
        true,
      )
      .reverse();
  }

  async #pruneRevisions(
    documentId: DocumentId,
    protectedIds: readonly (string | null | undefined)[],
  ): Promise<void> {
    const protectedSet = new Set(
      protectedIds.filter((id): id is string => typeof id === "string"),
    );
    let count = 0,
      bytes = 0;
    let cutoff: number | null = null;
    await this.#revisionsDescending(documentId)
      .until(() => cutoff !== null)
      .each((revision) => {
        const estimatedBytes =
          typeof revision.serializedDocument === "string"
            ? revision.serializedDocument.length * 2
            : 0;
        if (
          count >= 2 &&
          (count >= localRevisionRetention.maximumRevisions ||
            bytes + estimatedBytes > localRevisionRetention.maximumJsonBytes)
        ) {
          cutoff = revision.sequence;
          return;
        }
        count += 1;
        bytes += estimatedBytes;
      });
    if (cutoff === null) return;
    // Read keys only for the discarded suffix; never materialize its JSON.
    // Keep the old head/lastGood even if recovery placed it outside the window.
    const keys = await this.#database.revisions
      .where("[documentId+sequence]")
      .between([documentId, Dexie.minKey], [documentId, cutoff], true, true)
      .primaryKeys();
    await this.#database.revisions.bulkDelete(
      keys.filter((key) => !protectedSet.has(key)),
    );
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
  documentComputation: BoardDocumentComputation | null = null,
): DexieBoardDocumentRepository {
  return new DexieBoardDocumentRepository(databaseName, documentComputation);
}
