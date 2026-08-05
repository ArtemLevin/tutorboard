import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const runtimeBoundaries = [
  "src/adapters/persistence-dexie/sync-queue.ts",
  "src/modules/server-sync/sync.ts",
] as const;

describe("BoardCommand runtime boundary", () => {
  it("does not cast unvalidated unknown storage or network payloads", () => {
    for (const relativePath of runtimeBoundaries) {
      const source = fs.readFileSync(
        path.join(repositoryRoot, relativePath),
        "utf8",
      );
      expect(source, relativePath).not.toMatch(
        /as\s+unknown\s+as\s+BoardCommand/u,
      );
    }
  });

  it("routes pending storage through the versioned command codec", () => {
    const source = fs.readFileSync(
      path.join(
        repositoryRoot,
        "src/adapters/persistence-dexie/sync-queue.ts",
      ),
      "utf8",
    );
    expect(source).toContain("readBoardCommandJson");
    expect(source).toContain("boardCommandSha256");
    expect(source).toContain("boardCommandSchemaVersion");
  });
});
