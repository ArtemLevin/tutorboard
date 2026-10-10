import { describe, expect, it, vi } from "vitest";

import {
  actorId,
  commandId,
  reduceBoardDocument,
  validateBoardDocument,
  type BoardDocument,
} from "../../src/core/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
} from "../../src/modules/history/public";
import { createDenseBoardDocument } from "../fixtures/dense-board";

const capturedValidation = vi.hoisted(() => ({
  active: false,
  durationsMs: [] as number[],
}));

// The actual reducer retains its unmodified production implementation.
// Wrap its existing imported validator to measure BOTH invocations directly,
// including Zod schema parse and cross-reference checks. This mock is scoped
// to this isolated Vitest performance file and never changes production code.
vi.mock("../../src/core/board/validation/validate", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/core/board/validation/validate")
    >();
  return {
    ...actual,
    validateBoardDocument(input: unknown) {
      const startedAtMs = performance.now();
      try {
        return actual.validateBoardDocument(input);
      } finally {
        if (capturedValidation.active) {
          capturedValidation.durationsMs.push(performance.now() - startedAtMs);
        }
      }
    },
  };
});

interface TimingSample {
  readonly reducerMs: number;
  readonly inputValidationMs: number;
  readonly resultValidationMs: number;
  readonly historyMs: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function describeTiming(samples: readonly TimingSample[]) {
  const columns = [
    "reducerMs",
    "inputValidationMs",
    "resultValidationMs",
    "historyMs",
  ] as const;
  return Object.fromEntries(
    columns.map((column) => [
      column,
      {
        p50Ms: median(samples.map((sample) => sample[column])),
        p95Ms: percentile(
          samples.map((sample) => sample[column]),
          0.95,
        ),
        maxMs: Math.max(...samples.map((sample) => sample[column])),
      },
    ]),
  );
}

function validatedDenseDocument(strokes: number): BoardDocument {
  const fixture = createDenseBoardDocument({
    strokeCount: strokes,
    visibleStrokeCount: Math.floor(strokes / 2),
    strokeGeometry: "varied",
    staticCount: 6,
    gifCount: 4,
    zOrderPattern: "alternating",
  });
  const read = validateBoardDocument(fixture);
  expect(read.valid).toBe(true);
  if (!read.valid) throw new Error("Invalid C3.9-C fixture");
  return read.document;
}

function viewportCommand(index: number) {
  return {
    actorId: actorId("actor:c39-performance"),
    id: commandId(`command:c39-viewport:${index}`),
    kind: "core.viewport.set" as const,
    timestamp: "2026-10-10T12:00:00.000Z",
    viewport: {
      offset: { x: -index * 7, y: -index * 3 },
      zoom: 1 + index * 0.007,
    },
  };
}

describe("C3.9-C controlled viewport command cost", () => {
  it("attributes reducer's two full validations and separately times 100-entry history", () => {
    for (const strokes of [300, 1_000, 3_000, 5_000]) {
      const document = validatedDenseDocument(strokes);
      // Populate a realistic bounded undo history before timing; each entry
      // is an immutable snapshot holding the SAME content references.
      let history = createDocumentHistory<BoardDocument>(document);
      for (let index = 0; index < 100; index += 1) {
        history = commitDocumentHistory(history, {
          ...document,
          updatedAt: "2026-10-10T11:00:00.000Z",
        });
      }
      expect(history.past).toHaveLength(100);
      const samples: TimingSample[] = [];
      for (let index = 0; index < 9; index += 1) {
        capturedValidation.durationsMs.length = 0;
        const command = viewportCommand(index + 1);
        capturedValidation.active = true;
        const startReducerMs = performance.now();
        let result;
        try {
          result = reduceBoardDocument(document, command);
        } finally {
          capturedValidation.active = false;
        }
        const reducerMs = performance.now() - startReducerMs;
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("Viewport command rejected");
        expect(capturedValidation.durationsMs).toHaveLength(2);
        const [inputValidationMs, resultValidationMs] =
          capturedValidation.durationsMs as [number, number];
        expect(result.document.objects).toBe(document.objects);
        expect(result.document.order).toBe(document.order);
        const startHistoryMs = performance.now();
        history = commitDocumentHistory(history, result.document);
        const historyMs = performance.now() - startHistoryMs;
        expect(history.past).toHaveLength(100);
        expect(history.present).toBe(result.document);
        if (index >= 2) {
          samples.push({
            reducerMs,
            inputValidationMs,
            resultValidationMs,
            historyMs,
          });
        }
      }
      const med = describeTiming(samples);
      console.info(
        "C39_VIEWPORT_COMMAND_COST",
        JSON.stringify({
          strokes,
          media: { png: 6, gif: 4 },
          samples: samples.length,
          historyCapacity: history.limit,
          ...med,
          validationShareOfReducerMedian: median(
            samples.map(
              ({ inputValidationMs, resultValidationMs, reducerMs }) =>
                (inputValidationMs + resultValidationMs) /
                Math.max(reducerMs, 0.001),
            ),
          ),
        }),
      );
      expect(samples).toHaveLength(7);
      for (const item of samples) {
        expect(item.reducerMs).toBeGreaterThanOrEqual(
          item.inputValidationMs + item.resultValidationMs,
        );
        expect(item.historyMs).toBeGreaterThanOrEqual(0);
      }
    }
  }, 120_000);

  it("rejects unknown viewport or offset fields required by the strict document schema", () => {
    const document = validatedDenseDocument(6);
    const withUnknownViewportField = {
      ...viewportCommand(7),
      viewport: {
        offset: { x: 0, y: 0 },
        zoom: 1.1,
        injected: "unexpected",
      },
    };
    const withUnknownOffsetField = {
      ...viewportCommand(8),
      viewport: {
        offset: { x: 0, y: 0, injected: "unexpected" },
        zoom: 1.1,
      },
    };
    const extraViewportField = reduceBoardDocument(document, withUnknownViewportField);
    const extraOffsetField = reduceBoardDocument(document, withUnknownOffsetField);
    for (const result of [extraViewportField, extraOffsetField]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("command.invalid-result");
        expect(result.document).toBe(document);
      }
    }
  });

  it("preserves invalid input rejection and does not accept invalid viewport", () => {
    const document = validatedDenseDocument(6);
    const tampered: BoardDocument = {
      ...document,
      order: [
        document.order[0]!,
        document.order[0]!,
        ...document.order.slice(2),
      ],
    };
    capturedValidation.durationsMs.length = 0;
    capturedValidation.active = true;
    let invalidDocument;
    let invalidViewport;
    try {
      invalidDocument = reduceBoardDocument(tampered, viewportCommand(1));
      expect(capturedValidation.durationsMs).toHaveLength(1);
      capturedValidation.durationsMs.length = 0;
      invalidViewport = reduceBoardDocument(document, {
        ...viewportCommand(2),
        viewport: { offset: { x: 0, y: 0 }, zoom: -1 },
      });
      expect(capturedValidation.durationsMs).toHaveLength(1);
    } finally {
      capturedValidation.active = false;
    }
    expect(invalidDocument.ok).toBe(false);
    if (!invalidDocument.ok) {
      expect(invalidDocument.error.code).toBe(
        "command.invalid-current-document",
      );
      expect(invalidDocument.document).toBe(tampered);
    }
    expect(invalidViewport.ok).toBe(false);
    if (!invalidViewport.ok) {
      expect(invalidViewport.error.code).toBe("command.invalid");
      expect(invalidViewport.document).toBe(document);
    }
  });
});
