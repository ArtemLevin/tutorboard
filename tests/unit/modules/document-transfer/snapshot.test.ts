import { describe, expect, it } from "vitest";

import frozenDocumentJson from "../../../fixtures/board-document-1.0.json?raw";
import {
  boardObjectId,
  createPenStrokeRenderBounds,
  createVectorInkData,
  plotSeriesId,
  type BoardObject,
  type CoordinatePlotObject,
  type MediaAssetObject,
  type RelationPlotSeries,
  type StrokeStyle,
} from "../../../../src/core/public";
import { importTutorBoardDocument } from "../../../../src/modules/document-transfer/public";
import { createPenStrokeRenderPaths } from "../../../../src/core/public";
import {
  renderBoardSnapshotSvg,
  resolveBoardSnapshotLayout,
} from "../../../../src/modules/document-transfer/snapshot";
import {
  drawingStyleDefaults,
  reduceDrawingInteraction,
} from "../../../../src/modules/drawing/public";
import { createCoordinatePlotProductionObject } from "../../../fixtures/coordinate-plot-production";

function fixtureDocument() {
  const imported = importTutorBoardDocument(frozenDocumentJson);
  if (imported.status !== "ok") {
    throw new Error("Frozen fixture must be readable.");
  }
  return imported.document;
}

function fixtureDocumentWithText(options: {
  readonly fill: string | null;
  readonly opacity?: number;
  readonly stroke: string | null;
}) {
  const document = fixtureDocument();
  const objectId = boardObjectId("object:snapshot-text");
  const pointerId = 17;
  const started = reduceDrawingInteraction(
    { kind: "idle" },
    {
      kind: "start",
      objectId,
      point: { x: 48, y: 72 },
      pointerId,
      style: {
        ...drawingStyleDefaults.text,
        fill: options.fill,
        opacity: options.opacity ?? 1,
        stroke: options.stroke,
      },
      text: "Экспорт текста",
      tool: "drawing.text",
    },
  );
  const completed = reduceDrawingInteraction(started.state, {
    kind: "finish",
    point: { x: 48, y: 72 },
    pointerId,
  }).completedObject;
  if (completed === null || completed.kind !== "drawing.text") {
    throw new Error("Text fixture must complete as a drawing.text object.");
  }
  return {
    ...document,
    objects: {
      ...document.objects,
      [objectId]: completed,
    },
    order: [...document.order, objectId],
  };
}

function fixtureDocumentWithPenStyle(strokeStyle: StrokeStyle, opacity = 0.8) {
  const document = fixtureDocument();
  const id = boardObjectId(`object:snapshot-pen-${strokeStyle}`);
  const samples = [
    { point: { x: 20, y: 30 }, pressure: 0.3, timestampMs: 0 },
    { point: { x: 110, y: 30 }, pressure: 0.8, timestampMs: 8 },
    { point: { x: 200, y: 30 }, pressure: 0.4, timestampMs: 16 },
  ] as const;
  const object: Extract<BoardObject, { readonly kind: "drawing.pen-stroke" }> =
    {
      groupId: null,
      id,
      ink: createVectorInkData(samples),
      kind: "drawing.pen-stroke",
      locked: false,
      points: samples.map(({ point }) => point),
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: null,
        opacity,
        stroke: "#7c3aed",
        strokeStyle,
        strokeWidth: 3,
      },
      visible: true,
    };
  return {
    document: {
      ...document,
      objects: { ...document.objects, [id]: object },
      order: [...document.order, id],
    },
    object,
  };
}

function closedHighPressurePen(
  strokeWidth: number,
  options: {
    readonly rotation?: number;
    readonly scale?: { readonly x: number; readonly y: number };
    readonly strokeStyle?: StrokeStyle;
  } = {},
): Extract<BoardObject, { readonly kind: "drawing.pen-stroke" }> {
  const id = boardObjectId(
    `object:closed-high-pressure-${strokeWidth}-${options.strokeStyle ?? "thin"}`,
  );
  const samples = [
    { point: { x: 0, y: 0 }, pressure: 1, timestampMs: 0 },
    { point: { x: 200, y: 0 }, pressure: 1, timestampMs: 8 },
    { point: { x: 100, y: 160 }, pressure: 1, timestampMs: 16 },
    { point: { x: 0, y: 0 }, pressure: 1, timestampMs: 24 },
  ] as const;
  return {
    groupId: null,
    id,
    ink: createVectorInkData(samples, true),
    kind: "drawing.pen-stroke",
    locked: false,
    points: samples.map(({ point }) => point),
    position: { x: -120, y: 75 },
    rotation: options.rotation ?? 0,
    scale: options.scale ?? { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#7c3aed",
      strokeStyle: options.strokeStyle ?? "thin",
      strokeWidth,
    },
    visible: true,
  };
}

