import Dexie, { type Table } from "dexie";
import { z } from "zod";

import {
  boardCommandSchemaVersion,
  boardCommandSha256,
  canonicalBoardCommandJson,
  readBoardCommandJson,
  serializeBoardCommand,
  type BoardCommandCodecIssue,
} from "../../core/board/commands/codec/public";
import {
  boardCapabilities,
  legacyBoardAccessEpoch,
  legacyBoardCacheScopeId,
  type BoardLocalAccessScope,
} from "../../core/access/public";
import {
  actorId,
  deserializeBoardDocument,
  documentId,
  serializeBoardDocument,
  type BoardCommand,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandConflict,
  type PendingBoardCommandOrderingInput,
  type PendingBoardCommandQueue,
} from "../../core/public";

export const defaultBoardSyncDatabaseName = "tutorboard-sync-v1";

export type PendingCommandQuarantineReason =
  | "access-epoch-changed"
  | "actor-id-mismatch"
  | "command-hash-mismatch"
  | "dependency-gap"
  | "document-id-mismatch"
  | "invalid-command"
  | "invalid-json"
  | "invalid-storage-record"
  | "remote-conflict"
  | "unsupported-command-schema";

export interface QuarantinedPendingBoardCommand {
  readonly actorId: string | null;
  readonly capturedAt: string;
  readonly commandSha256: string | null;
  readonly documentId: string | null;
  readonly detail?: string;
  readonly id: string;
  readonly idempotencyKey: string | null;
  readonly issues: readonly BoardCommandCodecIssue[];
  readonly raw: string;
  readonly reason: PendingCommandQuarantineReason;
  readonly sequence: number | null;
  readonly source: "access-epoch" | "indexeddb-read" | "server-rebase";
}

interface StoredConfirmedHead {
  readonly accessEpoch: string;
  readonly actorId: string;
  readonly cacheScopeId: string;
  readonly capabilities?: readonly string[];
  readonly documentId: string;
  readonly organizationId?: string;
  readonly principalType?: "guest" | "legacy" | "teacher";
  readonly revision: number;
  readonly role: "admin" | "parent" | "student" | "tutor";
  readonly serializedDocument: string;
  readonly sha256: string;
}

interface StoredPendingCommandV1 {
  readonly cacheScopeId?: string;
  readonly commandJson: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
}

interface StoredPendingCommandV2 {
  readonly actorId: string;
  readonly baseRevisionAtCreation: number;
  readonly cacheScopeId: string;
  readonly commandJson: string;
  readonly commandSchemaVersion: typeof boardCommandSchemaVersion;
  readonly commandSha256: string;
  readonly documentId: string;
  readonly enqueuedAt: string;
  readonly idempotencyKey: string;
  readonly lamport: number;
  readonly schemaVersion: "2";
  readonly sequence: number;
}

interface StoredPendingCommandV3 {
  readonly accessEpochAtCreation: string;
  readonly actorId: string;
  readonly baseRevisionAtCreation: number;
  readonly cacheScopeId: string;
  readonly commandJson: string;
  readonly commandSchemaVersion: typeof boardCommandSchemaVersion;
  readonly commandSha256: string;
  readonly documentId: string;
  readonly enqueuedAt: string;
  readonly idempotencyKey: string;
  readonly lamport: number;
  readonly schemaVersion: "3";
  readonly sequence: number;
}

interface StoredActorClock {
  readonly actorId: string;
  readonly cacheScopeId: string;
  readonly documentId: string;
  readonly updatedAt: string;
  readonly value: number;
}

interface StoredQueueSequence {
  readonly cacheScopeId: string;
  readonly documentId: string;
  readonly updatedAt: string;
  readonly value: number;
}

interface StoredQuarantinedCommand extends QuarantinedPendingBoardCommand {
  readonly cacheScopeId: string;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });
const cacheScopeSchema = z.string().min(8).max(512);
const accessEpochSchema = z.string().min(8).max(512);
const capabilitySchema = z.enum(boardCapabilities);
const headSchema = z
  .object({
    accessEpoch: accessEpochSchema,
    actorId: z.string().min(1).max(128),
    cacheScopeId: cacheScopeSchema,
    capabilities: z
      .array(capabilitySchema)
      .max(boardCapabilities.length)
      .optional(),
    documentId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(128).optional(),
    principalType: z.enum(["guest", "legacy", "teacher"]).optional(),
    revision: z.number().int().nonnegative(),
    role: z.enum(["admin", "parent", "student", "tutor"]),
    serializedDocument: z.string(),
    sha256: sha256Schema,
  })
  .strict();
const legacyPendingSchema = z
  .object({
    cacheScopeId: cacheScopeSchema.optional(),
    commandJson: z.string(),
    documentId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    sequence: z.number().int().positive(),
  })
  .strict();
