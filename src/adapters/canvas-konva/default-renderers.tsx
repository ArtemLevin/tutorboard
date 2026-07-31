import type { ReactElement } from "react";
import { Ellipse, Group, Line, Rect, Text } from "react-konva";

import type { BoardObject, BoardObjectKind, Vec2 } from "../../core/public";
import { renderSafeMathLabel } from "../../shared/safe-math-label";
import {
  buildCachedSmoothStrokePoints,
  buildSmoothStrokePoints,
  flattenStrokePoints,
} from "../../shared/stroke-smoothing";
import { EmbeddedImageRenderer } from "./embedded-image-renderer";
import { SvgRenderer } from "./svg-renderer";
import {
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";
import {
  createEllipseContour,
  createHandDrawnSegment,
  createRectangleContour,
  createSketchPath,
  createWavySegment,
  isSketchStrokeStyle,
  resolveSketchPasses,
  resolveStrokeStyle,
  type SketchPass,
} from "./stroke-style";

function expectKind<Kind extends BoardObjectKind>(
  object: BoardObject,
  kind: Kind,
): Extract<BoardObject, { readonly kind: Kind }> {
  if (object.kind !== kind)
    throw new Error(`Renderer ${kind} received ${object.kind}.`);
  return object as Extract<BoardObject, { readonly kind: Kind }>;
}

function commonTransformProps(object: BoardObject) {
  return {
    rotation: object.rotation,
    scaleX: object.scale.x,
    scaleY: object.scale.y,
    visible: object.visible,
    x: object.position.x,
    y: object.position.y,
  } as const;
}

function commonShapeProps(object: BoardObject) {
  const resolved = resolveStrokeStyle(
    object.style.strokeStyle,
    object.style.strokeWidth,
  );
  return {
    ...commonTransformProps(object),
    ...(resolved.dash === undefined ? {} : { dash: [...resolved.dash] }),
    hitStrokeWidth: Math.max(14, resolved.strokeWidth),
    lineCap: resolved.lineCap,
    lineJoin: "round" as const,
    name: "board-transform-target",
    opacity: object.style.opacity * resolved.opacityMultiplier,
    strokeWidth: resolved.strokeWidth,
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
  zoom: number,
): readonly number[] {
  return object.style.strokeStyle === "wavy"
    ? createWavySegment(object.end, zoom)
    : [0, 0, object.end.x, object.end.y];
}

function pointPairs(points: readonly number[]): readonly Vec2[] {
  const output: Vec2[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    output.push({ x: points[index]!, y: points[index + 1]! });
  }
  return output;
}

function smoothFlatPoints(
  points: readonly number[],
  zoom: number,
): readonly number[] {
  return flattenStrokePoints(
    buildSmoothStrokePoints(pointPairs(points), { zoom }),
  );
}

function sketchPassLine(
  object: BoardObject,
  pass: SketchPass,
  points: readonly number[],
  index: number,
  closed: boolean,
): ReactElement {
  return (
    <Line
      {...strokeProps(object)}
      {...(pass.dash === undefined ? {} : { dash: [...pass.dash] })}
      closed={closed}
      hitStrokeWidth={index === 0 ? Math.max(14, pass.strokeWidth) : 0}
      key={`${pass.seed}-${index}`}
      lineCap="round"
      lineJoin="round"
      listening={index === 0}
      opacity={object.style.opacity * pass.opacityMultiplier}
      perfectDrawEnabled
      points={[...points]}
      strokeWidth={pass.strokeWidth}
      tension={0}
    />
  );
}

function renderSketchPath(
  object: BoardObject,
  pointsForPass: (pass: SketchPass) => readonly number[],
  closed: boolean,
  fill: ReactElement | null = null,
): ReactElement {
  const passes = resolveSketchPasses(
    object.style.strokeStyle,
    object.style.strokeWidth,
  );
  return (
    <Group {...commonTransformProps(object)} name="board-transform-target">
      {fill}
      {passes.map((pass, index) =>
        sketchPassLine(object, pass, pointsForPass(pass), index, closed),
      )}
    </Group>
  );
}

function sketchPoints(
  source: readonly Vec2[],
  pass: SketchPass,
  closed: boolean,
  zoom = 1,
): readonly number[] {
  const renderPoints = closed
    ? source
    : buildSmoothStrokePoints(source, { zoom });
  return createSketchPath(
    renderPoints,
    pass.intensity,
    pass.seed,
    closed,
  );
}

const renderers: readonly KonvaObjectRenderer[] = [
  {
    kind: "drawing.pen-stroke",
    render(object, context) {
      const stroke = expectKind(object, "drawing.pen-stroke");
      const smoothed = buildCachedSmoothStrokePoints(
        stroke.points,
        context.zoom,
      );
      if (isSketchStrokeStyle(stroke.style.strokeStyle)) {
        return renderSketchPath(
          stroke,
          (pass) =>
            createSketchPath(
              smoothed,
              pass.intensity,
              pass.seed,
              false,
            ),
          false,
        );
      }
      return (
        <Line
          {...commonShapeProps(stroke)}
          {...strokeProps(stroke)}
          perfectDrawEnabled
          points={[...flattenStrokePoints(smoothed)]}
          tension={0}
        />
      );
    },
  },
  {
    kind: "drawing.line",
    render(object, context) {
      const line = expectKind(object, "drawing.line");
      if (isSketchStrokeStyle(line.style.strokeStyle)) {
        return renderSketchPath(
          line,
          (pass) =>
            smoothFlatPoints(
              createHandDrawnSegment(
                line.end,
                pass.intensity,
                pass.seed,
                context.zoom,
              ),
              context.zoom,
            ),
          false,
        );
      }
      return (
        <Line
          {...commonShapeProps(line)}
          {...strokeProps(line)}
          {...(line.lineStyle === "dashed" &&
          line.style.strokeStyle === undefined
            ? { dash: [10, 6] }
            : {})}
          perfectDrawEnabled
          points={[...linePoints(line, context.zoom)]}
        />
      );
    },
  },
  {
    kind: "drawing.rectangle",
    render(object) {
      const rectangle = expectKind(object, "drawing.rectangle");
      if (isSketchStrokeStyle(rectangle.style.strokeStyle)) {
        const contour = createRectangleContour(rectangle.size);
        return renderSketchPath(
          rectangle,
          (pass) => sketchPoints(contour, pass, true),
          true,
          <Rect
            {...fillProps(rectangle)}
            cornerRadius={8}
            height={rectangle.size.height}
            listening={false}
            opacity={rectangle.style.opacity}
            width={rectangle.size.width}
          />,
        );
      }
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
      if (isSketchStrokeStyle(ellipse.style.strokeStyle)) {
        const contour = createEllipseContour(ellipse.radius);
        return renderSketchPath(
          ellipse,
          (pass) => sketchPoints(contour, pass, true),
          true,
          <Ellipse
            {...fillProps(ellipse)}
            listening={false}
            opacity={ellipse.style.opacity}
            radiusX={ellipse.radius.x}
            radiusY={ellipse.radius.y}
          />,
        );
      }
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
    kind: "image.embedded",
    render(object) {
      return (
        <EmbeddedImageRenderer object={expectKind(object, "image.embedded")} />
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
