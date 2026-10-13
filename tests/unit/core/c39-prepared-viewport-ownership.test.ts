import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  createPreparedViewportReducer,
  reduceBoardDocument,
  serializeBoardDocument,
  validateBoardDocument,
  type BoardDocument,
  type SetViewportCommand,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function fixture(strokes = 8): BoardDocument {
  const result = validateBoardDocument(
    createDenseBoardDocument({
      strokeCount: strokes,
      staticCount: 2,
      strokeGeometry: "varied",
    }),
  );
  if (!result.valid) throw new Error("Invalid dense document fixture");
  return result.document;
}

function command(index: number): SetViewportCommand {
  return {
    actorId: actorId("actor:viewport-owned"),
    id: commandId(`command:viewport-owned:${index}`),
    kind: "core.viewport.set",
    timestamp: "2026-10-13T08:30:00.000Z",
    viewport: {
      zoom: 1 + index / 100,
      offset: { x: index * 5, y: -index * 3 },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("C3.9 prevalidated viewport fast path", () => {
  it("matches public command outputs and preserves the external source graph", () => {
    const original = fixture();
    const session = createPreparedViewportReducer();
    const first = session.reduce(session.prepare(original), command(1));
    const expected = reduceBoardDocument(original, command(1));
    expect(first).toEqual(expected);
    if (!first.ok || !expected.ok) throw new Error("Viewport command failed");
    expect(first.document).not.toBe(original);
    expect(first.document.objects).not.toBe(original.objects);
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(original.objects)).toBe(false);
    expect(Object.isFrozen(first.document)).toBe(true);
    expect(Object.isFrozen(first.document.objects)).toBe(true);
    const firstInk = first.document.objects[first.document.order[0]!];
    expect(Object.isFrozen(firstInk)).toBe(true);
    const second = session.reduce(first.document, command(2));
    if (!second.ok) throw new Error("Second viewport command failed");
    expect(second.document.objects).toBe(first.document.objects);
    expect(second.document.order).toBe(first.document.order);
    expect(second.document).toEqual(
      reduceBoardDocument(expected.document, command(2)).document,
    );
    expect(serializeBoardDocument(second.document)).toEqual(
      serializeBoardDocument(
        reduceBoardDocument(expected.document, command(2)).document,
      ),
    );
  });

  it("performs exactly one full parse and freeze for ten owned viewport commits", () => {
    const events: Array<{
      kind: string;
      startMs: number;
      durationMs: number;
    }> = [];
    vi.stubGlobal("window", { __tutorBoardC37Trace: { events } });
    const session = createPreparedViewportReducer();
    let current = session.prepare(fixture(3_000));
    for (let i = 0; i < 10; i += 1) {
      const next = session.reduce(current, command(i + 1));
      if (!next.ok) throw new Error("Viewport command failed");
      current = next.document;
    }
    const count = (kind: string) =>
      events.filter((event) => event.kind === kind).length;
    expect(count("viewport-owned-prepare")).toBe(1);
    expect(count("viewport-owned-freeze")).toBe(1);
    expect(count("viewport-owned-reuse")).toBe(10);
    expect(count("viewport-apply")).toBe(10);
    expect(current.order.length).toBe(3_002);
    for (const event of events) {
      expect(Number.isFinite(event.durationMs)).toBe(true);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("invalidates ownership for external replacement, undo-like inputs and explicit reset", () => {
    const events: Array<{
      kind: string;
      startMs: number;
      durationMs: number;
    }> = [];
    vi.stubGlobal("window", { __tutorBoardC37Trace: { events } });
    const session = createPreparedViewportReducer();
    const original = fixture();
    const first = session.reduce(session.prepare(original), command(1));
    if (!first.ok) throw new Error("Viewport command failed");
    const second = session.reduce(first.document, command(2));
    if (!second.ok) throw new Error("Viewport command failed");
    const undoLike = session.reduce(first.document, command(3));
    if (!undoLike.ok) throw new Error("Revalidated undo document failed");
    const replacement = { ...undoLike.document, title: "Replaced" };
    const swapped = session.reduce(replacement, command(4));
    if (!swapped.ok) throw new Error("Revalidated replacement failed");
    session.reset();
    const afterReset = session.reduce(swapped.document, command(5));
    if (!afterReset.ok) throw new Error("Revalidated reset failed");
    expect(
      events.filter((event) => event.kind === "viewport-owned-prepare"),
    ).toHaveLength(4);
  });

  it("preserves invalid metadata/result errors and rejects corrupted external documents", () => {
    const session = createPreparedViewportReducer();
    const original = fixture();
    const first = session.reduce(session.prepare(original), command(1));
    if (!first.ok) throw new Error("Viewport command failed");
    const corrupt = { ...first.document, title: "" };
    expect(session.reduce(corrupt, command(2))).toMatchObject({
      ok: false,
      document: corrupt,
      error: { code: "command.invalid-current-document" },
    });
    const afterCorruption = session.reduce(first.document, command(3));
    if (!afterCorruption.ok) throw new Error("Viewport recovery failed");
    const invalidMetadata = {
      ...command(4),
      timestamp: "invalid-timestamp",
    };
    expect(session.reduce(afterCorruption.document, invalidMetadata)).toEqual(
      reduceBoardDocument(afterCorruption.document, invalidMetadata),
    );
    const injected = {
      ...command(5),
      viewport: {
        zoom: 1.1,
        offset: { x: 0, y: 0 },
        unexpected: "payload",
      },
    };
    expect(session.reduce(afterCorruption.document, injected)).toEqual(
      reduceBoardDocument(afterCorruption.document, injected),
    );
    expect(Object.isFrozen(command(5).viewport)).toBe(false);
  });
});
