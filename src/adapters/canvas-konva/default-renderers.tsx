import { Ellipse, Line, Rect, Text } from "react-konva";

import type { BoardObject, BoardObjectKind } from "../../core/public";
import { renderSafeMathLabel } from "../../shared/safe-math-label";
import { SvgRenderer } from "./svg-renderer";
import {
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";
import {
  createHandDrawnSegment,
  createWavySegment,
  resolveStrokeStyle,
} from "./stroke-style";

function expectKind<Kind extends BoardObjectKind>(
  object: BoardObject,
  kind: Kind,
): Extract<BoardObject, { readonly kind: Kind }> {
  if (object.kind !== kind)
    throw new Error(`Renderer ${kind} received ${object.kind}.`);
  return object as Extract<BoardObject, { readonly kind: Kind }>;
}

function commonShapeProps(object: BoardObject) {
  const resolved = resolveStrokeStyle(
    object.style.strokeStyle,
    object.style.strokeWidth,
  );
  return {
    ...(resolved.dash === undefined ? {} : { dash: [...resolved.dash] }),
    hitStrokeWidth: Math.max(14, resolved.strokeWidth),
    lineCap: resolved.lineCap,
    lineJoin: "round" as const,
    name: "board-transform-target",
    opacity: object.style.opacity * resolved.opacityMultiplier,
    rotation: object.rotation,
    scaleX: object.scale.x,
    scaleY: object.scale.y,
    strokeWidth: resolved.strokeWidth,
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

function linePoints(
  object: Extract<BoardObject, { readonly kind: "drawing.line" }>,
): readonly number[] {
  switch (object.style.strokeStyle) {
    case "wavy":
      return createWavySegment(object.end);
    case "hand-pencil":
      return createHandDrawnSegment(object.end, 2.4);
    case "hand-pen":
      return createHandDrawnSegment(object.end, 1.15);
    default:
      return [0, 0, object.end.x, object.end.y];
  }
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
          points={stroke.points.flatMap(({ x, y }) => [x, y])}
          tension={stroke.style.strokeStyle === "hand-pen" ? 0.12 : 0}
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
          {...(line.lineStyle === "dashed" &&
          line.style.strokeStyle === undefined
            ? { dash: [10, 6] }
            : {})}
          points={[...linePoints(line)]}
          tension={line.style.strokeStyle === "hand-pen" ? 0.18 : 0}
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
      return <SvgRenderer object={expectKind(object, "svg-import.svg")} />;
    },
  },
  {
    kind: "drawing.text",
    render(object) {
      const text = expectKind(object, "drawing.text");
      const label = renderSafeMathLabel(text.text);
      return (
        <Text
          {...commonShapeProps(text)}
          fill={text.style.fill ?? text.style.stroke ?? "#17202a"}
          fontFamily="Inter, ui-sans-serif, system-ui"
          fontSize={22}
          lineHeight={1.35}
          text={label.displayText}
        />
      );
    },
  },
];

export function createDefaultKonvaRendererRegistry(): KonvaRendererRegistry {
  return new KonvaRendererRegistry(renderers);
}
