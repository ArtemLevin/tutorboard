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
  actorId,
  deserializeBoardDocument,
  documentId,
  serializeBoardDocument,
  type BoardCommand,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandOrderingInput,
  type PendingBoardCommandQueue,
} from "../../core/public";

export const defaultBoardSyncDatabaseName = "tutorboard-sync-v1";

export type PendingCommandQuarantineReason =
  | "actor-id-mismatch"
  | "command-hash-mismatch"
  | "dependency-gap"
  | "document-id-mismatch"
  | "invalid-command"
  | "invalid-json"
  | "invalid-storage-record"
  | "unsupported-command-schema";

export interface QuarantinedPendingBoardCommand {
  readonly actorId: string | null;
  readonly capturedAt: string;
  readonly commandSha256: string | null;
  readonly documentId: string | null;
  readonly id: string;
  readonly idempotencyKey: string | null;
  readonly issues: readonly BoardCommandCodecIssue[];
  readonly raw: string;
  readonly reason: PendingCommandQuarantineReason;
  readonly sequence: number | null;
  readonly source: "indexeddb-read";
}

interface StoredConfirmedHead {
  readonly actorId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly revision: number;
  readonly role: "admin" | "parent" | "student" | "tutor";
  readonly serializedDocument: string;
  readonly sha256: string;
}

interface StoredPendingCommandV1 {
  readonly commandJson: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
}

interface StoredPendingCommandV2 {
  readonly actorId: string;
  readonly baseRevisionAtCreation: number;
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

interface StoredActorClock {
  readonly actorId: string;
  readonly documentId: string;
  readonly updatedAt: string;
  readonly value: number;
}

interface StoredQueueSequence {
  readonly documentId: string;
  readonly updatedAt: string;
  readonly value: number;
}

type StoredQuarantinedCommand = QuarantinedPendingBoardCommand;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });
const headSchema = z
  .object({
    actorId: z.string().min(1).max(128),
    documentId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative(),
    role: z.enum(["admin", "parent", "student", "tutor"]),
    serializedDocument: z.string(),
    sha256: sha256Schema,
  })
  .strict();
const legacyPendingSchema = z
  .object({
    commandJson: z.string(),
    documentId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    sequence: z.number().int().positive(),
  })
  .strict();
