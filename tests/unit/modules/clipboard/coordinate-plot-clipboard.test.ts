import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  geometryImportId,
  groupId,
  plotParameterId,
  plotSeriesId,
  reduceBoardDocument,
  type CoordinatePlotObject,
} from "../../../../src/core/public";
import {
  boardClipboardSchemaVersion,
  copyBoardSelection,
  createPasteContentCommand,
} from "../../../../src/modules/clipboard/public";

const plot: CoordinatePlotObject = {
  definition: {
    axes: {
      showArrows: true,
      showLabels: true,
      showXAxis: true,
      showYAxis: true,
      xLabel: "x",
      yLabel: "y",
    },
    coordinateViewport: {
      equalScale: true,
      xMax: 10,
      xMin: -10,
      yMax: 8,
      yMin: -8,
    },
    expressionLanguage: "tutorboard-expression/1",
    grid: {
      automaticStep: true,
      majorVisible: true,
      minorVisible: false,
      visible: true,
      xStep: null,
      yStep: null,
    },
    legend: { position: "top-right", visible: true },
    parameters: [
      {
        id: plotParameterId("parameter-a"),
        max: 5,
        min: -5,
        name: "a",
        step: 0.1,
        value: 2,
      },
    ],
    series: [
      {
        domain: { maxExpression: null, minExpression: null },
        expression: "a*x^2",
        id: plotSeriesId("series-parabola"),
        kind: "explicit",
        name: "Парабола",
        style: {
          lineStyle: "solid",
          opacity: 1,
          stroke: "#2563eb",
          strokeWidth: 3,
        },
        visible: true,
      },
      {
        closed: true,
        id: plotSeriesId("series-circle"),
        kind: "parametric",
        name: "Окружность",
        parameterName: "t",
        range: { maxExpression: "2*pi", minExpression: "0" },
        style: {
          lineStyle: "dashed",
          opacity: 0.9,
          stroke: "#059669",
          strokeWidth: 2,
        },
        visible: true,
        xExpression: "3*cos(t)",
        yExpression: "3*sin(t)",
      },
    ],
    size: { height: 420, width: 640 },
  },
  groupId: null,
  id: boardObjectId("plot-source"),
  kind: "math.coordinate-plot",
  locked: false,
  position: { x: 80, y: 120 },
  rotation: 12,
  scale: { x: 1.2, y: 1.2 },
  source: { kind: "user" },
  style: {
    fill: "#ffffff",
    opacity: 1,
    stroke: "#64748b",
    strokeWidth: 1,
  },
  visible: true,
};

describe("coordinate plot clipboard lifecycle", () => {
  it("preserves multiple series and local identifiers while remapping the board object", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-07-31T18:00:00.000Z",
      id: documentId("document-coordinate-plot-clipboard"),
      title: "Coordinate plots",
    });
    const document = {
      ...empty,
      objects: { [plot.id]: plot },
      order: [plot.id],
    };

    const copied = copyBoardSelection(document, [plot.id]);
    expect(copied.status).toBe("ok");
    if (copied.status !== "ok") return;
    expect(copied.payload.schemaVersion).toBe(boardClipboardSchemaVersion);

    const command = createPasteContentCommand(
      copied.payload,
      {
        actorId: actorId("actor-coordinate-plot"),
        id: commandId("command-paste-coordinate-plot"),
        timestamp: "2026-07-31T18:01:00.000Z",
      },
      {
        geometryImport: (id) => geometryImportId(`copy:${id}`),
        group: (id) => groupId(`copy:${id}`),
        object: (id) => boardObjectId(`copy:${id}`),
      },
    );
    const pasted = reduceBoardDocument(document, command);

    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const duplicate = pasted.document.objects[boardObjectId("copy:plot-source")];
    expect(duplicate?.kind).toBe("math.coordinate-plot");
    if (duplicate?.kind !== "math.coordinate-plot") return;

    expect(duplicate.position).toEqual({ x: 104, y: 144 });
    expect(duplicate.definition.series.map(({ id }) => id)).toEqual([
      "series-parabola",
      "series-circle",
    ]);
    expect(duplicate.definition.parameters.map(({ id }) => id)).toEqual([
      "parameter-a",
    ]);
    expect(duplicate.definition).toEqual(plot.definition);
    expect(duplicate.definition).not.toBe(plot.definition);
  });
});
