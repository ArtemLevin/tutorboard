import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  selectBoardScene,
  type CommandMetadata,
} from "../../../../src/core/public";
import {
  createTextShapePlacementCommand,
  createVertexConstructionCommand,
  inspectTextShapeFigure,
  inspectTextShapeVertex,
  inspectTextShapeVertexNearPoint,
  resolveTextShape,
  suggestTextShapes,
  textShapeCatalog,
  textShapeVertexNameFromObjectId,
} from "../../../../src/modules/text-shape-placement/public";

const metadata: CommandMetadata = {
  actorId: actorId("actor:text-shape-test"),
  id: commandId("command:text-shape-test"),
  timestamp: "2026-08-04T12:00:00.000Z",
};

function emptyDocument() {
  return createEmptyBoardDocument({
    createdAt: metadata.timestamp,
    id: documentId("document:text-shape-test"),
    title: "Text shape test",
  });
}

describe("text shape catalog", () => {
  it("resolves case and abbreviated cone queries", () => {
    expect(resolveTextShape("Конус")?.id).toBe("cone");
    expect(resolveTextShape("конус")?.id).toBe("cone");
    expect(resolveTextShape("кон")?.id).toBe("cone");
  });

  it("offers a broad categorized local catalog", () => {
    expect(textShapeCatalog.length).toBeGreaterThanOrEqual(45);
    expect(new Set(textShapeCatalog.map(({ category }) => category))).toEqual(
      new Set(["basic", "2d", "3d"]),
    );
    expect(suggestTextShapes("треугольник").length).toBeGreaterThan(1);
  });
});

describe("text shape placement", () => {
  it("places a labeled cone as one grouped atomic command", () => {
    const definition = resolveTextShape("кон");
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const command = createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition,
      metadata,
      placement: { x: 320, y: 240 },
      token: "cone-test",
    });

    const result = reduceBoardDocument(emptyDocument(), command);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(command.groups).toHaveLength(1);
    expect(command.geometryImports).toEqual([]);
    expect(
      command.objects.some((object) => object.kind === "drawing.ellipse"),
    ).toBe(true);
    expect(
      command.objects.filter((object) => object.kind === "drawing.text"),
    ).toHaveLength(3);
    expect(Object.keys(result.document.groups)).toHaveLength(1);
  });

  it("stores hidden vertex labels when automatic naming is disabled", () => {
    const definition = resolveTextShape("квадрат");
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const command = createTextShapePlacementCommand({
      autoLabelVertices: false,
      definition,
      metadata,
      placement: { x: 0, y: 0 },
      token: "square-test",
    });

    const labels = command.objects.filter(
      (object) => object.kind === "drawing.text",
    );
    expect(labels).toHaveLength(4);
    expect(labels.every(({ visible }) => !visible)).toBe(true);
  });
});

describe("triangle vertex constructions", () => {
  it("builds altitude, median and angle bisector from a clicked vertex", () => {
    const definition = resolveTextShape("разносторонний треугольник");
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const placement = createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition,
      metadata,
      placement: { x: 100, y: 100 },
      token: "triangle-test",
    });
    const placed = reduceBoardDocument(emptyDocument(), placement);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const vertexA = placement.objects.find(
      (object) => textShapeVertexNameFromObjectId(object.id) === "A",
    );
    expect(vertexA).toBeDefined();
    if (vertexA === undefined) return;

    const context = inspectTextShapeVertex(placed.document, vertexA.id);
    expect(context?.availableConstructions).toEqual([
      "altitude",
      "median",
      "angle-bisector",
    ]);
    expect(
      inspectTextShapeFigure(
        placed.document,
        placement.objects.map(({ id }) => id),
      )?.labelsVisible,
    ).toBe(true);

    const edge = placement.objects.find(
      (object) => object.kind === "drawing.line",
    );
    expect(edge).toBeDefined();
    if (edge === undefined) return;
    expect(
      inspectTextShapeVertexNearPoint({
        document: placed.document,
        hitObjectId: edge.id,
        maximumDistance: 18,
        point: {
          x: vertexA.position.x + 100,
          y: vertexA.position.y + 100,
        },
        scene: selectBoardScene(placed.document),
      })?.vertexName,
    ).toBe("A");

    for (const kind of context?.availableConstructions ?? []) {
      const command = createVertexConstructionCommand({
        document: placed.document,
        kind,
        metadata: { ...metadata, id: commandId(`command:${kind}`) },
        token: kind,
        vertexObjectId: vertexA.id,
      });
      expect(command?.objects).toHaveLength(3);
      expect(command?.objects[0]).toMatchObject({ kind: "drawing.line" });
    }
  });

  it("limits contextual constructions to planar triangle templates", () => {
    const definition = resolveTextShape("куб");
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const placement = createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition,
      metadata,
      placement: { x: 0, y: 0 },
      token: "cube-test",
    });
    const placed = reduceBoardDocument(emptyDocument(), placement);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const vertex = placement.objects.find(
      (object) => textShapeVertexNameFromObjectId(object.id) === "A",
    );
    expect(vertex).toBeDefined();
    expect(
      vertex === undefined
        ? null
        : inspectTextShapeVertex(placed.document, vertex.id),
    ).toBeNull();
  });
});
