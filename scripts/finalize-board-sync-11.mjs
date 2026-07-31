import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const [search, replacement, label] of changes) {
    const count = source.split(search).length - 1;
    if (count !== 1) {
      throw new Error(`${path} ${label}: expected one match, received ${count}.`);
    }
    source = source.replace(search, replacement);
  }
  fs.writeFileSync(path, source);
}

patch("src/core/ports/board-sync-repository.ts", [
  [
    '  readonly idempotencyKey: string;\n  readonly schemaVersion: "1.0";\n}',
    '  readonly idempotencyKey: string;\n  readonly schemaVersion: "1.1";\n}',
    "command envelope version",
  ],
  [
    '    readonly documentSha256: string;\n    readonly revision: number;\n    readonly schemaVersion: "1.0";\n  } | null;',
    '    readonly documentSha256: string;\n    readonly revision: number;\n    readonly schemaVersion: "1.1";\n  } | null;',
    "snapshot version",
  ],
]);

patch("src/adapters/board-http/client.ts", [
  [
    '    idempotencyKey: z.string().min(1).max(128),\n    schemaVersion: z.literal("1.0"),',
    '    idempotencyKey: z.string().min(1).max(128),\n    schemaVersion: z.literal("1.1"),',
    "command envelope schema",
  ],
  [
    '              revision: z.number().int().nonnegative(),\n              schemaVersion: z.literal("1.0"),',
    '              revision: z.number().int().nonnegative(),\n              schemaVersion: z.literal("1.1"),',
    "recovery snapshot schema",
  ],
  [
    '            revision,\n            schemaVersion: "1.0",\n          }),',
    '            revision,\n            schemaVersion: "1.1",\n          }),',
    "snapshot request version",
  ],
]);

patch("src/modules/server-sync/sync.ts", [
  [
    '            idempotencyKey: first.idempotencyKey,\n            schemaVersion: "1.0",',
    '            idempotencyKey: first.idempotencyKey,\n            schemaVersion: "1.1",',
    "outgoing envelope version",
  ],
]);
