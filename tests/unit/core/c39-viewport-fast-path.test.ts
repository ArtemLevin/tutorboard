import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  reduceBoardDocument,
  validateBoardDocument,
  type BoardDocument,
  type BoardCommand,
} from "../../../src/core/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from "../../../src/modules/history/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function command(
  index: number,
  viewport: BoardDocument["viewport"],
  timestamp = "2026-10-10T12:00:00.000Z",
) {
  return {
    actorId: actorId("actor:viewport-fast-path"),
    id: commandId(`command:viewport-fast-path:${index}`),
    kind: "core.viewport.set" as const,
    timestamp,
    viewport,
  };
}

function validDocument(strokes: number): BoardDocument {
  const parsed = validateBoardDocument(
    createDenseBoardDocument({
      strokeCount: strokes,
      strokeGeometry: "varied",
      staticCount: 2,
      gifCount: 2,
      zOrderPattern: "alternating",
    }),
  );
  expect(parsed.valid).toBe(true);
  if (!parsed.valid) throw new Error("Invalid test document");
  return parsed.document;
}

/** Emulates the old accept() normalization and full output validation. */
function referenceOutput(
  document: BoardDocument,
  value: BoardCommand & { kind: "core.viewport.set" },
) {
  const previous = Date.parse(document.updatedAt);
  const candidate = Date.parse(value.timestamp);
  const updatedAt =
    Number.isNaN(previous) || Number.isNaN(candidate) || candidate >= previous
      ? value.timestamp
      : document.updatedAt;
  const expected = {
    ...document,
    updatedAt,
    viewport: value.viewport,
  };
  return { expected, validation: validateBoardDocument(expected) };
}

describe("C3.9-D viewport-specific acceptance regression", () => {
  it("matches full candidate validation across valid and strict-invalid viewport shapes", () => {
    const originals = [validDocument(3), validDocument(120)];
    let id = 0;
    const viewports = [
      { offset: { x: 0, y: 0 }, zoom: 1 },
      { offset: { x: -100.5, y: 205.75 }, zoom: 0.2 },
      { offset: { x: 1e7, y: -1e7 }, zoom: 12 },
      { offset: { x: 0, y: 0 }, zoom: Number.MIN_VALUE },
      { offset: { x: 0, y: 0 }, zoom: Infinity },
      { offset: { x: 0, y: 0 }, zoom: -1 },
      { offset: { x: NaN, y: 0 }, zoom: 1 },
      { offset: { x: 0, y: 0, injected: 123 }, zoom: 1 },
      { offset: { x: 0, y: 0 }, zoom: 1, unexpected: "yes" },
    ];
    for (const original of originals) {
      for (const viewport of viewports) {
        for (const timestamp of [
          "2026-10-10T12:00:00.000Z",
          "2026-10-01T12:00:00.000Z", // earlier than creation; accept() clamps
          "2026-10-11T12:00:00+02:00",
        ]) {
          const payload = command(++id, viewport, timestamp);
          const actual = reduceBoardDocument(original, payload);
          if (
            !Number.isFinite(viewport.offset.x) ||
            !Number.isFinite(viewport.offset.y) ||
            !Number.isFinite(viewport.zoom) ||
            viewport.zoom <= 0
          ) {
            expect(actual.ok).toBe(false);
            if (!actual.ok) {
              expect(actual.error.code).toBe("command.invalid");
              expect(actual.document).toBe(original);
            }
            continue;
          }
          const reference = referenceOutput(original, payload);
          expect(actual.ok).toBe(reference.validation.valid);
          if (actual.ok) {
            expect(actual.document).toEqual(reference.expected);
            expect(actual.document.objects).toBe(original.objects);
            expect(actual.document.order).toBe(original.order);
          } else {
            expect(actual.error.code).toBe("command.invalid-result");
            expect(actual.document).toBe(original);
          }
        }
      }
    }
  });

  it("keeps full current-document validation before attempting optimized viewport", () => {
    const document = validDocument(25);
    const corrupt = {
      ...document,
      order: [
        document.order[0]!,
        document.order[0]!,
        ...document.order.slice(2),
      ],
    };
    const result = reduceBoardDocument(
      corrupt,
      command(200, {
        offset: { x: 99, y: 0 },
        zoom: 2,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("command.invalid-current-document");
      expect(result.document).toBe(corrupt);
    }
  });

  it("rejects invalid metadata before accepting viewport and preserves history undo/redo", () => {
    const document = validDocument(25);
    const invalid = reduceBoardDocument(
      document,
      command(201, { offset: { x: 0, y: 0 }, zoom: 2 }, "invalid-timestamp"),
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("command.invalid");

    const next = reduceBoardDocument(
      document,
      command(202, {
        offset: { x: -60, y: 90 },
        zoom: 2.5,
      }),
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const history = commitDocumentHistory(
      createDocumentHistory(document),
      next.document,
    );
    expect(undoDocumentHistory(history).present).toBe(document);
    expect(redoDocumentHistory(undoDocumentHistory(history)).present).toBe(
      next.document,
    );
    expect(validateBoardDocument(next.document).valid).toBe(true);
  });
});
