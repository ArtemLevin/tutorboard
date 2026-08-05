from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"marker missing in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, count), encoding="utf-8")


# Durable queue ordering metadata.
queue_path = "src/adapters/persistence-dexie/sync-queue.ts"
replace(
    queue_path,
    '  type PendingBoardCommand,\n  type PendingBoardCommandQueue,\n',
    '  type PendingBoardCommand,\n  type PendingBoardCommandOrderingInput,\n  type PendingBoardCommandQueue,\n',
)
replace(
    queue_path,
    '    idempotencyKey: stored.idempotencyKey,\n    sequence: stored.sequence,',
    '    idempotencyKey: stored.idempotencyKey,\n    order: {\n      baseRevisionAtCreation: stored.baseRevisionAtCreation,\n      lamport: stored.lamport,\n    },\n    sequence: stored.sequence,',
)
replace(
    queue_path,
    '    ordering: {\n      readonly baseRevisionAtCreation?: number;\n      readonly observedLamport?: number;\n    } = {},',
    '    ordering: PendingBoardCommandOrderingInput = {},',
)
replace(
    queue_path,
    '              baseRevisionAtCreation: previous?.baseRevisionAtCreation ?? 0,',
    '              baseRevisionAtCreation:\n                previous?.baseRevisionAtCreation ??\n                item.order.baseRevisionAtCreation,',
)
replace(
    queue_path,
    '              lamport: previous?.lamport ?? item.sequence,',
    '              lamport: previous?.lamport ?? item.order.lamport,',
)

# Wall-clock timestamps become audit metadata. updatedAt stays monotonic.
reducer = Path("src/core/board/commands/reducer.ts")
text = reducer.read_text(encoding="utf-8")
text = text.replace('  | "command.stale-object"\n  | "command.stale-timestamp";', '  | "command.stale-object";')
stale_check = '''\n  if (Date.parse(command.timestamp) < Date.parse(document.updatedAt)) {\n    return failure(\n      document,\n      "command.stale-timestamp",\n      "Command timestamp precedes the current document revision.",\n    );\n  }\n'''
if stale_check not in text:
    raise SystemExit("stale timestamp check missing")
text = text.replace(stale_check, "")
old_accept = '''function accept(\n  original: BoardDocument,\n  candidate: BoardDocument,\n): CommandResult {\n  const validation = validateBoardDocument(candidate);\n\n  if (!validation.valid) {\n    return failure(\n      original,\n      "command.invalid-result",\n      "Command result violates BoardDocument invariants.",\n    );\n  }\n\n  return { ok: true, document: candidate };\n}'''
new_accept = '''function accept(\n  original: BoardDocument,\n  candidate: BoardDocument,\n): CommandResult {\n  const originalTime = Date.parse(original.updatedAt);\n  const candidateTime = Date.parse(candidate.updatedAt);\n  const normalized =\n    Number.isNaN(originalTime) ||\n    Number.isNaN(candidateTime) ||\n    candidateTime >= originalTime\n      ? candidate\n      : { ...candidate, updatedAt: original.updatedAt };\n  const validation = validateBoardDocument(normalized);\n\n  if (!validation.valid) {\n    return failure(\n      original,\n      "command.invalid-result",\n      "Command result violates BoardDocument invariants.",\n    );\n  }\n\n  return { ok: true, document: normalized };\n}'''
if old_accept not in text:
    raise SystemExit("accept function missing")
reducer.write_text(text.replace(old_accept, new_accept), encoding="utf-8")