function documentOnlyWithObject(object: BoardObject) {
  const document = fixtureDocument();
  return {
    ...document,
    groups: {},
    objects: { [object.id]: object },
    order: [object.id],
  };
}

function coordinatePlotWithSeries(
  expressions: readonly string[],
  options: {
    readonly viewport?: {
      readonly equalScale: boolean;
      readonly xMax: number;
      readonly xMin: number;
      readonly yMax: number;
      readonly yMin: number;
    };
  } = {},
): CoordinatePlotObject {
  const base = createCoordinatePlotProductionObject(0);
  const explicit = base.definition.series.filter(
    (series) => series.kind === "explicit",
  );
  return {
    ...base,
    definition: {
      ...base.definition,
      coordinateViewport:
        options.viewport ?? base.definition.coordinateViewport,
      legend: { ...base.definition.legend, visible: false },
      series: expressions.map((expression, index) => {
        const source = explicit[index] ?? explicit[0];
        if (source === undefined || source.kind !== "explicit") {
          throw new Error("Production fixture must contain explicit series.");
        }
        return {
          ...source,
          expression,
          id: plotSeriesId(`snapshot-series:${index}`),
          name: `Snapshot ${index + 1}`,
          visible: true,
        };
      }),
    },
  };
}

function exportedSeriesFragments(
  svg: string,
  seriesId: string,
): readonly string[] {
  return [
    ...svg.matchAll(
      new RegExp(
        `<polyline[^>]*data-coordinate-plot-series-id="${seriesId.replaceAll(":", "\\:")}"[^>]*>`,
        "gu",
      ),
    ),
  ].map(([markup]) => markup);
}

function transformLocalPoint(
  point: { readonly x: number; readonly y: number },
  object: Extract<BoardObject, { readonly kind: "drawing.pen-stroke" }>,
) {
  const scaled = {
    x: point.x * object.scale.x,
    y: point.y * object.scale.y,
  };
  const radians = (object.rotation * Math.PI) / 180;
  return {
    x:
      scaled.x * Math.cos(radians) -
      scaled.y * Math.sin(radians) +
      object.position.x,
    y:
      scaled.x * Math.sin(radians) +
      scaled.y * Math.cos(radians) +
      object.position.y,
  };
}

function transformedBounds(
  bounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  },
  object: Extract<BoardObject, { readonly kind: "drawing.pen-stroke" }>,
) {
  const points = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ].map((point) => transformLocalPoint(point, object));
  return {
    bottom: Math.max(...points.map(({ y }) => y)),
    left: Math.min(...points.map(({ x }) => x)),
    right: Math.max(...points.map(({ x }) => x)),
    top: Math.min(...points.map(({ y }) => y)),
  };
}

function exportedTextMarkup(svg: string): string {
  const markup = svg.match(/<text\b[^>]*>.*?<\/text>/u)?.[0];
  if (markup === undefined) {
    throw new Error("Snapshot must contain exported text markup.");
  }
  return markup;
}

describe("TutorBoard styled pen snapshot parity", () => {
  it("exports the same shared wavy geometry as the canvas renderer contract", () => {
    const { document, object } = fixtureDocumentWithPenStyle("wavy");
    const expected = createPenStrokeRenderPaths(
      object.ink!,
      object.style.strokeStyle,
      object.style.strokeWidth,
    );
    const svg = renderBoardSnapshotSvg(document);

    expect(expected).toHaveLength(1);
    expect(svg).toContain(`d="${expected[0]?.data}"`);
    expect(svg).toContain('fill="#7c3aed"');
  });

  it("exports distinct dashed and dash-dot pen geometry", () => {
    const dashed = renderBoardSnapshotSvg(
      fixtureDocumentWithPenStyle("dashed").document,
    );
    const dashDot = renderBoardSnapshotSvg(
      fixtureDocumentWithPenStyle("dash-dot").document,
    );

    expect(dashed).not.toBe(dashDot);
    expect((dashed.match(/fill="#7c3aed"/gu) ?? []).length).toBeGreaterThan(0);
    expect((dashDot.match(/fill="#7c3aed"/gu) ?? []).length).toBeGreaterThan(0);
  });

  it("preserves marker opacity semantics in exported SVG", () => {
    const svg = renderBoardSnapshotSvg(
      fixtureDocumentWithPenStyle("marker", 0.8).document,
    );

    expect(svg).toContain(`fill="#7c3aed" opacity="${String(0.8 * 0.38)}"`);
  });

  it("exports deterministic bounded hand-drawn passes", () => {
    const first = renderBoardSnapshotSvg(
      fixtureDocumentWithPenStyle("hand-pencil").document,
    );
    const second = renderBoardSnapshotSvg(
      fixtureDocumentWithPenStyle("hand-pencil").document,
    );

    expect(first).toBe(second);
    expect((first.match(/fill="#7c3aed"/gu) ?? []).length).toBe(3);
  });
});

