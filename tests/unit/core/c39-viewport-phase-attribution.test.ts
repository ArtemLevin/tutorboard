import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  reduceBoardDocument,
  validateBoardDocument,
  type BoardDocument,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function fixture(): BoardDocument {
  const parsed = validateBoardDocument(
    createDenseBoardDocument({ strokeCount: 32, staticCount: 2 }),
  );
  if (!parsed.valid) throw new Error("Invalid C3.9 viewport fixture");
  return parsed.document;
}

function command(index: number) {
  return {
    actorId: actorId("actor:c39-viewport-phase"),
    id: commandId(`command:c39-viewport-phase:${index}`),
    kind: "core.viewport.set" as const,
    timestamp: "2026-10-13T08:00:00.000Z",
    viewport: {
      offset: { x: index * 7, y: -index * 3 },
      zoom: 1 + index / 100,
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("C3.9 viewport phase attribution", () => {
  it("records bounded phases of the original reducer without changing results", () => {
    const events: Array<{
      kind: string;
      startMs: number;
      durationMs: number;
    }> = [];
    vi.stubGlobal("window", { __tutorBoardC37Trace: { events } });
    const original = fixture();
    const actual = reduceBoardDocument(original, command(1));
    expect(actual.ok).toBe(true);
    expect(actual.document).toBeDefined();
    const kinds = events.map((event) => event.kind);
    expect(kinds).toEqual([
      "viewport-validate-current",
      "viewport-validate-command",
      "viewport-apply",
    ]);
    for (const event of events) {
      expect(Number.isFinite(event.startMs)).toBe(true);
      expect(Number.isFinite(event.durationMs)).toBe(true);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    }
    vi.stubGlobal("window", {});
    const untraced = reduceBoardDocument(original, command(1));
    expect(untraced).toEqual(actual);
    expect(events).toHaveLength(3);
  });

  it("preserves invalid-current and invalid-metadata failure paths", () => {
    const events: Array<{ kind: string; startMs: number; durationMs: number }> = [];
    vi.stubGlobal("window", { __tutorBoardC37Trace: { events } });
    const original = fixture();
    const corrupted = { ...original, title: "" };
    const rejected = reduceBoardDocument(corrupted, command(2));
    expect(rejected).toMatchObject({
      ok: false,
      document: corrupted,
      error: { code: "command.invalid-current-document" },
    });
    expect(events.map((event) => event.kind)).toEqual([
      "viewport-validate-current",
    ]);
    events.length = 0;
    const invalid = reduceBoardDocument(original, {
      ...command(3),
      timestamp: "not-iso",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("command.invalid");
    expect(events.map((event) => event.kind)).toEqual([
      "viewport-validate-current",
      "viewport-validate-command",
    ]);
  });

  it("does not grow a full diagnostic buffer or retain payloads", () => {
    const events = Array.from({ length: 12_000 }, () => ({
      kind: "wheel-input",
      startMs: 0,
      durationMs: 0,
    }));
    vi.stubGlobal("window", { __tutorBoardC37Trace: { events } });
    const result = reduceBoardDocument(fixture(), command(4));
    expect(result.ok).toBe(true);
    expect(events).toHaveLength(12_000);
  });
});
