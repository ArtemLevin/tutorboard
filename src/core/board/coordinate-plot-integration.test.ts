import { describe, expect, it } from "vitest";

import { reduceBoardDocument } from "./commands/reducer";
import {
  coordinatePlotExpressionLanguage,
  type CoordinatePlotDefinition,
} from "./coordinate-plot";
import { createEmptyBoardDocument } from "./document";
import {
  actorId,
  boardObjectId,
  commandId,
  documentId,
  plotSeriesId,
} from "./identifiers";
import { migrateBoardDocument10To11 } from "./migrations";
import type { CoordinatePlotObject } from "./objects";

function definition(expression = "x^2"): CoordinatePlotDefinition {
  return {
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
      yMax: 10,
      yMin: -10,
    },
    expressionLanguage: coordinatePlotExpressionLanguage,
    grid: {
      automaticStep: true,
      majorVisible: true,
      minorVisible: false,
      visible: true,
      xStep: null,
      yStep: null,
    },
    legend: { position: "top-right", visible: true },
    parameters: [],
    series: [
      {
        domain: { maxExpression: null, minExpression: null },
        expression,
        id: plotSeriesId("series-main"),
        kind: "explicit",
        name: "f",
        style: {
          lineStyle: "solid",
          opacity: 1,
          stroke: "#2563eb",
          strokeWidth: 3,
        },
        visible: true,
      },
    ],
    size: { height: 420, width: 640 },
  };
}

function plot(): CoordinatePlotObject {
  return {
    definition: definition(),
    groupId: null,
    id: boardObjectId("plot-1"),
    kind: "math.coordinate-plot",
    locked: false,
    position: { x: 20, y: 30 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: "#ffffff",
      opacity: 1,
      stroke: "#64748b",
      strokeWidth: 1,
    },
    visible: true,
  };
}

describe("coordinate plot integration", () => {
  it("migrates a 1.0 document to 1.1", () => {
    const current = createEmptyBoardDocument({
      createdAt: "2026-07-31T17:00:00.000Z",
      id: documentId("document-1"),
      title: "Board",
    });
    const migrated = migrateBoardDocument10To11({
      ...current,
      schemaVersion: "1.0",
    });
    expect(migrated.ok).toBe(true);
    if (migrated.ok) expect(migrated.document.schemaVersion).toBe("1.4");
  });

  it("updates a coordinate plot through a stale-safe command", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-07-31T17:00:00.000Z",
      id: documentId("document-2"),
      title: "Board",
    });
    const object = plot();
    const document = {
      ...empty,
      objects: { [object.id]: object },
      order: [object.id],
    };
    const replacement = definition("x^3");
    const result = reduceBoardDocument(document, {
      actorId: actorId("actor-1"),
      expected: object.definition,
      id: commandId("command-1"),
      kind: "core.coordinate-plot.update",
      objectId: object.id,
      replacement,
      timestamp: "2026-07-31T17:01:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const updated = result.document.objects[object.id];
      expect(updated?.kind).toBe("math.coordinate-plot");
      if (updated?.kind === "math.coordinate-plot") {
        expect(updated.definition.series[0]).toMatchObject({
          expression: "x^3",
        });
      }
    }
  });

  it("rejects a stale coordinate plot snapshot", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-07-31T17:00:00.000Z",
      id: documentId("document-3"),
      title: "Board",
    });
    const object = plot();
    const result = reduceBoardDocument(
      {
        ...empty,
        objects: { [object.id]: object },
        order: [object.id],
      },
      {
        actorId: actorId("actor-1"),
        expected: definition("x"),
        id: commandId("command-2"),
        kind: "core.coordinate-plot.update",
        objectId: object.id,
        replacement: definition("x^3"),
        timestamp: "2026-07-31T17:01:00.000Z",
      },
    );
    expect(result).toMatchObject({
      error: { code: "command.stale-object" },
      ok: false,
    });
  });
});
