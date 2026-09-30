import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  deserializeBoardDocument,
  documentId,
  reduceBoardDocument,
  serializeBoardDocument,
} from "../../../../src/core/public";
import { noInputModifiers } from "../../../../src/shared/input-modifiers";
import {
  createAddDrawingObjectCommand,
  drawingStyleDefaults,
  getDrawingConstraintFeedback,
  getDrawingPreview,
  reduceDrawingInteraction,
  simplifyStroke,
  type DrawingInteractionState,
  type DrawingToolId,
  type UserDrawingObject,
} from "../../../../src/modules/drawing/public";

const idle: DrawingInteractionState = { kind: "idle" };

function styleFor(tool: DrawingToolId) {
  switch (tool) {
    case "drawing.pen":
      return drawingStyleDefaults.pen;
    case "drawing.smart-ink":
      return drawingStyleDefaults.smartInk;
    case "drawing.line":
      return drawingStyleDefaults.line;
    case "drawing.rectangle":
      return drawingStyleDefaults.rectangle;
    case "drawing.ellipse":
      return drawingStyleDefaults.ellipse;
    case "drawing.polygon":
      return drawingStyleDefaults.polygon;
    case "drawing.text":
      return drawingStyleDefaults.text;
  }
}

function draw(
  tool: DrawingToolId,
  start: { readonly x: number; readonly y: number },
  finish: { readonly x: number; readonly y: number },
  text = "Теорема",
): UserDrawingObject | null {
  const started = reduceDrawingInteraction(idle, {
    kind: "start",
    objectId: boardObjectId(`object:${tool.split(".")[1]}`),
    point: start,
    pointerId: 7,
    style: styleFor(tool),
    text,
    tool,
  });
  const completed = reduceDrawingInteraction(started.state, {
    kind: "finish",
    point: finish,
    pointerId: 7,
  });

  expect(completed.state).toEqual(idle);
  return completed.completedObject;
}

