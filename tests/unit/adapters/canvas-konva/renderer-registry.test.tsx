import { Rect } from "react-konva";
import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  svgSanitizerPolicyVersion,
  type BoardRenderItem,
  type RectangleObject,
} from "../../../../src/core/public";
import {
  createDefaultKonvaRendererRegistry,
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "../../../../src/adapters/canvas-konva/public";

const rectangle: RectangleObject = {
  id: boardObjectId("object:registry-test"),
  kind: "drawing.rectangle",
  groupId: null,
  locked: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: {
    fill: null,
    opacity: 1,
    stroke: "#000000",
    strokeWidth: 1,
  },
  visible: true,
  size: { height: 10, width: 10 },
};
const item: BoardRenderItem = { object: rectangle, transforms: [] };
const renderer: KonvaObjectRenderer = {
  kind: "drawing.rectangle",
  render: () => <Rect />,
};

describe("Konva renderer registry", () => {
  it("resolves a renderer by the stored object kind", () => {
    const registry = new KonvaRendererRegistry([renderer]);

    expect(registry.render(item).type).toBe(Rect);
  });


  it("registers the persisted SVG renderer", () => {
    const svgItem: BoardRenderItem = {
      object: {
        groupId: null,
        id: boardObjectId("object:svg-renderer"),
        kind: "svg-import.svg",
        locked: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        sanitizedSvg:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
        sanitizerPolicyVersion: svgSanitizerPolicyVersion,
        scale: { x: 1, y: 1 },
        size: { height: 10, width: 10 },
        source: { kind: "user" },
        style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
        viewBox: { height: 10, width: 10, x: 0, y: 0 },
        visible: true,
      },
      transforms: [],
    };

    expect(() => createDefaultKonvaRendererRegistry().render(svgItem)).not.toThrow();
  });

  it("rejects duplicate registrations", () => {
    expect(() => new KonvaRendererRegistry([renderer, renderer])).toThrow(
      "Duplicate Konva renderer",
    );
  });

  it("fails explicitly when a renderer contribution is missing", () => {
    const registry = new KonvaRendererRegistry([]);

    expect(() => registry.render(item)).toThrow("Missing Konva renderer");
  });
});
