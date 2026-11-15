import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createCoordinatePlotRenderModel,
  createEmptyBoardDocument,
  deserializeBoardDocument,
  documentId,
  plotParameterId,
  plotDataToLocalPoint,
  plotSeriesId,
  serializeBoardDocument,
  validateCoordinatePlotDefinition,
  type ExplicitPlotSeries,
} from "../../../../src/core/public";
import {
  createDefaultCoordinatePlotObject,
  fitCoordinatePlotDefinition,
  splitCoordinatePlotSeries,
  validateCoordinatePlotEditorDefinition,
} from "../../../../src/modules/coordinate-plot-editor/public";

function createPlot() {
  return createDefaultCoordinatePlotObject({
    center: { x: 320, y: 210 },
    ids: {
      objectId: boardObjectId("piecewise-correction-plot"),
      parameterId: () => plotParameterId("piecewise-correction-parameter"),
      seriesId: () => plotSeriesId("piecewise-correction-first"),
    },
  });
}

function withDomain(
  series: ExplicitPlotSeries,
  expression: string,
  minExpression: string,
  maxExpression: string,
  minInclusive = true,
  maxInclusive = false,
): ExplicitPlotSeries {
  return {
    ...series,
    expression,
    domain: {
      minExpression,
      maxExpression,
      minInclusive,
      maxInclusive,
    },
  };
}

