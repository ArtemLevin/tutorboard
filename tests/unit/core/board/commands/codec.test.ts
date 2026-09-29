import { describe, expect, it } from "vitest";

import {
  boardCommandSha256,
  canonicalBoardCommandJson,
  readBoardCommand,
  readBoardCommandJson,
  serializeBoardCommand,
} from "../../../../../src/core/board/commands/codec/public";
import {
  actorId,
  boardObjectId,
  commandId,
  type BoardCommand,
  type SetViewportCommand,
} from "../../../../../src/core/public";

function viewportCommand(): SetViewportCommand {
  return {
    actorId: actorId("actor:codec-test"),
    id: commandId("command:codec-test"),
    kind: "core.viewport.set",
    timestamp: "2026-08-05T07:00:00.000Z",
    viewport: {
      offset: { x: 120, y: -30 },
      zoom: 1.5,
    },
  };
}

describe("BoardCommand runtime codec", () => {
  it("round-trips a strict command through canonical JSON", () => {
    const command = viewportCommand();
    const serialized = serializeBoardCommand(command);

    expect(serialized).toEqual({
      json: canonicalBoardCommandJson(command),
      ok: true,
    });
    if (!serialized.ok) throw new Error("Expected serialized command.");
    expect(readBoardCommandJson(serialized.json)).toEqual({
      command,
      status: "ok",
    });
  });

  it("rejects unknown fields and unsupported command kinds", () => {
    expect(
      readBoardCommand({ ...viewportCommand(), injected: true }),
    ).toMatchObject({ status: "invalid-command" });
    expect(
      readBoardCommand({
        actorId: "actor:codec-test",
        id: "command:unknown",
        kind: "core.unknown.execute",
        timestamp: "2026-08-05T07:00:00.000Z",
      }),
    ).toMatchObject({ status: "invalid-command" });
  });

  it("rejects incomplete object payloads before reducer execution", () => {
    expect(
      readBoardCommand({
        actorId: "actor:codec-test",
        id: "command:invalid-object",
        kind: "core.objects.add",
        objects: [{ id: "object:broken", kind: "drawing.rectangle" }],
        timestamp: "2026-08-05T07:00:00.000Z",
      }),
    ).toMatchObject({ status: "invalid-command" });
  });

  it("accepts replace commands that delete all originals", () => {
    const original = {
      groupId: null,
      id: boardObjectId("object:codec-delete"),
      kind: "drawing.line" as const,
      locked: false,
      position: { x: 0, y: 0 },
      end: { x: 40, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" as const },
      style: {
        fill: null,
        opacity: 1,
        stroke: "#111827",
        strokeWidth: 2,
      },
      visible: true,
    };
    const command = {
      actorId: actorId("actor:codec-test"),
      id: commandId("command:replace-empty"),
      kind: "core.objects.replace" as const,
      originals: [original],
      replacements: [],
      timestamp: "2026-08-05T07:00:00.000Z",
    };

    expect(readBoardCommand(command)).toEqual({
      command,
      status: "ok",
    });
  });

  it("produces a stable SHA-256 independent of property insertion order", async () => {
    const command = viewportCommand();
    const reordered = {
      viewport: command.viewport,
      timestamp: command.timestamp,
      kind: command.kind,
      id: command.id,
      actorId: command.actorId,
    } satisfies BoardCommand;

    expect(canonicalBoardCommandJson(reordered)).toBe(
      canonicalBoardCommandJson(command),
    );
    expect(await boardCommandSha256(reordered)).toBe(
      await boardCommandSha256(command),
    );
  });

  it("fails closed for malformed and oversized JSON", () => {
    expect(readBoardCommandJson("{")).toEqual({
      raw: "{",
      status: "invalid-json",
    });
    expect(
      readBoardCommandJson(`"${"x".repeat(2 * 1024 * 1024)}"`),
    ).toMatchObject({ status: "too-large" });
  });
});
