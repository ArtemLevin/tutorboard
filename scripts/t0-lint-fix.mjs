import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const text = await readFile(path, "utf8");
  if (!text.includes(before)) {
    throw new Error(`Target not found in ${path}`);
  }
  await writeFile(path, text.replace(before, after));
}

await replaceOnce(
  "src/adapters/persistence-dexie/sync-queue.ts",
  `  async setAccessScope(scope: BoardLocalAccessScope): Promise<number> {
    if (
      !cacheScopeSchema.safeParse(scope.cacheScopeId).success ||
      !accessEpochSchema.safeParse(scope.accessEpoch).success
    ) {
      throw new Error("Board access scope is invalid.");
    }
    this.#scope = { ...scope };
    return 0;
  }
`,
  `  setAccessScope(scope: BoardLocalAccessScope): Promise<number> {
    if (
      !cacheScopeSchema.safeParse(scope.cacheScopeId).success ||
      !accessEpochSchema.safeParse(scope.accessEpoch).success
    ) {
      return Promise.reject(new Error("Board access scope is invalid."));
    }
    this.#scope = { ...scope };
    return Promise.resolve(0);
  }
`,
);

await replaceOnce(
  "src/adapters/persistence-dexie/sync-queue.ts",
  `            const context = current.success
              ? current.data
              : previous.success
                ? previous.data
                : legacy.success
                  ? legacy.data
                  : null;
            quarantined.push({
              actorId:
                current.success || previous.success
                  ? (context?.actorId ?? null)
                  : null,
              cacheScopeId: scope.cacheScopeId,
              capturedAt,
              commandSha256:
                current.success || previous.success
                  ? (context?.commandSha256 ?? null)
                  : null,
`,
  `            const context = current.success
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
`,
);

await replaceOnce(
  "src/app/board/controllers/useBoardDocumentController.ts",
  `import { useCallback, useEffect, useRef, useState } from "react";`,
  `import { useCallback, useEffect, useMemo, useRef, useState } from "react";`,
);

await replaceOnce(
  "src/app/board/controllers/useBoardDocumentController.ts",
  `  const effectiveMutationPolicy =
    mutationPolicy ??
    (readOnly
      ? ({ canWrite: false, reason: "missing-board-write" } as const)
      : writableBoardMutationPolicy);
`,
  `  const effectiveMutationPolicy = useMemo(
    () =>
      mutationPolicy ??
      (readOnly
        ? ({ canWrite: false, reason: "missing-board-write" } as const)
        : writableBoardMutationPolicy),
    [mutationPolicy, readOnly],
  );
`,
);