const pendingV2Schema = z
  .object({
    actorId: z.string().min(1).max(128),
    baseRevisionAtCreation: z.number().int().nonnegative(),
    cacheScopeId: cacheScopeSchema,
    commandJson: z.string(),
    commandSchemaVersion: z.literal(boardCommandSchemaVersion),
    commandSha256: sha256Schema,
    documentId: z.string().min(1).max(128),
    enqueuedAt: timestampSchema,
    idempotencyKey: z.string().min(1).max(128),
    lamport: z.number().int().positive(),
    schemaVersion: z.literal("2"),
    sequence: z.number().int().positive(),
  })
  .strict();
const pendingV3Schema = z
  .object({
    accessEpochAtCreation: accessEpochSchema,
    actorId: z.string().min(1).max(128),
    baseRevisionAtCreation: z.number().int().nonnegative(),
    cacheScopeId: cacheScopeSchema,
    commandJson: z.string(),
    commandSchemaVersion: z.literal(boardCommandSchemaVersion),
    commandSha256: sha256Schema,
    documentId: z.string().min(1).max(128),
    enqueuedAt: timestampSchema,
    idempotencyKey: z.string().min(1).max(128),
    lamport: z.number().int().positive(),
    schemaVersion: z.literal("3"),
    sequence: z.number().int().positive(),
  })
  .strict();
const actorClockSchema = z
  .object({
    actorId: z.string().min(1).max(128),
    cacheScopeId: cacheScopeSchema,
    documentId: z.string().min(1).max(128),
    updatedAt: timestampSchema,
    value: z.number().int().nonnegative(),
  })
  .strict();
const queueSequenceSchema = z
  .object({
    cacheScopeId: cacheScopeSchema,
    documentId: z.string().min(1).max(128),
    updatedAt: timestampSchema,
    value: z.number().int().nonnegative(),
  })
  .strict();

class TutorBoardSyncDatabase extends Dexie {
  scopedClocks!: Table<StoredActorClock, [string, string, string]>;
  scopedHeads!: Table<StoredConfirmedHead, [string, string]>;
  scopedPending!: Table<
    StoredPendingCommandV1 | StoredPendingCommandV2 | StoredPendingCommandV3,
    [string, string, number]
  >;
  scopedQuarantine!: Table<StoredQuarantinedCommand, string>;
  scopedSequences!: Table<StoredQueueSequence, [string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      heads: "documentId",
      pending:
        "[documentId+sequence],documentId,&[documentId+idempotencyKey],sequence",
    });
    this.version(2).stores({
      clocks: "[documentId+actorId],documentId,actorId",
      heads: "documentId",
      pending:
        "[documentId+sequence],documentId,&[documentId+idempotencyKey],sequence",
      quarantine:
        "id,documentId,capturedAt,reason,[documentId+sequence],commandSha256",
    });
    this.version(3).stores({
      clocks: "[documentId+actorId],documentId,actorId",
      heads: "documentId",
      pending:
        "[documentId+sequence],documentId,&[documentId+idempotencyKey],sequence",
      quarantine:
        "id,documentId,capturedAt,reason,[documentId+sequence],commandSha256",
      sequences: "documentId",
    });
    this.version(4)
      .stores({
        clocks: "[documentId+actorId],documentId,actorId",
        heads: "documentId",
        pending:
          "[documentId+sequence],documentId,&[documentId+idempotencyKey],sequence",
        quarantine:
          "id,documentId,capturedAt,reason,[documentId+sequence],commandSha256",
        sequences: "documentId",
        scopedClocks:
          "[cacheScopeId+documentId+actorId],cacheScopeId,[cacheScopeId+documentId],actorId",
        scopedHeads:
          "[cacheScopeId+documentId],cacheScopeId,documentId,accessEpoch",
        scopedPending:
          "[cacheScopeId+documentId+sequence],cacheScopeId,[cacheScopeId+documentId],&[cacheScopeId+documentId+idempotencyKey],sequence,accessEpochAtCreation",
        scopedQuarantine:
          "id,cacheScopeId,[cacheScopeId+documentId],capturedAt,reason,[cacheScopeId+documentId+sequence],commandSha256",
        scopedSequences: "[cacheScopeId+documentId],cacheScopeId,documentId",
      })
      .upgrade(async (transaction) => {
        const [heads, pending, clocks, quarantine, sequences] =
          await Promise.all([
            transaction.table("heads").toArray(),
            transaction.table("pending").toArray(),
            transaction.table("clocks").toArray(),
            transaction.table("quarantine").toArray(),
            transaction.table("sequences").toArray(),
          ]);
        if (heads.length > 0) {
          await transaction.table("scopedHeads").bulkPut(
            heads.map((value: Record<string, unknown>) => ({
              ...value,
              accessEpoch: legacyBoardAccessEpoch,
              cacheScopeId: legacyBoardCacheScopeId,
              principalType: "legacy",
            })),
          );
        }
        if (pending.length > 0) {
          await transaction.table("scopedPending").bulkPut(
            pending.map((value: Record<string, unknown>) => ({
              ...value,
              cacheScopeId: legacyBoardCacheScopeId,
            })),
          );
        }
        if (clocks.length > 0) {
          await transaction.table("scopedClocks").bulkPut(
            clocks.map((value: Record<string, unknown>) => ({
              ...value,
              cacheScopeId: legacyBoardCacheScopeId,
            })),
          );
        }
        if (quarantine.length > 0) {
          await transaction.table("scopedQuarantine").bulkPut(
            quarantine.map((value: Record<string, unknown>) => ({
              ...value,
              cacheScopeId: legacyBoardCacheScopeId,
            })),
          );
        }
        if (sequences.length > 0) {
          await transaction.table("scopedSequences").bulkPut(
            sequences.map((value: Record<string, unknown>) => ({
              ...value,
              cacheScopeId: legacyBoardCacheScopeId,
            })),
          );
        }
      });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable pending command record]";
  }
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function documentSha256(document: ConfirmedBoardHead["document"]) {
  const serialized = serializeBoardDocument(document);
  if (!serialized.ok) {
    throw new Error("Cannot hash an invalid confirmed board document.");
  }
  return await sha256Text(serialized.json);
}

