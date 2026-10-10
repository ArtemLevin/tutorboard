import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  reduceBoardDocument,
  validateBoardDocument,
  type BoardDocument,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function validDocument(): BoardDocument {
  const parsed = validateBoardDocument(
    createDenseBoardDocument({
      strokeCount: 12,
      staticCount: 2,
      gifCount: 2,
      strokeGeometry: "varied",
    }),
  );
  if (!parsed.valid) throw new Error("Invalid regression fixture");
  return parsed.document;
}

function viewportCommand(
  timestamp: string,
  viewport: {
    readonly offset: { readonly x: number; readonly y: number };
    readonly zoom: number;
  },
) {
  return {
    id: commandId("command:c39-d-viewport"),
    actorId: actorId("actor:c39-d"),
    kind: "core.viewport.set" as const,
    timestamp,
    viewport,
  };
}

describe("C3.9-D viewport-only acceptance parity", () => {
  const document = validDocument();

  it("matches full BoardDocument validation for exact and extra-key viewport shapes", () => {
    const cases = [
      {
        name: "ordinary zoom",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: { offset: { x: 1, y: -2 }, zoom: 1.25 },
      },
      {
        name: "timestamp earlier than document updatedAt (normalization)",
        timestamp: "2026-10-05T15:00:00.000Z",
        viewport: { offset: { x: 0, y: 0 }, zoom: 0.5 },
      },
      {
        name: "offset timezone timestamp",
        timestamp: "2026-10-10T14:01:00+02:00",
        viewport: { offset: { x: 10, y: 4 }, zoom: 1 },
      },
      {
        name: "viewport unknown key",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: { offset: { x: 0, y: 0 }, zoom: 2, unexpected: true },
      },
      {
        name: "offset unknown key",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: {
          offset: { x: 0, y: 0, unexpected: true },
          zoom: 2,
        },
      },
      {
        name: "invalid zoom",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: { offset: { x: 0, y: 0 }, zoom: -1 },
      },
      {
        name: "infinite zoom",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: { offset: { x: 0, y: 0 }, zoom: Number.POSITIVE_INFINITY },
      },
      {
        name: "invalid offset",
        timestamp: "2026-10-10T12:01:00.000Z",
        viewport: { offset: { x: Number.NaN, y: 0 }, zoom: 1 },
      },
      {
        name: "invalid metadata timestamp",
        timestamp: "wrong timestamp",
        viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
      },
      {
        name: "ISO-looking but Zod-invalid timestamp",
        timestamp: "2026-10-10T25:01:00.000Z",
        viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
      },
    ];
    for (const scenario of cases) {
      const command = viewportCommand(scenario.timestamp, scenario.viewport);
      const result = reduceBoardDocument(document, command);
      const candidateTimestamp =
        Date.parse(command.timestamp) < Date.parse(document.updatedAt)
          ? document.updatedAt
          : command.timestamp;
      const legacy = validateBoardDocument({
        ...document,
        updatedAt: candidateTimestamp,
        viewport: scenario.viewport,
      });
      if (
        !Number.isFinite(scenario.viewport.zoom) ||
        scenario.viewport.zoom <= 0 ||
        !Number.isFinite(scenario.viewport.offset.x) ||
        !Number.isFinite(scenario.viewport.offset.y) ||
        Number.isNaN(Date.parse(scenario.timestamp))
      ) {
        expect(result.ok, scenario.name).toBe(false);
        continue;
      }
      expect(result.ok, scenario.name).toBe(legacy.valid);
      if (result.ok && legacy.valid) {
        expect(result.document).toEqual(legacy.document);
        expect(result.document.objects).toBe(document.objects);
        expect(result.document.order).toBe(document.order);
        expect(result.document.groups).toBe(document.groups);
        expect(result.document.viewport).toBe(scenario.viewport);
      } else if (!result.ok) {
        expect(result.error.code, scenario.name).toBe("command.invalid-result");
        expect(result.document).toBe(document);
      }
    }
  });

  it("continues to reject malformed current documents before the viewport fast path", () => {
    const corrupted: BoardDocument = {
      ...document,
      order: [
        document.order[0]!,
        document.order[0]!,
        ...document.order.slice(2),
      ],
    };
    const result = reduceBoardDocument(
      corrupted,
      viewportCommand("2026-10-10T12:01:00.000Z", {
        offset: { x: 0, y: 0 },
        zoom: 1,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("command.invalid-current-document");
      expect(result.document).toBe(corrupted);
    }
  });

  it("other commands still use full result validation", () => {
    const result = reduceBoardDocument(document, {
      id: commandId("command:c39-d-rename"),
      actorId: actorId("actor:c39-d"),
      kind: "core.document.rename",
      timestamp: "2026-10-10T12:01:00.000Z",
      title: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("command.invalid-result");
      expect(result.document).toBe(document);
    }
  });
});