# Sync engine: tolerant historical reads, ordered v1.3 writes.
sync = Path("src/modules/server-sync/sync.ts")
text = sync.read_text(encoding="utf-8")
text = text.replace(
    '  type PendingBoardCommandQueue,\n  type ServerBoardCommandBatch,',
    '  type PendingBoardCommandQueue,\n  type OrderedBoardCommand,\n  type ServerBoardCommandBatch,',
)
start = text.index("function nextTimestamp(")
end = text.index("\nfunction applyCommand(", start)
helpers = '''function rebaseCommand(\n  document: BoardDocument,\n  command: BoardCommand,\n): BoardCommand {\n  const result = reduceBoardDocument(document, command);\n  if (!result.ok) {\n    throw new SyncRecoveryError(\n      "board.sync.rebase-failed",\n      `Локальная команда ${command.id} конфликтует с удалёнными изменениями: ${result.error.message}`,\n    );\n  }\n  return command;\n}\n\nfunction commandsFromBatch(\n  batch: ServerBoardCommandBatch,\n): readonly BoardCommand[] {\n  return batch.envelope.schemaVersion === "1.3"\n    ? batch.envelope.commands.map(({ command }) => command)\n    : batch.envelope.commands;\n}\n\nfunction orderedFromPending(item: PendingBoardCommand): OrderedBoardCommand {\n  return { command: item.command, order: item.order };\n}\n'''
text = text[:start] + helpers + text[end:]
text = text.replace(
    "    for (const command of batch.envelope.commands) {",
    "    for (const command of commandsFromBatch(batch)) {",
)
text = text.replace(
    '''function replayPending(\n  head: ConfirmedBoardHead,\n  pending: readonly PendingBoardCommand[],\n  now: () => string,\n): ReplayedPending {''',
    '''function replayPending(\n  head: ConfirmedBoardHead,\n  pending: readonly PendingBoardCommand[],\n): ReplayedPending {''',
)
text = text.replace(
    "    const command = rebaseCommand(document, item.command, now());",
    "    const command = rebaseCommand(document, item.command);",
)
text = text.replace(
    "          command,\n        );\n        this.#pending = [...this.#pending, queued];",
    "          command,\n          { baseRevisionAtCreation: this.#confirmed.revision },\n        );\n        this.#pending = [...this.#pending, queued];",
    1,
)
text = text.replace(
    "          const command = rebaseCommand(document, candidate, this.#now());",
    "          const command = rebaseCommand(document, candidate);",
)
text = text.replace(
    "            command,\n          );\n          this.#pending = [...this.#pending, queued];",
    "            command,\n            { baseRevisionAtCreation: this.#confirmed.revision },\n          );\n          this.#pending = [...this.#pending, queued];",
    1,
)
text = text.replace("replayPending(head, this.#pending, this.#now)", "replayPending(head, this.#pending)")
text = text.replace("replayPending(cached, this.#pending, this.#now)", "replayPending(cached, this.#pending)")
text = text.replace(
    '''replayPending(\n          this.#confirmed,\n          this.#pending,\n          this.#now,\n        )''',
    "replayPending(this.#confirmed, this.#pending)",
)
text = text.replace(
    "replayPending(this.#confirmed, this.#pending, this.#now)",
    "replayPending(this.#confirmed, this.#pending)",
)
text = text.replace("            commands: [first.command],", "            commands: [orderedFromPending(first)],")
text = text.replace('            schemaVersion: "1.2",', '            schemaVersion: "1.3",')
old_duplicate = '''      if (\n        accepted.envelope.commands.length !== 1 ||\n        JSON.stringify(accepted.envelope.commands[0]) !==\n          JSON.stringify(item.command)\n      ) {'''
new_duplicate = '''      const acceptedCommands = commandsFromBatch(accepted);\n      if (\n        acceptedCommands.length !== 1 ||\n        JSON.stringify(acceptedCommands[0]) !== JSON.stringify(item.command)\n      ) {'''
if old_duplicate not in text:
    raise SystemExit("idempotency comparison missing")
text = text.replace(old_duplicate, new_duplicate)
sync.write_text(text, encoding="utf-8")

# HTTP reader accepts historical 1.0/1.2 and current 1.3 envelopes.
client = Path("src/adapters/board-http/client.ts")
text = client.read_text(encoding="utf-8")
old_envelope = '''const envelopeSchema = z\n  .object({\n    actorId: identifierSchema,\n    baseRevision: z.number().int().nonnegative(),\n    commands: z.array(z.unknown()).min(1).max(100),\n    documentId: identifierSchema,\n    expectedDocumentSha256: sha256Schema,\n    idempotencyKey: z.string().min(1).max(128),\n    schemaVersion: z.literal("1.2"),\n  })\n  .strict();'''
new_envelope = '''const envelopeBase = {\n  actorId: identifierSchema,\n  baseRevision: z.number().int().nonnegative(),\n  documentId: identifierSchema,\n  expectedDocumentSha256: sha256Schema,\n  idempotencyKey: z.string().min(1).max(128),\n} as const;\nconst commandOrderSchema = z\n  .object({\n    baseRevisionAtCreation: z.number().int().nonnegative(),\n    lamport: z.number().int().positive(),\n  })\n  .strict();\nconst legacyEnvelopeSchema = z\n  .object({\n    ...envelopeBase,\n    commands: z.array(z.unknown()).min(1).max(100),\n    schemaVersion: z.enum(["1.0", "1.2"]),\n  })\n  .strict();\nconst orderedEnvelopeSchema = z\n  .object({\n    ...envelopeBase,\n    commands: z\n      .array(\n        z\n          .object({ command: z.unknown(), order: commandOrderSchema })\n          .strict(),\n      )\n      .min(1)\n      .max(100),\n    schemaVersion: z.literal("1.3"),\n  })\n  .strict();\nconst envelopeSchema = z.discriminatedUnion("schemaVersion", [\n  legacyEnvelopeSchema,\n  orderedEnvelopeSchema,\n]);'''
if old_envelope not in text:
    raise SystemExit("HTTP envelope schema missing")
