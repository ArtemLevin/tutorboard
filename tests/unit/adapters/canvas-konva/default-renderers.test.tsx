import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Ellipse, Group, Line, Path, Rect } from "react-konva";
import { describe, expect, it } from "vitest";

import { createDefaultKonvaRendererRegistry } from "../../../../src/adapters/canvas-konva/public";
import {
  boardObjectId,
  type BoardObject,
  type BoardRenderItem,
  type StrokeStyle,
} from "../../../../src/core/public";

const base = {
  groupId: null,
  locked: false,
  position: { x: 40, y: 50 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" as const },
  style: {
    fill: "#dbeaed",
    opacity: 1,
    stroke: "#2c7182",
    strokeStyle: "thin" as const,
    strokeWidth: 2,
  },
  visible: true,
};

function render(object: BoardObject): ReactElement {
  const item: BoardRenderItem = { object, transforms: [] };
  return createDefaultKonvaRendererRegistry().render(item);
}

function elementChildren(element: ReactElement): ReactElement[] {
  return Children.toArray(
    (element.props as { readonly children?: ReactNode }).children,
  ).filter(isValidElement);
}

describe("default stroke width rendering", () => {
  it.each([
    ["thin", 0.5],
    ["thick", 1],
    ["dashed", 1.5],
    ["dash-dot", 2.5],
    ["wavy", 4],
    ["marker", 3],
  ] as const)("renders %s lines with the stored numeric width", (strokeStyle, strokeWidth) => {
    const rendered = render({
      ...base,
      id: boardObjectId(`object:width-${strokeStyle}`),
      kind: "drawing.line",
      end: { x: 120, y: 20 },
      style: {
        ...base.style,
        strokeStyle,
        strokeWidth,
      },
    });

    expect(rendered.type).toBe(Line);
    expect(rendered.props).toMatchObject({ strokeWidth });
  });
});

describe("styled pen stroke rendering", () => {
  const penStroke = (strokeStyle: StrokeStyle) =>
    ({
      ...base,
      id: boardObjectId(`object:pen-${strokeStyle}`),
      kind: "drawing.pen-stroke" as const,
      points: [
        { x: 0, y: 0 },
        { x: 90, y: 0 },
        { x: 180, y: 0 },
      ],
      style: {
        ...base.style,
        fill: null,
        strokeStyle,
        strokeWidth: 3,
      },
    });

  it("renders distinct real geometry for wavy and dashed pen styles", () => {
    const solid = elementChildren(render(penStroke("thin")));
    const wavy = elementChildren(render(penStroke("wavy")));
    const dashed = elementChildren(render(penStroke("dashed")));

    expect(solid).toHaveLength(1);
    expect(wavy).toHaveLength(1);
    expect(dashed).toHaveLength(1);
    expect(wavy[0]?.props).not.toMatchObject({ data: solid[0]?.props.data });
    expect(dashed[0]?.props).not.toMatchObject({ data: solid[0]?.props.data });
  });

  it("renders bounded deterministic sketch passes for pen strokes", () => {
    const pencil = elementChildren(render(penStroke("hand-pencil")));
    const handPen = elementChildren(render(penStroke("hand-pen")));

    expect(pencil).toHaveLength(3);
    expect(handPen).toHaveLength(2);
    expect(pencil.every((element) => element.type === Path)).toBe(true);
    expect(handPen.every((element) => element.type === Path)).toBe(true);
  });

  it("keeps marker opacity aligned with the pen style contract", () => {
    const [marker] = elementChildren(render(penStroke("marker")));
    expect(marker?.type).toBe(Path);
    expect(marker?.props).toMatchObject({
      fill: "#2c7182",
      opacity: 0.38,
    });
  });
});

describe("default shape hit regions", () => {
  it.each([
    {
      object: {
        ...base,
        id: boardObjectId("object:filled-rectangle"),
        kind: "drawing.rectangle" as const,
        size: { height: 80, width: 120 },
      },
      shape: Rect,
    },
    {
      object: {
        ...base,
        id: boardObjectId("object:filled-ellipse"),
        kind: "drawing.ellipse" as const,
        radius: { x: 60, y: 40 },
      },
      shape: Ellipse,
    },
  ])(
    "keeps the $object.kind fill visual and the contour interactive",
    ({ object, shape }) => {
      const rendered = render(object);
      expect(rendered.type).toBe(Group);
      expect(rendered.props).toMatchObject({ name: "board-transform-target" });

      const [fill, contour] = elementChildren(rendered);
      expect(fill?.type).toBe(shape);
      expect(fill?.props).toMatchObject({ listening: false });
      expect(contour?.type).toBe(shape);
      expect(contour?.props).toMatchObject({
        fillEnabled: false,
        hitStrokeWidth: 14,
      });
    },
  );

  it("keeps a filled regular polygon selectable only through its contour", () => {
    const rendered = render({
      ...base,
      id: boardObjectId("object:filled-polygon"),
      kind: "drawing.pen-stroke",
      points: [
        { x: 0, y: -40 },
        { x: 38, y: 12 },
        { x: 24, y: 38 },
        { x: -24, y: 38 },
        { x: -38, y: 12 },
        { x: 0, y: -40 },
      ],
    });
    expect(rendered.type).toBe(Group);
    const [fill, contour] = elementChildren(rendered);
    expect(fill?.type).toBe(Path);
    expect(fill?.props).toMatchObject({ listening: false });
    expect(contour?.type).toBe(Path);
    expect(contour?.props).toMatchObject({ fill: "#2c7182" });
    expect(
      (contour?.props as { readonly listening?: boolean } | undefined)
        ?.listening,
    ).not.toBe(false);
  });
});