describe("piecewise mathematical regression checks", () => {
  it("samples a singleton as a point and includes it in fit-to-content", () => {
    const object = createPlot();
    const original = object.definition.series[0];
    if (original?.kind !== "explicit")
      throw new Error("Explicit plot expected");
    const singleton = withDomain(original, "123", "40", "40", true, true);
    const definition = {
      ...object.definition,
      series: [singleton],
    };
    const fitted = fitCoordinatePlotDefinition(definition);
    expect(fitted.coordinateViewport.xMin).toBeLessThan(40);
    expect(fitted.coordinateViewport.xMax).toBeGreaterThan(40);
    expect(fitted.coordinateViewport.yMin).toBeLessThan(123);
    expect(fitted.coordinateViewport.yMax).toBeGreaterThan(123);

    const rendered = createCoordinatePlotRenderModel({
      object: { ...object, definition: fitted },
      zoom: 1,
    });
    expect(rendered.sampling.series[0]?.status).toBe("sampled");
    const sample = rendered.sampling.series[0]?.sample;
    expect(sample?.metrics.pointCount).toBe(1);
    expect(sample?.metrics.evaluationCount).toBe(1);
    expect(sample?.points).toHaveLength(1);
    expect(sample?.dataBounds).toEqual({
      xMin: 40,
      xMax: 40,
      yMin: 123,
      yMax: 123,
    });
    expect(rendered.endpoints).toHaveLength(1);
    expect(rendered.endpoints[0]?.included).toBe(true);
  });

  it("renders singleton points with implicit legacy-inclusive bounds", () => {
    const object = createPlot();
    const original = object.definition.series[0];
    if (original?.kind !== "explicit")
      throw new Error("Explicit plot expected");
    const definition = {
      ...object.definition,
      series: [
        {
          ...original,
          expression: "2",
          domain: { minExpression: "3", maxExpression: "3" },
        },
      ],
    };
    const model = createCoordinatePlotRenderModel({
      object: { ...object, definition },
      zoom: 1,
    });
    expect(model.sampling.series[0]?.status).toBe("sampled");
    expect(model.endpoints).toHaveLength(1);
    expect(model.endpoints[0]?.included).toBe(true);
  });

  it("rejects distinct values at a shared included boundary even below 1e-9", () => {
    const object = createPlot();
    const primary = object.definition.series[0]!;
    const split = splitCoordinatePlotSeries(
      object.definition,
      primary.id,
      plotSeriesId("piecewise-correction-second"),
    );
    const definition = {
      ...split,
      series: split.series.map((series, index) =>
        series.kind !== "explicit"
          ? series
          : {
              ...series,
              expression: index === 0 ? "0" : "0.0000000001",
              domain:
                index === 0
                  ? { ...series.domain, maxInclusive: true }
                  : series.domain,
            },
      ),
    };
    expect(
      validateCoordinatePlotDefinition(definition).some(
        ({ code }) => code === "plot.piecewise-conflict",
      ),
    ).toBe(true);
    expect(
      validateCoordinatePlotEditorDefinition(definition).some(
        ({ code, blocking }) => code === "plot.piecewise-conflict" && blocking,
      ),
    ).toBe(true);

    const independent = {
      ...definition,
      series: definition.series.map((series) =>
        series.kind === "explicit"
          ? { ...series, piecewiseGroupId: undefined }
          : series,
      ),
    };
    expect(
      validateCoordinatePlotDefinition(independent).some(
        ({ code }) => code === "plot.piecewise-conflict",
      ),
    ).toBe(false);
  });

  it("rejects overlapping piecewise branches through document storage and import", () => {
    const object = createPlot();
    const first = object.definition.series[0]!;
    const split = splitCoordinatePlotSeries(
      object.definition,
      first.id,
      plotSeriesId("piecewise-correction-second"),
    );
    const invalid = {
      ...split,
      series: split.series.map((series, index) =>
        index === 1 && series.kind === "explicit"
          ? {
              ...series,
              domain: { ...series.domain, minExpression: "-1" },
            }
          : series,
      ),
    };
    expect(
      validateCoordinatePlotDefinition(invalid).some(
        ({ code }) => code === "plot.piecewise-overlap",
      ),
    ).toBe(true);
    const document = createEmptyBoardDocument({
      createdAt: "2026-11-15T12:00:00.000Z",
      id: documentId("document:piecewise-corrections"),
      title: "Piecewise validation",
    });
    const base = {
      ...document,
      objects: { [object.id]: { ...object, definition: split } },
      order: [object.id],
    };
    const validJson = serializeBoardDocument(base);
    expect(validJson.ok).toBe(true);
    if (!validJson.ok) return;

    const payload = JSON.parse(validJson.json) as {
      objects: Record<
        string,
        {
          definition: {
            series: { domain: { minExpression: string | null } }[];
          };
        }
      >;
    };
    payload.objects[object.id]!.definition.series[1]!.domain.minExpression =
      "-1";
    expect(deserializeBoardDocument(JSON.stringify(payload)).status).not.toBe(
      "ok",
    );
    expect(
      serializeBoardDocument({
        ...document,
        objects: { [object.id]: { ...object, definition: invalid } },
        order: [object.id],
      }).ok,
    ).toBe(false);
  });

  it("renders an open circle at a removable discontinuity's one-sided limit", () => {
    const object = createPlot();
    const first = object.definition.series[0];
    if (first?.kind !== "explicit") throw new Error("Explicit plot expected");
    const definition = {
      ...object.definition,
      series: [withDomain(first, "(x^2-1)/(x-1)", "0", "1")],
    };
    const rendered = createCoordinatePlotRenderModel({
      object: { ...object, definition },
      zoom: 1,
    });
    const endpointX = plotDataToLocalPoint(
      { x: 1, y: 2 },
      rendered.definition.coordinateViewport,
      rendered.definition.size,
    ).x;
    const marker = rendered.endpoints.find(
      (endpoint) =>
        !endpoint.included && Math.abs(endpoint.point.x - endpointX) < 0.01,
    );
    expect(marker).toBeDefined();
    expect(marker?.point.y).toBeCloseTo(150, 0);
  });

  it("does not invent a finite endpoint for a vertical asymptote", () => {
    const object = createPlot();
    const first = object.definition.series[0];
    if (first?.kind !== "explicit") throw new Error("Explicit plot expected");
    const definition = {
      ...object.definition,
      series: [withDomain(first, "1/(x-1)", "0", "1")],
    };
    const rendered = createCoordinatePlotRenderModel({
      object: { ...object, definition },
      zoom: 1,
    });
    const endpointX = plotDataToLocalPoint(
      { x: 1, y: 0 },
      rendered.definition.coordinateViewport,
      rendered.definition.size,
    ).x;
    expect(
      rendered.endpoints.some(
        (endpoint) =>
          !endpoint.included && Math.abs(endpoint.point.x - endpointX) < 0.01,
      ),
    ).toBe(false);
  });
});
