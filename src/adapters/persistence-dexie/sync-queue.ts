import Dexie, { type Table } from "dexie";
import { z } from "zod";

// Server-sync durability belongs to the same IndexedDB adapter boundary as local revisions.
import {
  actorId,
  deserializeBoardDocument,
  documentId,
  serializeBoardDocument,
  type BoardCommand,
  type ConfirmedBoardHead,
  type DocumentId,
  type PendingBoardCommand,
  type PendingBoardCommandQueue,
} from "../../core/public";

export const defaultBoardSyncDatabaseName = "tutorboard-sync-v1";

interface StoredConfirmedHead {
  readonly actorId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly revision: number;
  readonly role: "admin" | "parent" | "student" | "tutor";
  readonly serializedDocument: string;
  readonly sha256: string;
}

interface StoredPendingCommand {
  readonly commandJson: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
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
const pendingSchema = z
  .object({
    commandJson: z.string(),
    documentId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    sequence: z.number().int().positive(),
  })
  .strict();
const commandMetadataSchema = z
  .object({
    actorId: z.string().min(1).max(128),
    id: z.string().min(1).max(128),
    kind: z.string().min(1).max(128),
    timestamp: z.string().min(1).max(64),
  })
  .passthrough();

class TutorBoardSyncDatabase extends Dexie {
  heads!: Table<StoredConfirmedHead, string>;
  pending!: Table<StoredPendingCommand, [string, number]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      heads: "documentId",
      pending:
        "[documentId+sequence],documentId,&[documentId+idempotencyKey],sequence",
    });
  }
}

function parseCommand(raw: string): BoardCommand {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Pending board command contains invalid JSON.");
  }
  const parsed = commandMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Pending board command has an incompatible shape.");
  }
  return parsed.data as unknown as BoardCommand;
}

function pendingFromStored(raw: unknown): PendingBoardCommand {
  const parsed = pendingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Pending board queue is corrupted.");
  }
  return {
    command: parseCommand(parsed.data.commandJson),
    documentId: documentId(parsed.data.documentId),
    idempotencyKey: parsed.data.idempotencyKey,
    sequence: parsed.data.sequence,
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
  ): Promise<PendingBoardCommand> {
    return await this.#database.transaction(
      "rw",
      this.#database.pending,
      async () => {
        const existing = await this.#database.pending
          .where("documentId")
          .equals(expectedDocumentId)
          .sortBy("sequence");
        const latest = existing.at(-1);
        const sequence = (latest?.sequence ?? 0) + 1;
        const stored: StoredPendingCommand = {
          commandJson: JSON.stringify(command),
          documentId: expectedDocumentId,
          idempotencyKey,
          sequence,
        };
        await this.#database.pending.add(stored);
        return pendingFromStored(stored);
      },
    );
  }

  async list(
    expectedDocumentId: DocumentId,
  ): Promise<readonly PendingBoardCommand[]> {
    const rows = await this.#database.pending
      .where("documentId")
      .equals(expectedDocumentId)
      .sortBy("sequence");
    return rows.map(pendingFromStored);
  }

  async acknowledge(
    expectedDocumentId: DocumentId,
    sequence: number,
  ): Promise<void> {
    await this.#database.pending.delete([expectedDocumentId, sequence]);
  }

  async replace(
    expectedDocumentId: DocumentId,
    commands: readonly PendingBoardCommand[],
  ): Promise<void> {
    await this.#database.transaction("rw", this.#database.pending, async () => {
      await this.#database.pending
        .where("documentId")
        .equals(expectedDocumentId)
        .delete();
      if (commands.length === 0) {
        return;
      }
      await this.#database.pending.bulkAdd(
        commands.map((item) => ({
          commandJson: JSON.stringify(item.command),
          documentId: expectedDocumentId,
          idempotencyKey: item.idempotencyKey,
          sequence: item.sequence,
        })),
      );
    });
  }

  async loadHead(
    expectedDocumentId: DocumentId,
  ): Promise<ConfirmedBoardHead | null> {
    const raw = await this.#database.heads.get(expectedDocumentId);
    if (raw === undefined) {
      return null;
    }
    const parsed = headSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Confirmed board cache is corrupted.");
    }
    const read = deserializeBoardDocument(parsed.data.serializedDocument);
    if (read.status !== "ok" || read.document.id !== expectedDocumentId) {
      throw new Error("Confirmed board cache contains an invalid document.");
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
    const serialized = serializeBoardDocument(head.document);
    if (!serialized.ok) {
      throw new Error("Cannot cache an invalid confirmed board document.");
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