const pendingSchema = z
  .object({
    actorId: z.string().min(1).max(128),
    baseRevisionAtCreation: z.number().int().nonnegative(),
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
const actorClockSchema = z
  .object({
    actorId: z.string().min(1).max(128),
    documentId: z.string().min(1).max(128),
    updatedAt: timestampSchema,
    value: z.number().int().nonnegative(),
  })
  .strict();
const queueSequenceSchema = z
  .object({
    documentId: z.string().min(1).max(128),
    updatedAt: timestampSchema,
    value: z.number().int().nonnegative(),
  })
  .strict();

class TutorBoardSyncDatabase extends Dexie {
  clocks!: Table<StoredActorClock, [string, string]>;
  heads!: Table<StoredConfirmedHead, string>;
  pending!: Table<
    StoredPendingCommandV1 | StoredPendingCommandV2,
    [string, number]
  >;
  quarantine!: Table<StoredQuarantinedCommand, string>;
  sequences!: Table<StoredQueueSequence, string>;

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
  readonly stored: StoredPendingCommandV2;
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
  stored: StoredPendingCommandV2,
): PendingBoardCommand {
  return {
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

async function decodePending(
  raw: unknown,
  expectedDocumentId: DocumentId,
): Promise<DecodePendingResult> {
  if (
    isRecord(raw) &&
    raw.schemaVersion === "2" &&
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

  const current = pendingSchema.safeParse(raw);
  if (current.success) {
    const stored = current.data;
    if (stored.documentId !== expectedDocumentId) {
      return errorResult(raw, "document-id-mismatch", {
        actorId: stored.actorId,
        commandSha256: stored.commandSha256,
        documentId: stored.documentId,
        idempotencyKey: stored.idempotencyKey,
        sequence: stored.sequence,
      });
    }
    const read = readBoardCommandJson(stored.commandJson);
    if (read.status !== "ok") {
      return errorResult(
        stored.commandJson,
        read.status === "invalid-json" ? "invalid-json" : "invalid-command",
        {
          actorId: stored.actorId,
          commandSha256: stored.commandSha256,
          documentId: stored.documentId,
          idempotencyKey: stored.idempotencyKey,
          issues: "issues" in read ? read.issues : [],
          sequence: stored.sequence,
        },
      );
    }
    if (read.command.actorId !== stored.actorId) {
      return errorResult(stored.commandJson, "actor-id-mismatch", {
        actorId: stored.actorId,
        commandSha256: stored.commandSha256,
        documentId: stored.documentId,
        idempotencyKey: stored.idempotencyKey,
        sequence: stored.sequence,
      });
    }
    const actualSha256 = await boardCommandSha256(read.command);
    if (actualSha256 !== stored.commandSha256) {
      return errorResult(stored.commandJson, "command-hash-mismatch", {
        actorId: stored.actorId,
        commandSha256: stored.commandSha256,
        documentId: stored.documentId,
        idempotencyKey: stored.idempotencyKey,
        sequence: stored.sequence,
      });
    }
    return {
      status: "ok",
      value: {
        item: pendingItem(read.command, stored),
        stored,
      },
    };
  }

  const legacy = legacyPendingSchema.safeParse(raw);
  if (!legacy.success) {
    return errorResult(raw, "invalid-storage-record");
  }
  if (legacy.data.documentId !== expectedDocumentId) {
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
  const stored: StoredPendingCommandV2 = {
    actorId: read.command.actorId,
    baseRevisionAtCreation: 0,
    commandJson,
    commandSchemaVersion: boardCommandSchemaVersion,
    commandSha256: await boardCommandSha256(read.command),
    documentId: legacy.data.documentId,
    enqueuedAt: read.command.timestamp,
    idempotencyKey: legacy.data.idempotencyKey,
    lamport: legacy.data.sequence,
    schemaVersion: "2",
    sequence: legacy.data.sequence,
  };
  return {
    status: "ok",
    value: {
      item: pendingItem(read.command, stored),
      stored,
    },
  };
}

function quarantineId(
  documentIdValue: string | null,
  sequence: number | null,
): string {
  return `quarantine:${documentIdValue ?? "unknown"}:${sequence ?? "unknown"}:${crypto.randomUUID()}`;
}

function quarantineRecord(
  decoded: Extract<DecodePendingResult, { readonly status: "error" }>,
  capturedAt: string,
  expectedDocumentId: DocumentId,
): StoredQuarantinedCommand {
  const documentIdValue = decoded.documentId ?? expectedDocumentId;
  return {
    actorId: decoded.actorId,
    capturedAt,
    commandSha256: decoded.commandSha256,
    documentId: documentIdValue,
    id: quarantineId(documentIdValue, decoded.sequence),
    idempotencyKey: decoded.idempotencyKey,
    issues: [...decoded.issues],
    raw: decoded.raw,
    reason: decoded.reason,
    sequence: decoded.sequence,
    source: "indexeddb-read",
  };
}

export class DexiePendingBoardCommandQueue implements PendingBoardCommandQueue {
  readonly #database: TutorBoardSyncDatabase;

  constructor(databaseName = defaultBoardSyncDatabaseName) {
    this.#database = new TutorBoardSyncDatabase(databaseName);
  }

  close(): void {
    this.#database.close();
  }

  async deleteDatabase(): Promise<void> {
    await this.#database.delete();
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
    return await this.#database.transaction(
      "rw",
      this.#database.pending,
      this.#database.clocks,
      this.#database.sequences,
      async () => {
        const existing = await this.#database.pending
          .where("documentId")
          .equals(expectedDocumentId)
          .sortBy("sequence");
        const latestSequence = existing.at(-1);
        const rawSequenceClock =
          await this.#database.sequences.get(expectedDocumentId);
        const parsedSequenceClock =
          queueSequenceSchema.safeParse(rawSequenceClock);
        const sequence =
          Math.max(
            latestSequence?.sequence ?? 0,
            parsedSequenceClock.success ? parsedSequenceClock.data.value : 0,
          ) + 1;
        const rawClock = await this.#database.clocks.get([
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
        const stored: StoredPendingCommandV2 = {
          actorId: command.actorId,
          baseRevisionAtCreation,
          commandJson: serialized.json,
          commandSchemaVersion: boardCommandSchemaVersion,
          commandSha256,
          documentId: expectedDocumentId,
          enqueuedAt: command.timestamp,
          idempotencyKey,
          lamport,
          schemaVersion: "2",
          sequence,
        };
        await this.#database.pending.add(stored);
        await this.#database.clocks.put({
          actorId: command.actorId,
          documentId: expectedDocumentId,
          updatedAt: command.timestamp,
          value: lamport,
        });
        await this.#database.sequences.put({
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
    return await this.#database.transaction(
      "rw",
      this.#database.pending,
      this.#database.quarantine,
      this.#database.clocks,
      this.#database.sequences,
      async () => {
        const rows = await this.#database.pending
          .where("documentId")
          .equals(expectedDocumentId)
          .sortBy("sequence");
        const valid: PendingBoardCommand[] = [];
        for (let index = 0; index < rows.length; index += 1) {
          const raw = rows[index];
          const decoded = await Dexie.waitFor(
            decodePending(raw, expectedDocumentId),
          );
          if (decoded.status === "ok") {
            valid.push(decoded.value.item);
            if (!pendingSchema.safeParse(raw).success) {
              await this.#database.pending.put(decoded.value.stored);
            }
            await this.#database.clocks.put({
              actorId: decoded.value.stored.actorId,
              documentId: decoded.value.stored.documentId,
              updatedAt: decoded.value.stored.enqueuedAt,
              value: decoded.value.stored.lamport,
            });
            continue;
          }

          const capturedAt = new Date().toISOString();
          const quarantined = [
            quarantineRecord(decoded, capturedAt, expectedDocumentId),
          ];
          for (const dependent of rows.slice(index + 1)) {
            const legacy = legacyPendingSchema.safeParse(dependent);
            const current = pendingSchema.safeParse(dependent);
            const context = current.success
              ? current.data
              : legacy.success
                ? legacy.data
                : null;
            quarantined.push({
              actorId: current.success ? current.data.actorId : null,
              capturedAt,
              commandSha256: current.success
                ? current.data.commandSha256
                : null,
              documentId: context?.documentId ?? expectedDocumentId,
              id: quarantineId(
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
          await this.#database.quarantine.bulkAdd(quarantined);
          const quarantinedSequences = rows.slice(index).flatMap((item) => {
            const legacy = legacyPendingSchema.safeParse(item);
            const current = pendingSchema.safeParse(item);
            const sequence = current.success
              ? current.data.sequence
              : legacy.success
                ? legacy.data.sequence
                : null;
            return sequence === null ? [] : [sequence];
          });
          for (const sequence of quarantinedSequences) {
            await this.#database.pending.delete([expectedDocumentId, sequence]);
          }
          break;
        }
        const latestValid = valid.at(-1);
        if (latestValid !== undefined) {
          const rawSequenceClock =
            await this.#database.sequences.get(expectedDocumentId);
          const parsedSequenceClock =
            queueSequenceSchema.safeParse(rawSequenceClock);
          if (
            !parsedSequenceClock.success ||
            parsedSequenceClock.data.value < latestValid.sequence
          ) {
            await this.#database.sequences.put({
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
    const rows = await this.#database.quarantine
      .where("documentId")
      .equals(expectedDocumentId)
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
    await this.#database.transaction(
      "rw",
      this.#database.quarantine,
      async () => {
        const allowed = new Set(quarantineIds);
        const rows = await this.#database.quarantine
          .where("documentId")
          .equals(expectedDocumentId)
          .toArray();
        await this.#database.quarantine.bulkDelete(
          rows.filter(({ id }) => allowed.has(id)).map(({ id }) => id),
        );
      },
    );
  }

  async acknowledge(
    expectedDocumentId: DocumentId,
    sequence: number,
  ): Promise<void> {
    await this.#database.pending.delete([expectedDocumentId, sequence]);
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
      this.#database.pending,
      this.#database.clocks,
      async () => {
        const existingRows = await this.#database.pending
          .where("documentId")
          .equals(expectedDocumentId)
          .toArray();
        const existing = new Map<number, StoredPendingCommandV2>();
        for (const raw of existingRows) {
          const parsed = pendingSchema.safeParse(raw);
          if (parsed.success) existing.set(parsed.data.sequence, parsed.data);
        }
        await this.#database.pending.bulkDelete(
          knownSequences
            .filter((sequence) => !remainingSequences.has(sequence))
            .map((sequence) => [expectedDocumentId, sequence]),
        );
        const stored = prepared.flatMap(
          ({ command, commandJson, commandSha256, item }) => {
            const previous = existing.get(item.sequence);
            // A missing row was acknowledged by another engine. A row with a
            // different durable identity may have been enqueued after that
            // acknowledgement. Neither case may be resurrected or overwritten
            // by this stale reconciliation snapshot.
            if (
              previous === undefined ||
              previous.idempotencyKey !== item.idempotencyKey
            ) {
              return [];
            }
            return [
              {
                actorId: command.actorId,
                baseRevisionAtCreation:
                  previous?.baseRevisionAtCreation ??
                  item.order.baseRevisionAtCreation,
                commandJson,
                commandSchemaVersion: boardCommandSchemaVersion,
                commandSha256,
                documentId: expectedDocumentId,
                enqueuedAt: command.timestamp,
                idempotencyKey: item.idempotencyKey,
                lamport: previous?.lamport ?? item.order.lamport,
                schemaVersion: "2" as const,
                sequence: item.sequence,
              } satisfies StoredPendingCommandV2,
            ];
          },
        );
        if (stored.length > 0) {
          await this.#database.pending.bulkPut(stored);
        }
        const clocks = new Map<string, StoredActorClock>();
        for (const item of stored) {
          const previous = clocks.get(item.actorId);
          if (previous === undefined || previous.value < item.lamport) {
            clocks.set(item.actorId, {
              actorId: item.actorId,
              documentId: item.documentId,
              updatedAt: item.enqueuedAt,
              value: item.lamport,
            });
          }
        }
        if (clocks.size > 0) {
          await this.#database.clocks.bulkPut([...clocks.values()]);
        }
      },
    );
  }

  async loadHead(
    expectedDocumentId: DocumentId,
  ): Promise<ConfirmedBoardHead | null> {
    const raw = await this.#database.heads.get(expectedDocumentId);
    if (raw === undefined) return null;
    const parsed = headSchema.safeParse(raw);
    if (!parsed.success) {
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
        actorId: actorId(parsed.data.actorId),
        organizationId: parsed.data.organizationId,
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
    await this.#database.heads.put({
      actorId: head.session.actorId,
      documentId: head.documentId,
      organizationId: head.session.organizationId,
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
