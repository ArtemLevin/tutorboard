import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  createOwnedViewportReducer,
  readBoardDocument,
  reduceBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
  type SetViewportCommand,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function fixture(strokeCount = 8): BoardDocument {
  const result = readBoardDocument(
    createDenseBoardDocument({ strokeCount, staticCount: 2 }),
  );
  if (result.status !== "ok") throw new Error("Invalid large board fixture");
  return result.document;
}

function wheel(index: number): SetViewportCommand {
  return {
    actorId: actorId("actor:s6-viewport"),
    id: commandId(`command:s6-viewport-${index}`),
    kind: "core.viewport.set",
    timestamp: "2026-10-11T16:00:00.000Z",
    viewport: {
      offset: { x: index * 5, y: -index * 3 },
      zoom: 1 + index / 100,
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("C3.9-S6.3 owned viewport reducer", () => {
  it("preserves public reduction semantics, undo snapshots and serialized output", () => {
    const initial = fixture();
    const reducer = createOwnedViewportReducer();
    const first = reducer(initial, wheel(1));
    const baseline = reduceBoardDocument(initial, wheel(1));
    expect(first.ok).toBe(true);
    expect(first).toEqual(baseline);
    if (!first.ok || !baseline.ok) return;

    expect(first.document).not.toBe(initial);
    expect(Object.isFrozen(initial)).toBe(false);
    expect(Object.isFrozen(first.document)).toBe(true);
    expect(Object.isFrozen(first.document.objects)).toBe(true);
    const ink = first.document.objects[first.document.order[0]!];
    expect(ink).toBeDefined();
    expect(Object.isFrozen(ink)).toBe(true);
    expect(first.document.objects).not.toBe(initial.objects);
    expect(serializeBoardDocument(first.document)).toEqual(
      serializeBoardDocument(baseline.document),
    );

    const second = reducer(first.document, wheel(2));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.document.objects).toBe(first.document.objects);
    expect(second.document.order).toBe(first.document.order);
    expect(second.document.viewport.zoom).toBe(1.02);
    expect(Object.isFrozen(second.document.viewport.offset)).toBe(true);
    expect(second.document).toEqual(
      reduceBoardDocument(baseline.document, wheel(2)).document,
    );
  });

  it("validates only once across repeated owned viewport commits on dense ink", () => {
    const sink: {
      events: Array<{ kind: string; durationMs: number }>;
    } = { events: [] };
    vi.stubGlobal("window", { __tutorBoardC39ViewportTrace: sink });
    const reducer = createOwnedViewportReducer();
    let document = fixture(3_000);
    for (let index = 0; index < 10; index += 1) {
      const result = reducer(document, wheel(index));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Unexpected viewport failure");
      document = result.document;
    }
    expect(
      sink.events.filter(
        (event) => event.kind === "viewport-reduce.prevalidate",
      ),
    ).toHaveLength(1);
    expect(
      sink.events.filter((event) => event.kind === "viewport-reduce.dispatch"),
    ).toHaveLength(10);
    expect(document.order).toHaveLength(3_002);
  });

  it("rejects malformed external documents even after trusted commits", () => {
    const reducer = createOwnedViewportReducer();
    const initial = fixture();
    const first = reducer(initial, wheel(1));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const corrupt = { ...first.document, title: "" } satisfies BoardDocument;
    const bad = reducer(corrupt, wheel(2));
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "command.invalid-current-document" },
      document: corrupt,
    });
    expect(reduceBoardDocument(corrupt, wheel(2))).toMatchObject({
      ok: false,
      error: { code: "command.invalid-current-document" },
    });

    const after = reducer(first.document, wheel(3));
    expect(after.ok).toBe(true);
  });

  it("revalidates swapped undo/redo, hydration and content replacements", () => {
    const sink: {
      events: Array<{ kind: string; durationMs: number }>;
    } = { events: [] };
    vi.stubGlobal("window", { __tutorBoardC39ViewportTrace: sink });
    const reducer = createOwnedViewportReducer();
    const initial = fixture(16);
    const first = reducer(initial, wheel(1));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = reducer(first.document, wheel(2));
    expect(second.ok).toBe(true);

    const undo = reducer(initial, wheel(3));
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    const edited = {
      ...undo.document,
      title: "Updated content",
    } satisfies BoardDocument;
    const editCommit = reducer(edited, wheel(4));
    expect(editCommit.ok).toBe(true);
    const validations = sink.events.filter(
      (event) => event.kind === "viewport-reduce.prevalidate",
    );
    expect(validations).toHaveLength(3);
  });

  it("does not freeze or retain command payloads and preserves error categories", () => {
    const reducer = createOwnedViewportReducer();
    const initial = fixture();
    const validCommand = wheel(1);
    const first = reducer(initial, validCommand);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(validCommand.viewport)).toBe(false);
    expect(Object.isFrozen(validCommand.viewport.offset)).toBe(false);

    const invalidCommand = {
      ...wheel(2),
      viewport: { zoom: -2, offset: { x: 0, y: 0 } },
    } satisfies SetViewportCommand;
    const actual = reducer(first.document, invalidCommand);
    const expected = reduceBoardDocument(first.document, invalidCommand);
    expect(actual).toEqual(expected);

    const invalidMetadata = {
      ...wheel(3),
      timestamp: "invalid-timestamp",
    } satisfies SetViewportCommand;
    expect(reducer(first.document, invalidMetadata)).toEqual(
      reduceBoardDocument(first.document, invalidMetadata),
    );
  });
});
