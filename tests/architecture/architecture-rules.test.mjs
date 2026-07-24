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

  it("requires adapters to consume the core public contract", () => {
    expect(
      analyze(
        "adapters/canvas-konva/BoardStage.tsx",
        'import type { ViewportState } from "../../core/board/primitives";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-001",
      }),
    ]);
  });

  it("prevents the canvas adapter from owning documents or reducers", () => {
    expect(
      analyze(
        "adapters/canvas-konva/BoardStage.tsx",
        'import { reduceBoardDocument } from "../../core/public";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "CANVAS-007",
      }),
    ]);
  });

  it("allows the canvas adapter to consume the renderer read model", () => {
    expect(
      analyze(
        "adapters/canvas-konva/BoardStage.tsx",
        'import type { BoardSceneReadModel } from "../../core/public";',
      ),
    ).toEqual([]);
  });

  it("requires app composition to use adapter public contracts", () => {
    expect(
      analyze(
        "app/App.tsx",
        'import { BoardStage } from "../adapters/canvas-konva/BoardStage";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-004",
      }),
    ]);
  });

  it("requires app composition to use module public contracts", () => {
    expect(
      analyze(
        "app/App.tsx",
        'import { drawingTools } from "../modules/drawing/tools";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-004",
      }),
    ]);
  });

  it("requires feature modules to use the core public contract", () => {
    expect(
      analyze(
        "modules/drawing/interaction.ts",
        'import type { Vec2 } from "../../core/board/primitives";',
      ),
    ).toEqual([
      expect.objectContaining({
        invariant: "ARCH-001",
      }),
    ]);
  });
});