interface DecodedPending {
  readonly item: PendingBoardCommand;
  readonly stored: StoredPendingCommandV3;
}

type DecodePendingResult =
  | { readonly status: "ok"; readonly value: DecodedPending }
  | {
      readonly actorId: string | null;
      readonly commandSha256: string | null;
      readonly documentId: string | null;
      readonly idempotencyKey: string | null;
      readonly issues: readonly BoardCommandCodecIssue[];
      readonly raw: string;
      readonly reason: Exclude<
        PendingCommandQuarantineReason,
        "dependency-gap"
      >;
      readonly sequence: number | null;
      readonly status: "error";
    };

function errorResult(
  raw: unknown,
  reason: Exclude<PendingCommandQuarantineReason, "dependency-gap">,
  context: {
    readonly actorId?: string | null;
    readonly commandSha256?: string | null;
    readonly documentId?: string | null;
    readonly idempotencyKey?: string | null;
    readonly issues?: readonly BoardCommandCodecIssue[];
    readonly sequence?: number | null;
  } = {},
): DecodePendingResult {
  return {
    actorId: context.actorId ?? null,
    commandSha256: context.commandSha256 ?? null,
    documentId: context.documentId ?? null,
    idempotencyKey: context.idempotencyKey ?? null,
    issues: context.issues ?? [],
    raw: typeof raw === "string" ? raw : safeJson(raw),
    reason,
    sequence: context.sequence ?? null,
    status: "error",
  };
}

function pendingItem(
  command: BoardCommand,
  stored: StoredPendingCommandV3,
): PendingBoardCommand {
  return {
    accessEpochAtCreation: stored.accessEpochAtCreation,
    command,
    documentId: documentId(stored.documentId),
    idempotencyKey: stored.idempotencyKey,
    order: {
      baseRevisionAtCreation: stored.baseRevisionAtCreation,
      lamport: stored.lamport,
    },
    sequence: stored.sequence,
  };
}

function pendingErrorContext(stored: {
  readonly actorId?: string;
  readonly commandSha256?: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
}) {
  return {
    actorId: stored.actorId ?? null,
    commandSha256: stored.commandSha256 ?? null,
    documentId: stored.documentId,
    idempotencyKey: stored.idempotencyKey,
    sequence: stored.sequence,
  } as const;
}

async function validateStoredCommand(
  stored: StoredPendingCommandV3,
): Promise<DecodePendingResult> {
  const read = readBoardCommandJson(stored.commandJson);
  if (read.status !== "ok") {
    return errorResult(
      stored.commandJson,
      read.status === "invalid-json" ? "invalid-json" : "invalid-command",
      {
        ...pendingErrorContext(stored),
        issues: "issues" in read ? read.issues : [],
      },
    );
  }
  if (read.command.actorId !== stored.actorId) {
    return errorResult(
      stored.commandJson,
      "actor-id-mismatch",
      pendingErrorContext(stored),
    );
  }
  const actualSha256 = await boardCommandSha256(read.command);
  if (actualSha256 !== stored.commandSha256) {
    return errorResult(
      stored.commandJson,
      "command-hash-mismatch",
      pendingErrorContext(stored),
    );
  }
  return {
    status: "ok",
    value: { item: pendingItem(read.command, stored), stored },
  };
}