describe("TutorBoard coordinate plot snapshot fidelity", () => {
  it("exports real sampled geometry and changes it when the expression changes", () => {
    const quadratic = coordinatePlotWithSeries(["x^2"]);
    const linear = coordinatePlotWithSeries(["2*x+a"]);
    const quadraticSvg = renderBoardSnapshotSvg(
      documentOnlyWithObject(quadratic),
    );
    const linearSvg = renderBoardSnapshotSvg(documentOnlyWithObject(linear));

    expect(quadraticSvg).toContain(
      'data-coordinate-plot-series-id="snapshot-series:0"',
    );
    expect(linearSvg).toContain(
      'data-coordinate-plot-series-id="snapshot-series:0"',
    );
    expect(quadraticSvg).not.toBe(linearSvg);
    expect(
      exportedSeriesFragments(quadraticSvg, "snapshot-series:0").length,
    ).toBeGreaterThan(0);
    expect(
      exportedSeriesFragments(linearSvg, "snapshot-series:0").length,
    ).toBeGreaterThan(0);
  });

  it("keeps discontinuity fragments separate for 1/x", () => {
    const object = coordinatePlotWithSeries(["1/x"]);
    const svg = renderBoardSnapshotSvg(documentOnlyWithObject(object));
    const fragments = exportedSeriesFragments(svg, "snapshot-series:0");

    expect(fragments.length).toBeGreaterThan(1);
    expect(svg).toContain('clip-path="url(#coordinate-plot-clip-');
  });

  it("respects shifted and tightly zoomed coordinate viewports", () => {
    const shifted = coordinatePlotWithSeries(["x^2"], {
      viewport: {
        equalScale: false,
        xMax: 20,
        xMin: 10,
        yMax: 30,
        yMin: 5,
      },
    });
    const zoomed = coordinatePlotWithSeries(["x^2"], {
      viewport: {
        equalScale: false,
        xMax: 0.2,
        xMin: -0.2,
        yMax: 0.08,
        yMin: -0.02,
      },
    });
    const shiftedSvg = renderBoardSnapshotSvg(documentOnlyWithObject(shifted));
    const zoomedSvg = renderBoardSnapshotSvg(documentOnlyWithObject(zoomed));

    expect(shiftedSvg).not.toContain('data-coordinate-plot-axis="x"');
    expect(shiftedSvg).not.toContain('data-coordinate-plot-axis="y"');
    expect(zoomedSvg).toContain('data-coordinate-plot-axis="x"');
    expect(zoomedSvg).toContain('data-coordinate-plot-axis="y"');
    expect(shiftedSvg).not.toBe(zoomedSvg);
  });

  it("exports multiple visible series and omits hidden series", () => {
    const object = coordinatePlotWithSeries(["x^2", "2*x+a", "sin(x)"]);
    const hiddenId = object.definition.series[1]?.id;
    if (hiddenId === undefined) throw new Error("Expected second series.");
    const hidden: CoordinatePlotObject = {
      ...object,
      definition: {
        ...object.definition,
        series: object.definition.series.map((series, index) =>
          index === 1 ? { ...series, visible: false } : series,
        ),
      },
    };
    const svg = renderBoardSnapshotSvg(documentOnlyWithObject(hidden));

    expect(svg).toContain('data-coordinate-plot-series-id="snapshot-series:0"');
    expect(svg).toContain('data-coordinate-plot-series-id="snapshot-series:2"');
    expect(svg).not.toContain(`data-coordinate-plot-series-id="${hiddenId}"`);
  });

  it("exports parameterized, parametric and relation geometry with series styles", () => {
    const base = createCoordinatePlotProductionObject(0);
    const parameterized = base.definition.series.find(
      (series) =>
        series.kind === "explicit" && series.expression === "a*sin(b*x)",
    );
    const parametric = base.definition.series.find(
      (series) => series.kind === "parametric",
    );
    if (parameterized === undefined || parametric === undefined) {
      throw new Error(
        "Production fixture must contain parameterized and parametric series.",
      );
    }
    const relation: RelationPlotSeries = {
      expression: "x^2+y^2<=9",
      fillOpacity: 0.18,
      id: plotSeriesId("snapshot-series:relation"),
      kind: "relation",
      name: "Disk",
      style: {
        lineStyle: "dash-dot",
        opacity: 0.76,
        stroke: "#9333ea",
        strokeWidth: 2.5,
      },
      visible: true,
    };
    const object: CoordinatePlotObject = {
      ...base,
      definition: {
        ...base.definition,
        legend: { ...base.definition.legend, visible: true },
        series: [parameterized, parametric, relation],
      },
    };
    const svg = renderBoardSnapshotSvg(documentOnlyWithObject(object));

    expect(svg).toContain(
      `data-coordinate-plot-series-id="${parameterized.id}"`,
    );
    expect(svg).toContain(`data-coordinate-plot-series-id="${parametric.id}"`);
    expect(svg).toContain('data-coordinate-plot-series-kind="parametric"');
    expect(svg).toContain(
      'data-coordinate-plot-fill-id="snapshot-series:relation"',
    );
    expect(svg).toContain('stroke="#9333ea"');
    expect(svg).toContain('stroke-opacity="0.76"');
    expect(svg).toContain("stroke-dasharray=");
    expect(svg).toContain('data-coordinate-plot-legend="true"');
  });
});

