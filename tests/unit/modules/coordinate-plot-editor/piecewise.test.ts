import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createCoordinatePlotRenderModel,
  createEmptyBoardDocument,
  createPlotEndpointMarkers,
  deserializeBoardDocument,
  documentId,
  plotParameterId,
  plotSeriesId,
  serializeBoardDocument,
} from "../../../../src/core/public";
import {
  createDefaultCoordinatePlotObject,
  splitCoordinatePlotSeries,
  updateCoordinatePlotSeriesInput,
} from "../../../../src/modules/coordinate-plot-editor/public";
import { renderBoardSnapshotSvg } from "../../../../src/modules/document-transfer/public";

function createPiecewisePlot() {
  const object = createDefaultCoordinatePlotObject({
    center: { x: 320, y: 210 },
    ids: {
      objectId: boardObjectId("piecewise-test"),
      parameterId: () => plotParameterId("piecewise-a"),
      seriesId: () => plotSeriesId("piecewise-first"),
    },
  });
  const definition = splitCoordinatePlotSeries(
    object.definition,
    object.definition.series[0]!.id,
    plotSeriesId("piecewise-second"),
  );
  return { ...object, definition };
}

describe("piecewise coordinate plots", () => {
  it("splits an existing explicit function into adjacent independent branches", () => {
    const plot = createPiecewisePlot();
    expect(plot.definition.series).toHaveLength(2);
    expect(plot.definition.series[0]).toMatchObject({
      expression: "2*x+a",
      domain: { minExpression: null, maxExpression: "0", maxInclusive: false },
      kind: "explicit",
    });
    expect(plot.definition.series[1]).toMatchObject({
      expression: "x^2",
      domain: { minExpression: "0", minInclusive: true, maxExpression: null },
      kind: "explicit",
    });
    expect(plot.definition.series[0]!.style).toEqual(
      plot.definition.series[1]!.style,
    );
  });

  it("keeps domain restrictions when a piece formula changes", () => {
    const plot = createPiecewisePlot();
    const first = plot.definition.series[0]!;
    const second = plot.definition.series[1]!;
    const changed = updateCoordinatePlotSeriesInput(
      plot.definition,
      first.id,
      "y=-x",
    );
    expect(changed.series[0]).toMatchObject({
      expression: "-x",
      domain: { maxExpression: "0", maxInclusive: false },
    });
    expect(changed.series[1]).toEqual(second);
  });

  it("samples branches separately and distinguishes excluded and included ends", () => {
    const plot = createPiecewisePlot();
    const model = createCoordinatePlotRenderModel({ object: plot, zoom: 1 });
    expect(model.sampling.series.map(({ status }) => status)).toEqual([
      "sampled",
      "sampled",
    ]);
    const markers = createPlotEndpointMarkers(model.definition, model.sampling);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({
      included: false,
      point: { x: 320, y: 180 },
    });
    expect(markers[1]).toMatchObject({
      included: true,
      point: { x: 320, y: 210 },
    });
    const leftSegments = model.sampling.series[0]?.sample?.segments ?? [];
    const rightSegments = model.sampling.series[1]?.sample?.segments ?? [];
    expect(leftSegments.flat().every((point) => point.x <= 320 + 1e-6)).toBe(
      true,
    );
    expect(rightSegments.flat().every((point) => point.x >= 320 - 1e-6)).toBe(
      true,
    );
  });

  it("exports visible open and closed endpoint circles to SVG", () => {
    const plot = createPiecewisePlot();
    const document = createEmptyBoardDocument({
      createdAt: "2026-11-15T08:00:00.000Z",
      id: documentId("document:piecewise-export"),
      title: "Кусочная функция",
    });
    const svg = renderBoardSnapshotSvg({
      ...document,
      objects: { [plot.id]: plot },
      order: [plot.id],
    });
    expect(svg).toContain('data-coordinate-plot-endpoint="open"');
    expect(svg).toContain('data-coordinate-plot-endpoint="closed"');
    expect(svg).toContain('data-coordinate-plot-series-id="piecewise-first"');
    expect(svg).toContain('data-coordinate-plot-series-id="piecewise-second"');
  });

  it("round-trips branch inclusion flags through the existing document schema", () => {
    const plot = createPiecewisePlot();
    const document = createEmptyBoardDocument({
      createdAt: "2026-11-15T08:00:00.000Z",
      id: documentId("document:piecewise"),
      title: "Кусочная функция",
    });
    const stored = {
      ...document,
      objects: { [plot.id]: plot },
      order: [plot.id],
    };
    const serialized = serializeBoardDocument(stored);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    const result = restored.document.objects[plot.id];
    expect(result?.kind).toBe("math.coordinate-plot");
    if (result?.kind !== "math.coordinate-plot") return;
    expect(result.definition.series[0]).toMatchObject({
      domain: { maxExpression: "0", maxInclusive: false },
    });
    expect(result.definition.series[1]).toMatchObject({
      domain: { minExpression: "0", minInclusive: true },
    });
  });
});