async function decodePending(
  raw: unknown,
  expectedDocumentId: DocumentId,
  scope: BoardLocalAccessScope,
): Promise<DecodePendingResult> {
  if (
    isRecord(raw) &&
    (raw.schemaVersion === "2" || raw.schemaVersion === "3") &&
    raw.commandSchemaVersion !== boardCommandSchemaVersion
  ) {
    return errorResult(raw, "unsupported-command-schema", {
      actorId: typeof raw.actorId === "string" ? raw.actorId : null,
      commandSha256:
        typeof raw.commandSha256 === "string" ? raw.commandSha256 : null,
      documentId: typeof raw.documentId === "string" ? raw.documentId : null,
      idempotencyKey:
        typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : null,
      sequence: typeof raw.sequence === "number" ? raw.sequence : null,
    });
  }

  const current = pendingV3Schema.safeParse(raw);
  if (current.success) {
    const stored = current.data;
    if (
      stored.cacheScopeId !== scope.cacheScopeId ||
      stored.documentId !== expectedDocumentId
    ) {
      return errorResult(
        raw,
        "document-id-mismatch",
        pendingErrorContext(stored),
      );
    }
    if (stored.accessEpochAtCreation !== scope.accessEpoch) {
      return errorResult(
        raw,
        "access-epoch-changed",
        pendingErrorContext(stored),
      );
    }
    return await validateStoredCommand(stored);
  }

  const previous = pendingV2Schema.safeParse(raw);
  if (previous.success) {
    const data = previous.data;
    if (
      data.cacheScopeId !== scope.cacheScopeId ||
      data.documentId !== expectedDocumentId
    ) {
      return errorResult(
        raw,
        "document-id-mismatch",
        pendingErrorContext(data),
      );
    }
    const stored: StoredPendingCommandV3 = {
      ...data,
      accessEpochAtCreation: legacyBoardAccessEpoch,
      schemaVersion: "3",
    };
    if (stored.accessEpochAtCreation !== scope.accessEpoch) {
      return errorResult(
        raw,
        "access-epoch-changed",
        pendingErrorContext(stored),
      );
    }
    return await validateStoredCommand(stored);
  }

  const legacy = legacyPendingSchema.safeParse(raw);
  if (!legacy.success) {
    return errorResult(raw, "invalid-storage-record");
  }
  if (
    (legacy.data.cacheScopeId !== undefined &&
      legacy.data.cacheScopeId !== scope.cacheScopeId) ||
    legacy.data.documentId !== expectedDocumentId
  ) {
    return errorResult(raw, "document-id-mismatch", {
      documentId: legacy.data.documentId,
      idempotencyKey: legacy.data.idempotencyKey,
      sequence: legacy.data.sequence,
    });
  }
  const read = readBoardCommandJson(legacy.data.commandJson);
  if (read.status !== "ok") {
    return errorResult(
      legacy.data.commandJson,
      read.status === "invalid-json" ? "invalid-json" : "invalid-command",
      {
        documentId: legacy.data.documentId,
        idempotencyKey: legacy.data.idempotencyKey,
        issues: "issues" in read ? read.issues : [],
        sequence: legacy.data.sequence,
      },
    );
  }
  const commandJson = canonicalBoardCommandJson(read.command);
  const stored: StoredPendingCommandV3 = {
    accessEpochAtCreation: legacyBoardAccessEpoch,
    actorId: read.command.actorId,
    baseRevisionAtCreation: 0,
    cacheScopeId: scope.cacheScopeId,
    commandJson,
    commandSchemaVersion: boardCommandSchemaVersion,
    commandSha256: await boardCommandSha256(read.command),
    documentId: legacy.data.documentId,
    enqueuedAt: read.command.timestamp,
    idempotencyKey: legacy.data.idempotencyKey,
    lamport: legacy.data.sequence,
    schemaVersion: "3",
    sequence: legacy.data.sequence,
  };
  if (stored.accessEpochAtCreation !== scope.accessEpoch) {
    return errorResult(
      raw,
      "access-epoch-changed",
      pendingErrorContext(stored),
    );
  }
  return {
    status: "ok",
    value: { item: pendingItem(read.command, stored), stored },
  };
}

function quarantineId(
  cacheScopeId: string,
  documentIdValue: string | null,
  sequence: number | null,
): string {
  return `quarantine:${cacheScopeId}:${documentIdValue ?? "unknown"}:${sequence ?? "unknown"}:${crypto.randomUUID()}`;
}

function quarantineRecord(
  decoded: Extract<DecodePendingResult, { readonly status: "error" }>,
  capturedAt: string,
  expectedDocumentId: DocumentId,
  scope: BoardLocalAccessScope,
): StoredQuarantinedCommand {
  const documentIdValue = decoded.documentId ?? expectedDocumentId;
  return {
    actorId: decoded.actorId,
    cacheScopeId: scope.cacheScopeId,
    capturedAt,
    commandSha256: decoded.commandSha256,
    documentId: documentIdValue,
    id: quarantineId(scope.cacheScopeId, documentIdValue, decoded.sequence),
    idempotencyKey: decoded.idempotencyKey,
    issues: [...decoded.issues],
    raw: decoded.raw,
    reason: decoded.reason,
    sequence: decoded.sequence,
    source:
      decoded.reason === "access-epoch-changed"
        ? "access-epoch"
        : "indexeddb-read",
  };
}