text = text.replace(old_envelope, new_envelope)
old_batch = '''  return {\n    ...parsed.data,\n    envelope: {\n      ...parsed.data.envelope,\n      actorId: actorId(parsed.data.envelope.actorId),\n      commands: parsed.data.envelope.commands.map(parseServerCommand),\n      documentId: documentId(parsed.data.envelope.documentId),\n    },\n  };'''
new_batch = '''  const envelope = parsed.data.envelope;\n  return {\n    ...parsed.data,\n    envelope:\n      envelope.schemaVersion === "1.3"\n        ? {\n            ...envelope,\n            actorId: actorId(envelope.actorId),\n            commands: envelope.commands.map(({ command, order }) => ({\n              command: parseServerCommand(command),\n              order,\n            })),\n            documentId: documentId(envelope.documentId),\n          }\n        : {\n            ...envelope,\n            actorId: actorId(envelope.actorId),\n            commands: envelope.commands.map(parseServerCommand),\n            documentId: documentId(envelope.documentId),\n          },\n  };'''
if old_batch not in text:
    raise SystemExit("HTTP batch parser missing")
client.write_text(text.replace(old_batch, new_batch), encoding="utf-8")

# Machine-readable board contract v1.3.
contract = Path("scripts/board-contract-lib.mjs")
text = contract.read_text(encoding="utf-8")
text = text.replace(
    'const nonNegativeInteger = { minimum: 0, type: "integer" };',
    'const nonNegativeInteger = { minimum: 0, type: "integer" };\nconst positiveInteger = { minimum: 1, type: "integer" };',
)
old_definitions = '''const commandDefinitions = {\n  ...boardDefinitions,\n  ...commands,\n  BoardCommand: boardCommand,\n};'''
new_definitions = '''const commandOrder = strictObject({\n  baseRevisionAtCreation: nonNegativeInteger,\n  lamport: positiveInteger,\n});\nconst orderedBoardCommand = strictObject({\n  command: reference("BoardCommand"),\n  order: reference("BoardCommandOrder"),\n});\nconst commandDefinitions = {\n  ...boardDefinitions,\n  ...commands,\n  BoardCommand: boardCommand,\n  BoardCommandOrder: commandOrder,\n  OrderedBoardCommand: orderedBoardCommand,\n};'''
if old_definitions not in text:
    raise SystemExit("command definitions missing")
text = text.replace(old_definitions, new_definitions)
text = text.replace('    "BoardCommandEnvelope 1.1",', '    "BoardCommandEnvelope 1.3",')
text = text.replace(
    '      commands: array(reference("BoardCommand"), {',
    '      commands: array(reference("OrderedBoardCommand"), {',
    1,
)
text = text.replace('      schemaVersion: { const: "1.2" },', '      schemaVersion: { const: "1.3" },', 1)
text = text.replace(
    '- `BoardCommandEnvelope 1.1` carries one atomic, idempotent command batch',
    '- `BoardCommandEnvelope 1.3` carries one atomic, idempotent ordered command batch',
)
old_fixture = '''      commands: [\n        {\n          actorId: "actor:tutor-01",\n          id: "command:rename-08",\n          kind: "core.document.rename",\n          timestamp: "2026-07-28T17:00:00.000Z",\n          title: "Linear functions: lesson summary",\n        },\n        {\n          actorId: "actor:tutor-01",\n          id: "command:smart-ink-09",\n          kind: "core.objects.replace",\n          originals: [smartInkStroke],\n          replacements: [smartInkCircle],\n          timestamp: "2026-07-28T17:00:01.000Z",\n        },\n      ],'''
new_fixture = '''      commands: [\n        {\n          command: {\n            actorId: "actor:tutor-01",\n            id: "command:rename-08",\n            kind: "core.document.rename",\n            timestamp: "2026-07-28T17:00:00.000Z",\n            title: "Linear functions: lesson summary",\n          },\n          order: { baseRevisionAtCreation: 7, lamport: 8 },\n        },\n        {\n          command: {\n            actorId: "actor:tutor-01",\n            id: "command:smart-ink-09",\n            kind: "core.objects.replace",\n            originals: [smartInkStroke],\n            replacements: [smartInkCircle],\n            timestamp: "2026-07-28T17:00:01.000Z",\n          },\n          order: { baseRevisionAtCreation: 7, lamport: 9 },\n        },\n      ],'''
if old_fixture not in text:
    raise SystemExit("command fixture missing")
text = text.replace(old_fixture, new_fixture)
text = text.replace('      schemaVersion: "1.2",', '      schemaVersion: "1.3",', 1)
text = text.replace('      boardCommandEnvelope: "1.0",', '      boardCommandEnvelope: "1.3",')
contract.write_text(text, encoding="utf-8")

# Conflict policy documentation.
adr = Path("docs/adr/ADR-011-server-board-sync.md")
text = adr.read_text(encoding="utf-8")
old_policy = '''Remote batches are applied first. Pending local commands are then replayed in\ntheir durable order. A stale timestamp is moved to the first millisecond after\nthe confirmed document timestamp; other reducer conflicts stop automatic\nrebase and open the recovery UI.'''
new_policy = '''Remote batches are applied first in server-revision order. Pending local\ncommands are then replayed in durable sequence order. Each queued command keeps\nits Lamport value and base revision observed at creation. Wall-clock timestamps\nserve audit and presentation; reducer conflicts stop automatic rebase and open\nthe recovery UI.'''
if old_policy not in text:
    raise SystemExit("ADR conflict policy missing")
adr.write_text(text.replace(old_policy, new_policy), encoding="utf-8")
