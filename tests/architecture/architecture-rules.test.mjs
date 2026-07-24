// @vitest-environment node

import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeSource } from "../../scripts/architecture-rules.mjs";

const srcRoot = path.resolve("/repository/src");

function analyze(relativePath, sourceText) {
  return analyzeSource({
    filePath: path.join(srcRoot, relativePath),
    sourceText,
    srcRoot,
  });
}

describe("architecture rules", () => {
  it("rejects runtime libraries from core", () => {
    expect(
      analyze("core/board/document.ts", 'import React from "react";'),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-001",
        specifier: "react",
      }),
    ]);
  });

  it("rejects a core dependency on an adapter", () => {
    expect(
      analyze(
        "core/board/document.ts",
        'import { canvas } from "../../adapters/canvas-konva/public";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-001",
      }),
    ]);
  });

  it("rejects a cross-module deep import", () => {
    expect(
      analyze(
        "modules/drawing/tool.ts",
        'import { selection } from "../selection/internal/store";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-002",
      }),
    ]);
  });

  it("allows a cross-module public contract import", () => {
    expect(
      analyze(
        "modules/drawing/tool.ts",
        'import type { Selection } from "../selection/public";',
      ),
    ).toEqual([]);
  });

  it("rejects composition imports outside app", () => {
    expect(
      analyze(
        "adapters/canvas-konva/stage.ts",
        'import { bootstrap } from "../../app/bootstrap/main";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-004",
      }),
    ]);
  });

  it("detects dynamic imports", () => {
    expect(
      analyze(
        "modules/drawing/tool.ts",
        'const adapter = import("../../adapters/canvas-konva/public");',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-001",
      }),
    ]);
  });

  it.each(["Date.now()", "new Date()", "Math.random()"])(
    "rejects nondeterministic reducer input: %s",
    (expression) => {
      expect(
        analyze(
          "core/board/commands/reducer.ts",
          `const value = ${expression};`,
        ),
      ).toEqual([
        expect.objectContaining({
          invariant: "CMD-003",
        }),
      ]);
    },
  );

  it("rejects Web Crypto ID generation in reducers", () => {
    expect(
      analyze(
        "core/board/commands/reducer.ts",
        "const id = crypto.randomUUID();",
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "CMD-003",
        specifier: "crypto.randomUUID",
      }),
    ]);
  });

  it("allows deterministic command metadata and timestamp parsing", () => {
    expect(
      analyze(
        "core/board/commands/reducer.ts",
        "const timestamp = Date.parse(command.timestamp);",
      ),
    ).toEqual([]);
  });
});