function documentScopeKey(
  scope: BoardLocalAccessScope,
  expectedDocumentId: DocumentId,
): [string, string] {
  return [scope.cacheScopeId, expectedDocumentId];
}

function pendingKey(
  scope: BoardLocalAccessScope,
  expectedDocumentId: DocumentId,
  sequence: number,
): [string, string, number] {
  return [scope.cacheScopeId, expectedDocumentId, sequence];
}

export class DexiePendingBoardCommandQueue implements PendingBoardCommandQueue {
  readonly #database: TutorBoardSyncDatabase;
  #scope: BoardLocalAccessScope = {
    accessEpoch: legacyBoardAccessEpoch,
    cacheScopeId: legacyBoardCacheScopeId,
  };

  constructor(databaseName = defaultBoardSyncDatabaseName) {
    this.#database = new TutorBoardSyncDatabase(databaseName);
  }

  close(): void {
    this.#database.close();
  }

  async deleteDatabase(): Promise<void> {
    await this.#database.delete();
  }

  setAccessScope(scope: BoardLocalAccessScope): Promise<number> {
    if (
      !cacheScopeSchema.safeParse(scope.cacheScopeId).success ||
      !accessEpochSchema.safeParse(scope.accessEpoch).success
    ) {
      return Promise.reject(new Error("Board access scope is invalid."));
    }
    this.#scope = { ...scope };
    return Promise.resolve(0);
  }

  async enqueue(
    expectedDocumentId: DocumentId,
    idempotencyKey: string,
    command: BoardCommand,
    ordering: PendingBoardCommandOrderingInput = {},
  ): Promise<PendingBoardCommand> {
    const serialized = serializeBoardCommand(command);
    if (!serialized.ok) {
      throw new Error("Pending board command is invalid.");
    }
    const commandSha256 = await boardCommandSha256(command);
    const scope = this.#scope;
    return await this.#database.transaction(
      "rw",
      this.#database.scopedPending,
      this.#database.scopedClocks,
      this.#database.scopedSequences,
      async () => {
        const existing = await this.#database.scopedPending
          .where("[cacheScopeId+documentId]")
          .equals(documentScopeKey(scope, expectedDocumentId))
          .sortBy("sequence");
        const latestSequence = existing.at(-1);
        const rawSequenceClock = await this.#database.scopedSequences.get(
          documentScopeKey(scope, expectedDocumentId),
        );
        const parsedSequenceClock =
          queueSequenceSchema.safeParse(rawSequenceClock);
        const sequence =
          Math.max(
            latestSequence?.sequence ?? 0,
            parsedSequenceClock.success ? parsedSequenceClock.data.value : 0,
          ) + 1;
        const rawClock = await this.#database.scopedClocks.get([
          scope.cacheScopeId,
          expectedDocumentId,
          command.actorId,
        ]);
        const parsedClock = actorClockSchema.safeParse(rawClock);
        const currentClock = parsedClock.success ? parsedClock.data.value : 0;
        const baseRevisionAtCreation = Math.max(
          0,
          ordering.baseRevisionAtCreation ?? 0,
        );
        const lamport =
          Math.max(
            currentClock,
            ordering.observedLamport ?? 0,
            baseRevisionAtCreation,
          ) + 1;
        const stored: StoredPendingCommandV3 = {
          accessEpochAtCreation:
            ordering.accessEpochAtCreation ?? scope.accessEpoch,
          actorId: command.actorId,
          baseRevisionAtCreation,
          cacheScopeId: scope.cacheScopeId,
          commandJson: serialized.json,
          commandSchemaVersion: boardCommandSchemaVersion,
          commandSha256,
          documentId: expectedDocumentId,
          enqueuedAt: command.timestamp,
          idempotencyKey,
          lamport,
          schemaVersion: "3",
          sequence,
        };
        await this.#database.scopedPending.add(stored);
        await this.#database.scopedClocks.put({
          actorId: command.actorId,
          cacheScopeId: scope.cacheScopeId,
          documentId: expectedDocumentId,
          updatedAt: command.timestamp,
          value: lamport,
        });
        await this.#database.scopedSequences.put({
          cacheScopeId: scope.cacheScopeId,
          documentId: expectedDocumentId,
          updatedAt: command.timestamp,
          value: sequence,
        });
        return pendingItem(command, stored);
      },
    );
  }

  async list(
    expectedDocumentId: DocumentId,
  ): Promise<readonly PendingBoardCommand[]> {
    const scope = this.#scope;
    return await this.#database.transaction(
      "rw",
      this.#database.scopedPending,
      this.#database.scopedQuarantine,
      this.#database.scopedClocks,
      this.#database.scopedSequences,
      async () => {
        const rows = await this.#database.scopedPending
          .where("[cacheScopeId+documentId]")
          .equals(documentScopeKey(scope, expectedDocumentId))
          .sortBy("sequence");
        const valid: PendingBoardCommand[] = [];
        for (let index = 0; index < rows.length; index += 1) {
          const raw = rows[index];
          const decoded = await Dexie.waitFor(
            decodePending(raw, expectedDocumentId, scope),
          );
          if (decoded.status === "ok") {
            valid.push(decoded.value.item);
            if (!pendingV3Schema.safeParse(raw).success) {
              await this.#database.scopedPending.put(decoded.value.stored);
            }
            await this.#database.scopedClocks.put({
              actorId: decoded.value.stored.actorId,
              cacheScopeId: scope.cacheScopeId,
              documentId: decoded.value.stored.documentId,
              updatedAt: decoded.value.stored.enqueuedAt,
              value: decoded.value.stored.lamport,
            });
            continue;
          }

          const capturedAt = new Date().toISOString();
          if (decoded.reason === "access-epoch-changed") {
            await this.#database.scopedQuarantine.add(
              quarantineRecord(decoded, capturedAt, expectedDocumentId, scope),
            );
            if (decoded.sequence !== null) {
              await this.#database.scopedPending.delete(
                pendingKey(scope, expectedDocumentId, decoded.sequence),
              );
            }
            continue;
          }

          const quarantined: StoredQuarantinedCommand[] = [
            quarantineRecord(decoded, capturedAt, expectedDocumentId, scope),
          ];
          for (const dependent of rows.slice(index + 1)) {
            const legacy = legacyPendingSchema.safeParse(dependent);
            const previous = pendingV2Schema.safeParse(dependent);
            const current = pendingV3Schema.safeParse(dependent);
            const context = current.success
              ? current.data
              : previous.success
                ? previous.data
                : legacy.success
                  ? legacy.data
                  : null;
            const actorIdValue = current.success
              ? current.data.actorId
              : previous.success
                ? previous.data.actorId
                : null;
            const commandSha256Value = current.success
              ? current.data.commandSha256
              : previous.success
                ? previous.data.commandSha256
                : null;
            quarantined.push({
              actorId: actorIdValue,
              cacheScopeId: scope.cacheScopeId,
              capturedAt,
              commandSha256: commandSha256Value,
              documentId: context?.documentId ?? expectedDocumentId,
              id: quarantineId(
                scope.cacheScopeId,
                context?.documentId ?? expectedDocumentId,
                context?.sequence ?? null,
              ),
              idempotencyKey: context?.idempotencyKey ?? null,
              issues: [],
              raw: safeJson(dependent),
              reason: "dependency-gap",
              sequence: context?.sequence ?? null,
              source: "indexeddb-read",
            });
          }
          await this.#database.scopedQuarantine.bulkAdd(quarantined);
          const quarantinedSequences = rows.slice(index).flatMap((item) => {
            const legacy = legacyPendingSchema.safeParse(item);
            const previous = pendingV2Schema.safeParse(item);
            const current = pendingV3Schema.safeParse(item);
            const sequence = current.success
              ? current.data.sequence
              : previous.success
                ? previous.data.sequence
                : legacy.success
                  ? legacy.data.sequence
                  : null;
            return sequence === null ? [] : [sequence];
          });
          for (const sequence of quarantinedSequences) {
            await this.#database.scopedPending.delete(
              pendingKey(scope, expectedDocumentId, sequence),
            );
          }
          break;
        }
        const latestValid = valid.at(-1);
        if (latestValid !== undefined) {
          const key = documentScopeKey(scope, expectedDocumentId);
          const rawSequenceClock =
            await this.#database.scopedSequences.get(key);
          const parsedSequenceClock =
            queueSequenceSchema.safeParse(rawSequenceClock);
          if (
            !parsedSequenceClock.success ||
            parsedSequenceClock.data.value < latestValid.sequence
          ) {
            await this.#database.scopedSequences.put({
              cacheScopeId: scope.cacheScopeId,
              documentId: expectedDocumentId,
              updatedAt: latestValid.command.timestamp,
              value: latestValid.sequence,
            });
          }
        }
        return valid;
      },
    );
  }

  async listQuarantined(
    expectedDocumentId: DocumentId,
  ): Promise<readonly QuarantinedPendingBoardCommand[]> {
    const scope = this.#scope;
    const rows = await this.#database.scopedQuarantine
      .where("[cacheScopeId+documentId]")
      .equals(documentScopeKey(scope, expectedDocumentId))
      .sortBy("capturedAt");
    return rows.map((item) => ({
      ...item,
      issues: [...item.issues],
    }));
  }

  async discardQuarantined(
    expectedDocumentId: DocumentId,
    quarantineIds: readonly string[],
  ): Promise<void> {
    const scope = this.#scope;
    await this.#database.transaction(
      "rw",
      this.#database.scopedQuarantine,
      async () => {
        const allowed = new Set(quarantineIds);
        const rows = await this.#database.scopedQuarantine
          .where("[cacheScopeId+documentId]")
          .equals(documentScopeKey(scope, expectedDocumentId))
          .toArray();
        await this.#database.scopedQuarantine.bulkDelete(
          rows.filter(({ id }) => allowed.has(id)).map(({ id }) => id),
        );
      },
    );
  }

  async quarantineConflicts(
    expectedDocumentId: DocumentId,
    conflicts: readonly PendingBoardCommandConflict[],
  ): Promise<void> {
    if (conflicts.length === 0) return;
    const scope = this.#scope;
    const capturedAt = new Date().toISOString();
    const records = await Promise.all(
      conflicts.map(async ({ item, message }) => {
        if (item.documentId !== expectedDocumentId) {
          throw new Error("Conflicting command belongs to another document.");
        }
        const serialized = serializeBoardCommand(item.command);
        return {
          actorId: item.command.actorId,
          cacheScopeId: scope.cacheScopeId,
          capturedAt,
          commandSha256: await boardCommandSha256(item.command),
          detail: message,
          documentId: expectedDocumentId,
          id: quarantineId(
            scope.cacheScopeId,
            expectedDocumentId,
            item.sequence,
          ),
          idempotencyKey: item.idempotencyKey,
          issues: serialized.ok ? [] : [...serialized.issues],
          raw: serialized.ok ? serialized.json : safeJson(item.command),
          reason: "remote-conflict" as const,
          sequence: item.sequence,
          source: "server-rebase" as const,
        } satisfies StoredQuarantinedCommand;
      }),
    );
    await this.#database.transaction(
      "rw",
      this.#database.scopedPending,
      this.#database.scopedQuarantine,
      async () => {
        await this.#database.scopedQuarantine.bulkAdd(records);
        await this.#database.scopedPending.bulkDelete(
          conflicts.map(({ item }) =>
            pendingKey(scope, expectedDocumentId, item.sequence),
          ),
        );
      },
    );
  }

  async acknowledge(
    expectedDocumentId: DocumentId,
    sequence: number,
  ): Promise<void> {
    await this.#database.scopedPending.delete(
      pendingKey(this.#scope, expectedDocumentId, sequence),
    );
  }

  async reconcile(
    expectedDocumentId: DocumentId,
    commands: readonly PendingBoardCommand[],
    knownSequences: readonly number[],
  ): Promise<void> {
    const known = new Set(knownSequences);
    if (
      known.size !== knownSequences.length ||
      knownSequences.some(
        (sequence) => !Number.isSafeInteger(sequence) || sequence <= 0,
      )
    ) {
      throw new Error("Known pending command sequences are invalid.");
    }
    const scope = this.#scope;
    const remainingSequences = new Set<number>();
    const prepared = await Promise.all(
      commands.map(async (item) => {
        if (item.documentId !== expectedDocumentId) {
          throw new Error("Pending command belongs to another document.");
        }
        if (
          !known.has(item.sequence) ||
          remainingSequences.has(item.sequence)
        ) {
          throw new Error("Pending command reconciliation scope is invalid.");
        }
        remainingSequences.add(item.sequence);
        const serialized = serializeBoardCommand(item.command);
        if (!serialized.ok) {
          throw new Error("Pending board command is invalid.");
        }
        return {
          command: item.command,
          commandJson: serialized.json,
          commandSha256: await boardCommandSha256(item.command),
          item,
        };
      }),
    );
    await this.#database.transaction(
      "rw",
      this.#database.scopedPending,
      this.#database.scopedClocks,
      async () => {
        const existingRows = await this.#database.scopedPending
          .where("[cacheScopeId+documentId]")
          .equals(documentScopeKey(scope, expectedDocumentId))
          .toArray();
        const existing = new Map<number, StoredPendingCommandV3>();
        for (const raw of existingRows) {
          const parsed = pendingV3Schema.safeParse(raw);
          if (parsed.success) existing.set(parsed.data.sequence, parsed.data);
        }
        await this.#database.scopedPending.bulkDelete(
          knownSequences
            .filter((sequence) => !remainingSequences.has(sequence))
            .map((sequence) => pendingKey(scope, expectedDocumentId, sequence)),
        );
        const stored = prepared.flatMap(
          ({ command, commandJson, commandSha256, item }) => {
            const previous = existing.get(item.sequence);
            if (
              previous === undefined ||
              previous.idempotencyKey !== item.idempotencyKey
            ) {
              return [];
            }
            return [
              {
                accessEpochAtCreation:
                  item.accessEpochAtCreation ?? previous.accessEpochAtCreation,
                actorId: command.actorId,
                baseRevisionAtCreation: previous.baseRevisionAtCreation,
                cacheScopeId: scope.cacheScopeId,
                commandJson,
                commandSchemaVersion: boardCommandSchemaVersion,
                commandSha256,
                documentId: expectedDocumentId,
                enqueuedAt: command.timestamp,
                idempotencyKey: item.idempotencyKey,
                lamport: previous.lamport,
                schemaVersion: "3" as const,
                sequence: item.sequence,
              } satisfies StoredPendingCommandV3,
            ];
          },
        );
        if (stored.length > 0)
          await this.#database.scopedPending.bulkPut(stored);
        const clocks = new Map<string, StoredActorClock>();
        for (const item of stored) {
          const previous = clocks.get(item.actorId);
          if (previous === undefined || previous.value < item.lamport) {
            clocks.set(item.actorId, {
              actorId: item.actorId,
              cacheScopeId: scope.cacheScopeId,
              documentId: item.documentId,
              updatedAt: item.enqueuedAt,
              value: item.lamport,
            });
          }
        }
        if (clocks.size > 0) {
          await this.#database.scopedClocks.bulkPut([...clocks.values()]);
        }
      },
    );
  }

  async loadHead(
    expectedDocumentId: DocumentId,
  ): Promise<ConfirmedBoardHead | null> {
    const scope = this.#scope;
    const raw = await this.#database.scopedHeads.get(
      documentScopeKey(scope, expectedDocumentId),
    );
    if (raw === undefined) return null;
    const parsed = headSchema.safeParse(raw);
    if (!parsed.success || parsed.data.cacheScopeId !== scope.cacheScopeId) {
      throw new Error("Confirmed board cache is corrupted.");
    }
    const read = deserializeBoardDocument(parsed.data.serializedDocument);
    if (
      read.status !== "ok" ||
      read.document.id !== expectedDocumentId ||
      parsed.data.documentId !== expectedDocumentId
    ) {
      throw new Error("Confirmed board cache contains an invalid document.");
    }
    const actualSha256 = await documentSha256(read.document);
    if (actualSha256 !== parsed.data.sha256) {
      throw new Error("Confirmed board cache checksum mismatch.");
    }
    return {
      document: read.document,
      documentId: expectedDocumentId,
      revision: parsed.data.revision,
      session: {
        accessEpoch: parsed.data.accessEpoch,
        actorId: actorId(parsed.data.actorId),
        cacheScopeId: parsed.data.cacheScopeId,
        ...(parsed.data.capabilities === undefined
          ? {}
          : { capabilities: parsed.data.capabilities }),
        ...(parsed.data.organizationId === undefined
          ? {}
          : { organizationId: parsed.data.organizationId }),
        ...(parsed.data.principalType === undefined
          ? {}
          : { principalType: parsed.data.principalType }),
        role: parsed.data.role,
      },
      sha256: parsed.data.sha256,
    };
  }

  async saveHead(head: ConfirmedBoardHead): Promise<void> {
    if (head.documentId !== head.document.id) {
      throw new Error("Confirmed board head document identifiers differ.");
    }
    const serialized = serializeBoardDocument(head.document);
    if (!serialized.ok) {
      throw new Error("Cannot cache an invalid confirmed board document.");
    }
    const actualSha256 = await sha256Text(serialized.json);
    if (actualSha256 !== head.sha256) {
      throw new Error("Confirmed board head checksum mismatch.");
    }
    const scope = this.#scope;
    if (
      head.session.cacheScopeId !== undefined &&
      head.session.cacheScopeId !== scope.cacheScopeId
    ) {
      throw new Error("Confirmed board head belongs to another access scope.");
    }
    await this.#database.scopedHeads.put({
      accessEpoch: head.session.accessEpoch ?? scope.accessEpoch,
      actorId: head.session.actorId,
      cacheScopeId: scope.cacheScopeId,
      ...(head.session.capabilities === undefined
        ? {}
        : { capabilities: [...head.session.capabilities] }),
      documentId: head.documentId,
      ...(head.session.organizationId === undefined
        ? {}
        : { organizationId: head.session.organizationId }),
      ...(head.session.principalType === undefined
        ? {}
        : { principalType: head.session.principalType }),
      revision: head.revision,
      role: head.session.role,
      serializedDocument: serialized.json,
      sha256: head.sha256,
    });
  }
}

export function createDexiePendingBoardCommandQueue(
  databaseName?: string,
): DexiePendingBoardCommandQueue {
  return new DexiePendingBoardCommandQueue(databaseName);
}