describe("drawing interaction state machine", () => {
  it("simplifies dense strokes while retaining endpoints and corners", () => {
    const points = Array.from({ length: 1_001 }, (_value, index) => ({
      x: index,
      y: index === 500 ? 40 : 0,
    }));
    const simplified = simplifyStroke(points, 0.75);
    expect(simplified.length).toBeLessThan(10);
    expect(simplified[0]).toBe(points[0]);
    expect(simplified.at(-1)).toBe(points.at(-1));
    expect(simplified).toContain(points[500]);
  });

  it("creates a visible pressure-aware dot from a single pen tap", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:dot"),
      point: { x: 32, y: 48 },
      pointerId: 31,
      pressure: 0.8,
      style: { ...styleFor("drawing.pen"), strokeWidth: 10 },
      text: "",
      tool: "drawing.pen",
    });

    expect(getDrawingPreview(started.state)).toMatchObject({
      kind: "drawing.ellipse",
      position: { x: 32, y: 48 },
    });

    const completed = reduceDrawingInteraction(started.state, {
      kind: "finish",
      point: { x: 32, y: 48 },
      pointerId: 31,
      pressure: 0.8,
    });
    expect(completed.completedObject).toMatchObject({
      kind: "drawing.ellipse",
      position: { x: 32, y: 48 },
      style: { fill: styleFor("drawing.pen").stroke, strokeWidth: 0 },
    });
    if (completed.completedObject?.kind === "drawing.ellipse") {
      expect(completed.completedObject.radius.x).toBeGreaterThan(4);
      expect(completed.completedObject.radius.x).toBe(
        completed.completedObject.radius.y,
      );
    }
  });

  it("samples pen points in world space and completes one object", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:pen"),
      point: { x: -12.5, y: 24 },
      pointerId: 3,
      style: styleFor("drawing.pen"),
      text: "",
      tool: "drawing.pen",
    });
    const moved = reduceDrawingInteraction(started.state, {
      kind: "move",
      point: { x: 4.25, y: 48 },
      pointerId: 3,
    });
    const completed = reduceDrawingInteraction(moved.state, {
      kind: "finish",
      point: { x: 18, y: 52.5 },
      pointerId: 3,
    });

    expect(completed.completedObject).toMatchObject({
      kind: "drawing.pen-stroke",
      position: { x: 0, y: 0 },
      points: [
        { x: -12.5, y: 24 },
        { x: 4.25, y: 48 },
        { x: 18, y: 52.5 },
      ],
    });
    expect(completed.state).toEqual(idle);
  });

  it("normalizes a rectangle drawn in reverse", () => {
    expect(
      draw("drawing.rectangle", { x: 140, y: 90 }, { x: 20, y: 30 }),
    ).toMatchObject({
      kind: "drawing.rectangle",
      position: { x: 20, y: 30 },
      size: { height: 60, width: 120 },
    });
  });

  it("builds line and ellipse geometry from a drag", () => {
    expect(
      draw("drawing.line", { x: 5, y: 10 }, { x: -15, y: 40 }),
    ).toMatchObject({
      end: { x: -20, y: 30 },
      kind: "drawing.line",
      position: { x: 5, y: 10 },
    });
    expect(
      draw("drawing.ellipse", { x: -10, y: 20 }, { x: 30, y: 80 }),
    ).toMatchObject({
      kind: "drawing.ellipse",
      position: { x: 10, y: 50 },
      radius: { x: 20, y: 30 },
    });
  });

  it("builds a closed regular polygon with bounded side count", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:polygon"),
      point: { x: 0, y: 0 },
      pointerId: 11,
      polygonSides: 6,
      style: styleFor("drawing.polygon"),
      text: "",
      tool: "drawing.polygon",
    });
    const completed = reduceDrawingInteraction(started.state, {
      kind: "finish",
      point: { x: 120, y: 80 },
      pointerId: 11,
    });
    expect(completed.completedObject).toMatchObject({
      kind: "drawing.pen-stroke",
      position: { x: 60, y: 40 },
    });
    if (completed.completedObject?.kind !== "drawing.pen-stroke") return;
    expect(completed.completedObject.points).toHaveLength(7);
    expect(completed.completedObject.points[0]).toEqual(
      completed.completedObject.points.at(-1),
    );
  });

  it("places trimmed text at the completed pointer position", () => {
    expect(
      draw("drawing.text", { x: 10, y: 10 }, { x: 14, y: 18 }, "  Угол ABC  "),
    ).toMatchObject({
      kind: "drawing.text",
      position: { x: 14, y: 18 },
      text: "Угол ABC",
    });
  });

  it("updates a text placement preview without committing it", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:text-preview"),
      point: { x: 40, y: 60 },
      pointerId: 12,
      style: styleFor("drawing.text"),
      text: "",
      tool: "drawing.text",
    });
    const changed = reduceDrawingInteraction(started.state, {
      kind: "text-change",
      pointerId: 12,
      text: "  Новая формула  ",
    });

    expect(getDrawingPreview(changed.state)).toMatchObject({
      kind: "drawing.text",
      position: { x: 40, y: 60 },
      text: "  Новая формула  ",
    });
    expect(changed.completedObject).toBeNull();

    const completed = reduceDrawingInteraction(changed.state, {
      kind: "finish",
      point: { x: 40, y: 60 },
      pointerId: 12,
    });
    expect(completed.completedObject).toMatchObject({
      kind: "drawing.text",
      text: "Новая формула",
    });
  });

  it("keeps an empty text draft transient and rejects it on commit", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:empty-text-preview"),
      point: { x: 10, y: 20 },
      pointerId: 13,
      style: styleFor("drawing.text"),
      text: "",
      tool: "drawing.text",
    });
    expect(started.state.kind).toBe("placing-text");

    const completed = reduceDrawingInteraction(started.state, {
      kind: "finish",
      point: { x: 10, y: 20 },
      pointerId: 13,
    });
    expect(completed.completedObject).toBeNull();
    expect(completed.diagnostic).toBe("drawing.empty-text");
    expect(completed.state).toEqual(idle);
  });

  it("keeps preview runtime-only and cancels without an object", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:preview"),
      point: { x: 10, y: 20 },
      pointerId: 5,
      style: styleFor("drawing.rectangle"),
      text: "",
      tool: "drawing.rectangle",
    });
    const moved = reduceDrawingInteraction(started.state, {
      kind: "move",
      point: { x: 50, y: 70 },
      pointerId: 5,
    });

    expect(getDrawingPreview(moved.state)).toMatchObject({
      kind: "drawing.rectangle",
      size: { height: 50, width: 40 },
    });

    const cancelled = reduceDrawingInteraction(moved.state, {
      kind: "cancel",
    });
    expect(cancelled).toEqual({
      completedObject: null,
      diagnostic: null,
      state: idle,
    });
    expect(getDrawingPreview(cancelled.state)).toBeNull();
  });

  it("recomputes a shape immediately when Shift changes mid-gesture", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:late-shift-line"),
      point: { x: 0, y: 0 },
      pointerId: 21,
      style: styleFor("drawing.line"),
      text: "",
      tool: "drawing.line",
    });
    const moved = reduceDrawingInteraction(started.state, {
      kind: "move",
      point: { x: 90, y: 70 },
      pointerId: 21,
    });
    const rawPreview = getDrawingPreview(moved.state);
    expect(rawPreview).toMatchObject({
      end: { x: 90, y: 70 },
      kind: "drawing.line",
    });
    expect(getDrawingConstraintFeedback(moved.state)).toBeNull();

    const constrained = reduceDrawingInteraction(moved.state, {
      kind: "modifiers",
      modifiers: { ...noInputModifiers, shift: true },
      pointerId: 21,
    });
    const constrainedPreview = getDrawingPreview(constrained.state);
    expect(constrainedPreview).not.toEqual(rawPreview);
    expect(getDrawingConstraintFeedback(constrained.state)).toMatchObject({
      angleDegrees: 45,
      kind: "angle",
    });

    const released = reduceDrawingInteraction(constrained.state, {
      kind: "modifiers",
      modifiers: noInputModifiers,
      pointerId: 21,
    });
    expect(getDrawingPreview(released.state)).toEqual(rawPreview);

    const constrainedAgain = reduceDrawingInteraction(released.state, {
      kind: "modifiers",
      modifiers: { ...noInputModifiers, shift: true },
      pointerId: 21,
    });
    const finalPreview = getDrawingPreview(constrainedAgain.state);
    const completed = reduceDrawingInteraction(constrainedAgain.state, {
      kind: "finish",
      point: { x: 90, y: 70 },
      pointerId: 21,
    });
    expect(completed.completedObject).toEqual(finalPreview);
    expect(completed.state).toEqual(idle);
  });

  it("ignores a different pointer and rejects empty geometry", () => {
    const started = reduceDrawingInteraction(idle, {
      kind: "start",
      objectId: boardObjectId("object:line"),
      point: { x: 2, y: 3 },
      pointerId: 1,
      style: styleFor("drawing.line"),
      text: "",
      tool: "drawing.line",
    });
    const unrelated = reduceDrawingInteraction(started.state, {
      kind: "finish",
      point: { x: 20, y: 30 },
      pointerId: 2,
    });
    expect(unrelated.state).toBe(started.state);
    expect(unrelated.completedObject).toBeNull();

    const empty = reduceDrawingInteraction(started.state, {
      kind: "finish",
      point: { x: 2, y: 3 },
      pointerId: 1,
    });
    expect(empty.completedObject).toBeNull();
    expect(empty.diagnostic).toBe("drawing.empty-geometry");
  });

  it("creates an add command without generating metadata in the module", () => {
    const object = draw("drawing.rectangle", { x: 0, y: 0 }, { x: 30, y: 40 });
    expect(object).not.toBeNull();
    if (object === null) {
      return;
    }

    const command = createAddDrawingObjectCommand(
      {
        actorId: actorId("actor:test"),
        id: commandId("command:draw"),
        timestamp: "2026-07-24T12:01:00.000Z",
      },
      object,
    );

    expect(command).toMatchObject({
      actorId: "actor:test",
      id: "command:draw",
      kind: "core.objects.add",
      objects: [object],
    });
  });

  it("preserves pen data through command, validation and serialization", () => {
    const object = draw(
      "drawing.pen",
      { x: -3.5, y: 8.25 },
      { x: 40.75, y: -12 },
    );
    expect(object?.kind).toBe("drawing.pen-stroke");
    if (object === null) {
      return;
    }

    const document = createEmptyBoardDocument({
      createdAt: "2026-07-24T12:00:00.000Z",
      id: documentId("document:drawing-test"),
      title: "Drawing test",
    });
    const result = reduceBoardDocument(
      document,
      createAddDrawingObjectCommand(
        {
          actorId: actorId("actor:test"),
          id: commandId("command:add-pen"),
          timestamp: "2026-07-24T12:01:00.000Z",
        },
        object,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const serialized = serializeBoardDocument(result.document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status === "ok") {
      expect(restored.document.objects[object.id]).toEqual(object);
      expect(serialized.json).not.toContain("drawing-pen");
    }
  });
});
