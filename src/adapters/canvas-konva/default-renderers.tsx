import { Ellipse, Line, Rect, Text } from "react-konva";

import type { BoardObject, BoardObjectKind } from "../../core/public";
import { SvgRenderer } from "./svg-renderer";
import {
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";

function expectKind<Kind extends BoardObjectKind>(
  object: BoardObject,
  kind: Kind,
): Extract<BoardObject, { readonly kind: Kind }> {
  if (object.kind !== kind) {
    throw new Error(`Renderer ${kind} received ${object.kind}.`);
  }

  return object as Extract<BoardObject, { readonly kind: Kind }>;
}

function commonShapeProps(object: BoardObject) {
  return {
    opacity: object.style.opacity,
    rotation: object.rotation,
    scaleX: object.scale.x,
    scaleY: object.scale.y,
    strokeWidth: object.style.strokeWidth,
    visible: object.visible,
    x: object.position.x,
    y: object.position.y,
  } as const;
}

function fillProps(object: BoardObject) {
  return object.style.fill === null ? {} : { fill: object.style.fill };
}

function strokeProps(object: BoardObject) {
  return object.style.stroke === null ? {} : { stroke: object.style.stroke };
}

const renderers: readonly KonvaObjectRenderer[] = [
  {
    kind: "drawing.pen-stroke",
    render(object) {
      const stroke = expectKind(object, "drawing.pen-stroke");
      return (
        <Line
          {...commonShapeProps(stroke)}
          {...strokeProps(stroke)}
          lineCap="round"
          lineJoin="round"
          points={stroke.points.flatMap(({ x, y }) => [x, y])}
          tension={0}
        />
      );
    },
  },
  {
    kind: "drawing.line",
    render(object) {
      const line = expectKind(object, "drawing.line");
      return (
        <Line
          {...commonShapeProps(line)}
          {...strokeProps(line)}
          {...(line.lineStyle === "dashed" ? { dash: [10, 6] } : {})}
          lineCap="round"
          points={[0, 0, line.end.x, line.end.y]}
        />
      );
    },
  },
  {
    kind: "drawing.rectangle",
    render(object) {
      const rectangle = expectKind(object, "drawing.rectangle");
      return (
        <Rect
          {...commonShapeProps(rectangle)}
          {...fillProps(rectangle)}
          {...strokeProps(rectangle)}
          cornerRadius={8}
          height={rectangle.size.height}
          width={rectangle.size.width}
        />
      );
    },
  },
  {
    kind: "drawing.ellipse",
    render(object) {
      const ellipse = expectKind(object, "drawing.ellipse");
      return (
        <Ellipse
          {...commonShapeProps(ellipse)}
          {...fillProps(ellipse)}
          {...strokeProps(ellipse)}
          radiusX={ellipse.radius.x}
          radiusY={ellipse.radius.y}
        />
      );
    },
  },
  {
    kind: "svg-import.svg",
    render(object) {
      const svg = expectKind(object, "svg-import.svg");
      return <SvgRenderer object={svg} />;
    },
  },
  {
    kind: "drawing.text",
    render(object) {
      const text = expectKind(object, "drawing.text");
      return (
        <Text
          {...commonShapeProps(text)}
          fill={text.style.fill ?? text.style.stroke ?? "#17202a"}
          fontFamily="Inter, ui-sans-serif, system-ui"
          fontSize={22}
          lineHeight={1.35}
          text={text.text}
        />
      );
    },
  },
];

export function createDefaultKonvaRendererRegistry(): KonvaRendererRegistry {
  return new KonvaRendererRegistry(renderers);
}
