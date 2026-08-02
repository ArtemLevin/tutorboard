import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  plotParameterId,
  plotSeriesId,
  reduceBoardDocument,
  validateCoordinatePlotDefinition,
} from "../../../src/core/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
  undoDocumentHistory,
} from "../../../src/modules/history/public";
import type {
  HandwrittenFunctionInterpretedCandidate,
  HandwrittenFunctionStroke,
} from "../../../src/modules/handwritten-function/public";
import {
  createHandwrittenFunctionPlotObject,
  createHandwrittenFunctionReplaceCommand,
  createHandwrittenFunctionStrokeObjects,
  handwrittenFunctionSourceStillApplies,
  interpretHandwrittenFunctionDraft,
} from "../../../src/app/handwritten-function-composition";

const strokes: readonly HandwrittenFunctionStroke[] = [
  {
    id: "stroke:1",
    points: [
      { timeMs: 10, x: 20, y: 30 },
      { timeMs: 20, x: 80, y: 50 },
      { timeMs: 30, x: 120, y: 35 },
    ],
  },
  {
    id: "stroke:2",
    points: [
      { timeMs: 40, x: 55, y: 10 },
      { timeMs: 50, x: 55, y: 70 },
    ],
  },
];

const candidate: HandwrittenFunctionInterpretedCandidate = {
  candidateIndex: 0,
  confidence: 0.96,
  expression: "a*x^2+b",
  normalizedExpression: "a*x^2+b",
  parameters: ["a", "b"],
  sourceExpression: "a*x^2+b",
  sourceFormat: "plot-expression",
};

function metadata(sequence: number) {
  return {
    actorId: actorId("actor:test"),
    id: commandId(`command:test:${sequence}`),
    timestamp: `2026-08-02T17:00:0${sequence}.000Z`,
  };
}

describe("handwritten function composition", () => {
  it("materializes deterministic user pen strokes", () => {
    const objects = createHandwrittenFunctionStrokeObjects({
      ids: {
        objectId: (_stroke, index) =>
          boardObjectId(`object:handwriting:test:${index}`),
      },
      strokes,
    });

    expect(objects).toHaveLength(2);
    expect(objects[0]).toMatchObject({
      id: "object:handwriting:test:0",
      kind: "drawing.pen-stroke",
      locked: false,
      position: { x: 0, y: 0 },
      source: { kind: "user" },
      visible: true,
    });
    expect(objects[0]?.points[0]).toEqual({ x: 20, y: 30 });
    expect(objects[1]?.points.at(-1)).toEqual({ x: 55, y: 70 });
  });

  it("builds one fitted explicit plot with ordered parameter defaults", () => {
    const object = createHandwrittenFunctionPlotObject({
      bounds: {
        height: 60,
        maxX: 120,
        maxY: 70,
        minX: 20,
        minY: 10,
        width: 100,
      },
      candidate,
      ids: {
        objectId: boardObjectId("object:plot:handwriting:test"),
        parameterId: (_name, index) =>
          plotParameterId(`plot-parameter:handwriting:test:${index}`),
        seriesId: plotSeriesId("plot-series:handwriting:test"),
      },
    });

    expect(object.position).toEqual({ x: -250, y: -170 });
    expect(object.definition.series).toEqual([
      expect.objectContaining({
        expression: "a*x^2+b",
        kind: "explicit",
        name: "Рукописная функция",
      }),
    ]);
    expect(object.definition.parameters).toEqual([
      {
        id: "plot-parameter:handwriting:test:0",
        max: 10,
        min: -10,
        name: "a",
        step: 0.1,
        value: 1,
      },
      {
        id: "plot-parameter:handwriting:test:1",
        max: 10,
        min: -10,
        name: "b",
        step: 0.1,
        value: 1,
      },
    ]);
    expect(validateCoordinatePlotDefinition(object.definition)).toEqual([]);
  });

  it("revalidates edited expressions through the PR 2 interpreter", () => {
    const valid = interpretHandwrittenFunctionDraft("b*x+a");
    expect(valid.status).toBe("accepted");
    expect(valid.selected?.parameters).toEqual(["b", "a"]);

    const invalid = interpretHandwrittenFunctionDraft("sqrt()");
    expect(invalid.status).toBe("rejected");
    expect(invalid.diagnostics.map(({ code }) => code)).toContain(
      "expression.invalid-function-arity",
    );
  });

  it("atomically replaces source ink and one undo restores every stroke", () => {
    const sourceObjects = createHandwrittenFunctionStrokeObjects({
      ids: {
        objectId: (_stroke, index) =>
          boardObjectId(`object:handwriting:undo:${index}`),
      },
      strokes,
    });
    const plot = createHandwrittenFunctionPlotObject({
      bounds: {
        height: 60,
        maxX: 120,
        maxY: 70,
        minX: 20,
        minY: 10,
        width: 100,
      },
      candidate,
      ids: {
        objectId: boardObjectId("object:plot:handwriting:undo"),
        parameterId: (_name, index) =>
          plotParameterId(`plot-parameter:handwriting:undo:${index}`),
        seriesId: plotSeriesId("plot-series:handwriting:undo"),
      },
    });
    const empty = createEmptyBoardDocument({
      createdAt: "2026-08-02T17:00:00.000Z",
      id: documentId("document:handwriting-test"),
      title: "Handwriting test",
    });
    const added = reduceBoardDocument(empty, {
      ...metadata(1),
      kind: "core.objects.add",
      objects: sourceObjects,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(
      handwrittenFunctionSourceStillApplies(added.document, sourceObjects),
    ).toBe(true);

    const replaced = reduceBoardDocument(
      added.document,
      createHandwrittenFunctionReplaceCommand(metadata(2), sourceObjects, plot),
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.document.order).toEqual([plot.id]);

    let history = createDocumentHistory(empty);
    history = commitDocumentHistory(history, added.document);
    history = commitDocumentHistory(history, replaced.document);
    const undone = undoDocumentHistory(history);
    expect(undone.present.order).toEqual(sourceObjects.map(({ id }) => id));
    expect(undone.present.objects[plot.id]).toBeUndefined();
  });
});