describe("TutorBoard snapshot layout", () => {
  it("exports the complete board independently of viewport pan and zoom", () => {
    const document = fixtureDocument();
    const displacedViewport = {
      ...document,
      viewport: {
        offset: { x: -12_000, y: 8_000 },
        zoom: 0.08,
      },
    };

    expect(renderBoardSnapshotSvg(displacedViewport)).toBe(
      renderBoardSnapshotSvg(document),
    );
    expect(renderBoardSnapshotSvg(document)).toContain(
      '<rect width="100%" height="100%" fill="#f5f3ee"/>',
    );
    expect(renderBoardSnapshotSvg(document)).toContain(
      'color-interpolation="sRGB" color-interpolation-filters="sRGB"',
    );
    expect(renderBoardSnapshotSvg(document)).not.toContain("#f8fafc");
  });

  it("fits distant negative world coordinates inside the exported frame", () => {
    const document = fixtureDocument();
    const group = Object.values(document.groups)[0];
    if (group === undefined) {
      throw new Error("Fixture must contain a group.");
    }
    const translated = {
      ...document,
      groups: {
        ...document.groups,
        [group.id]: {
          ...group,
          transform: {
            ...group.transform,
            translation: { x: -5_400, y: 3_200 },
          },
        },
      },
    };

    const layout = resolveBoardSnapshotLayout(translated);
    const bounds = layout.contentBounds;
    if (bounds === null) {
      throw new Error("Fixture must have visible content.");
    }

    const left = bounds.left * layout.scale + layout.translation.x;
    const right = bounds.right * layout.scale + layout.translation.x;
    const top = bounds.top * layout.scale + layout.translation.y;
    const bottom = bounds.bottom * layout.scale + layout.translation.y;
    const epsilon = 0.000_001;

    expect(left).toBeGreaterThanOrEqual(layout.padding - epsilon);
    expect(top).toBeGreaterThanOrEqual(layout.padding - epsilon);
    expect(right).toBeLessThanOrEqual(layout.width - layout.padding + epsilon);
    expect(bottom).toBeLessThanOrEqual(
      layout.height - layout.padding + epsilon,
    );
  });

  it.each([24, 64])(
    "uses exact closed high-pressure bounds at width %s with zero padding",
    (strokeWidth) => {
      const object = closedHighPressurePen(strokeWidth);
      const expected = createPenStrokeRenderBounds(
        object.ink!,
        object.style.strokeStyle,
        object.style.strokeWidth,
      );
      const layout = resolveBoardSnapshotLayout(
        documentOnlyWithObject(object),
        {
          padding: 0,
        },
      );

      expect(expected).not.toBeNull();
      expect(layout.padding).toBe(0);
      expect(layout.contentBounds).toEqual(
        expected === null ? null : transformedBounds(expected, object),
      );
      expect(layout.contentBounds?.left).toBeLessThan(object.position.x);
      expect(layout.contentBounds?.right).toBeGreaterThan(
        object.position.x + 200,
      );
    },
  );

  it.each(["dashed", "dash-dot", "wavy", "hand-pencil", "hand-pen"] as const)(
    "uses the shared %s render bounds without snapshot magic margins",
    (strokeStyle) => {
      const object = closedHighPressurePen(24, { strokeStyle });
      const expected = createPenStrokeRenderBounds(
        object.ink!,
        strokeStyle,
        object.style.strokeWidth,
      );
      const layout = resolveBoardSnapshotLayout(
        documentOnlyWithObject(object),
        {
          padding: 0,
        },
      );

      expect(expected).not.toBeNull();
      expect(layout.contentBounds).toEqual(
        expected === null ? null : transformedBounds(expected, object),
      );
    },
  );

  it("keeps exact pen render bounds through rotation and non-uniform scale", () => {
    const object = closedHighPressurePen(64, {
      rotation: 37,
      scale: { x: 2.25, y: 0.45 },
      strokeStyle: "wavy",
    });
    const local = createPenStrokeRenderBounds(
      object.ink!,
      object.style.strokeStyle,
      object.style.strokeWidth,
    );
    const layout = resolveBoardSnapshotLayout(documentOnlyWithObject(object), {
      padding: 0,
    });

    expect(local).not.toBeNull();
    if (local === null) return;
    const expected = transformedBounds(local, object);
    expect(layout.contentBounds?.left).toBeCloseTo(expected.left, 8);
    expect(layout.contentBounds?.right).toBeCloseTo(expected.right, 8);
    expect(layout.contentBounds?.top).toBeCloseTo(expected.top, 8);
    expect(layout.contentBounds?.bottom).toBeCloseTo(expected.bottom, 8);
  });

  it("keeps explicitly requested snapshot dimensions", () => {
    const layout = resolveBoardSnapshotLayout(fixtureDocument(), {
      height: 600,
      width: 800,
    });

    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.scale).toBeGreaterThan(0);
  });

  it("renders media assets as safe metadata placeholders", () => {
    const document = fixtureDocument();
    const id = boardObjectId("object:snapshot-media");
    const asset: MediaAssetObject = {
      groupId: null,
      id,
      assetId: "asset:snapshot",
      byteSize: 32_000,
      contentSha256: "b".repeat(64),
      fileName: "lesson<clip>.mp4",
      intrinsicSize: { height: 720, width: 1280 },
      kind: "media.asset",
      locked: false,
      mimeType: "video/mp4",
      position: { x: 20, y: 30 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      size: { height: 180, width: 320 },
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
      visible: true,
    };
    const svg = renderBoardSnapshotSvg({
      ...document,
      objects: { ...document.objects, [id]: asset },
      order: [...document.order, id],
    });

    expect(svg).toContain('data-media-asset-id="asset:snapshot"');
    expect(svg).toContain("lesson&lt;clip&gt;.mp4");
    expect(svg).not.toContain("data:image/");
  });

  it("renders text with the same stroke-color fallback as the canvas", () => {
    const svg = renderBoardSnapshotSvg(
      fixtureDocumentWithText({
        fill: null,
        opacity: 0.73,
        stroke: "#245d6b",
      }),
    );
    const text = exportedTextMarkup(svg);

    expect(text).toContain('fill="#245d6b"');
    expect(text).toContain('opacity="0.73"');
    expect(text).toContain('stroke="none"');
    expect(text).not.toContain('fill="none"');
    expect(text).not.toContain("stroke-width=");
  });

  it("prefers explicit text fill and preserves the canvas default fallback", () => {
    const filled = exportedTextMarkup(
      renderBoardSnapshotSvg(
        fixtureDocumentWithText({
          fill: "#6d214f",
          stroke: "#245d6b",
        }),
      ),
    );
    const defaulted = exportedTextMarkup(
      renderBoardSnapshotSvg(
        fixtureDocumentWithText({
          fill: null,
          stroke: null,
        }),
      ),
    );

    expect(filled).toContain('fill="#6d214f"');
    expect(defaulted).toContain('fill="#17202a"');
  });
});
