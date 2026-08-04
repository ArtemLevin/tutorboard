import { createVectorInkDataFromPoints } from "../../core/public";

import {
  boardObjectId,
  groupId,
  identityTransform,
  type BoardGroup,
  type BoardObject,
  type BoardObjectId,
  type CommandMetadata,
  type GroupId,
  type ObjectStyle,
  type PasteContentCommand,
  type Vec2,
} from "../../core/public";

import type { TextShapeDefinition, TextShapeTemplate } from "./catalog";

const edgeStyle: ObjectStyle = {
  fill: null,
  opacity: 1,
  stroke: "#243847",
  strokeWidth: 2.5,
};
const hiddenEdgeStyle: ObjectStyle = {
  ...edgeStyle,
  opacity: 0.62,
  strokeStyle: "dashed",
};
const vertexStyle: ObjectStyle = {
  fill: "#2457d6",
  opacity: 1,
  stroke: "#ffffff",
  strokeWidth: 1,
};
const labelStyle: ObjectStyle = {
  fill: "#17202a",
  opacity: 1,
  stroke: null,
  strokeWidth: 0,
};

interface TemplateEdge {
  readonly end: number;
  readonly hidden?: boolean;
  readonly start: number;
}

interface TemplateEllipse {
  readonly center: Vec2;
  readonly hidden?: boolean;
  readonly radius: Vec2;
}

interface TemplatePolyline {
  readonly hidden?: boolean;
  readonly points: readonly Vec2[];
}

interface TemplateGeometry {
  readonly edges: readonly TemplateEdge[];
  readonly ellipses?: readonly TemplateEllipse[];
  readonly polylines?: readonly TemplatePolyline[];
  readonly vertices: readonly Vec2[];
  readonly vertexNames?: readonly string[];
}

export interface TextShapeIdentity {
  readonly definitionId: string;
  readonly groupId: GroupId;
  readonly token: string;
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function regularPolygon(
  sides: number,
  radiusX = 88,
  radiusY = radiusX,
  phase = -Math.PI / 2,
): readonly Vec2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = phase + (index * Math.PI * 2) / sides;
    return { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY };
  });
}

function closedEdges(count: number): readonly TemplateEdge[] {
  return Array.from({ length: count }, (_, index) => ({
    end: (index + 1) % count,
    start: index,
  }));
}

function ellipseArc(
  center: Vec2,
  radius: Vec2,
  start: number,
  finish: number,
  samples = 25,
): readonly Vec2[] {
  return Array.from({ length: samples }, (_, index) => {
    const progress = index / Math.max(1, samples - 1);
    const angle = start + (finish - start) * progress;
    return {
      x: center.x + Math.cos(angle) * radius.x,
      y: center.y + Math.sin(angle) * radius.y,
    };
  });
}

function triangleGeometry(
  variant: Extract<TextShapeTemplate, { kind: "triangle" }>["variant"],
): TemplateGeometry {
  const variants: Readonly<Record<typeof variant, readonly Vec2[]>> = {
    acute: [
      { x: -84, y: 58 },
      { x: 72, y: 62 },
      { x: 8, y: -72 },
    ],
    equilateral: [
      { x: -78, y: 58 },
      { x: 78, y: 58 },
      { x: 0, y: -77 },
    ],
    isosceles: [
      { x: -88, y: 58 },
      { x: 88, y: 58 },
      { x: 0, y: -72 },
    ],
    inscribed: [
      { x: -57.85, y: 68.94 },
      { x: 57.85, y: 68.94 },
      { x: 15.63, y: -88.63 },
    ],
    circumscribed: [
      { x: 0, y: -88 },
      { x: 76.21, y: 44 },
      { x: -76.21, y: 44 },
    ],
    obtuse: [
      { x: -94, y: 52 },
      { x: 92, y: 58 },
      { x: -48, y: -28 },
    ],
    right: [
      { x: -82, y: 62 },
      { x: 88, y: 62 },
      { x: -82, y: -68 },
    ],
    scalene: [
      { x: -90, y: 58 },
      { x: 82, y: 48 },
      { x: 24, y: -76 },
    ],
    standard: [
      { x: -86, y: 60 },
      { x: 86, y: 60 },
      { x: 12, y: -72 },
    ],
  };
  return {
    edges: closedEdges(3),
    ...(variant === "inscribed"
      ? { ellipses: [{ center: { x: 0, y: 0 }, radius: { x: 90, y: 90 } }] }
      : variant === "circumscribed"
        ? {
            ellipses: [{ center: { x: 0, y: 0 }, radius: { x: 44, y: 44 } }],
          }
        : {}),
    vertices: variants[variant],
  };
}

function quadrilateralGeometry(
  variant: Extract<TextShapeTemplate, { kind: "quadrilateral" }>["variant"],
): TemplateGeometry {
  const variants: Readonly<Record<typeof variant, readonly Vec2[]>> = {
    kite: [
      { x: 0, y: -82 },
      { x: 70, y: -2 },
      { x: 0, y: 82 },
      { x: -48, y: -2 },
    ],
    parallelogram: [
      { x: -74, y: -56 },
      { x: 94, y: -56 },
      { x: 74, y: 56 },
      { x: -94, y: 56 },
    ],
    rectangle: [
      { x: -92, y: -58 },
      { x: 92, y: -58 },
      { x: 92, y: 58 },
      { x: -92, y: 58 },
    ],
    rhombus: [
      { x: 0, y: -78 },
      { x: 92, y: 0 },
      { x: 0, y: 78 },
      { x: -92, y: 0 },
    ],
    "right-trapezoid": [
      { x: -86, y: -58 },
      { x: 50, y: -58 },
      { x: 88, y: 58 },
      { x: -86, y: 58 },
    ],
    square: [
      { x: -70, y: -70 },
      { x: 70, y: -70 },
      { x: 70, y: 70 },
      { x: -70, y: 70 },
    ],
    trapezoid: [
      { x: -55, y: -58 },
      { x: 72, y: -58 },
      { x: 96, y: 58 },
      { x: -92, y: 58 },
    ],
    "isosceles-trapezoid": [
      { x: -58, y: -58 },
      { x: 58, y: -58 },
      { x: 94, y: 58 },
      { x: -94, y: 58 },
    ],
    "inscribed-trapezoid": [
      { x: -57.85, y: -68.94 },
      { x: 57.85, y: -68.94 },
      { x: 81.57, y: 38.04 },
      { x: -81.57, y: 38.04 },
    ],
    "circumscribed-trapezoid": [
      { x: -40, y: -60 },
      { x: 40, y: -60 },
      { x: 90, y: 60 },
      { x: -90, y: 60 },
    ],
  };
  return {
    edges: closedEdges(4),
    ...(variant === "inscribed-trapezoid"
      ? { ellipses: [{ center: { x: 0, y: 0 }, radius: { x: 90, y: 90 } }] }
      : variant === "circumscribed-trapezoid"
        ? {
            ellipses: [{ center: { x: 0, y: 0 }, radius: { x: 60, y: 60 } }],
          }
        : {}),
    vertices: variants[variant],
  };
}

function prismGeometry(sides: number): TemplateGeometry {
  const front = regularPolygon(sides, 68, 61);
  const offset = { x: 52, y: -34 };
  const back = front.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
  const vertices = [...front, ...back];
  const edges: TemplateEdge[] = [
    ...closedEdges(sides),
    ...closedEdges(sides).map((edge) => ({
      end: edge.end + sides,
      hidden: edge.start > Math.floor(sides / 2),
      start: edge.start + sides,
    })),
    ...Array.from({ length: sides }, (_, index) => ({
      end: index + sides,
      hidden: index > Math.floor(sides / 2),
      start: index,
    })),
  ];
  return { edges, vertices };
}

function pyramidGeometry(sides: number): TemplateGeometry {
  const base = regularPolygon(sides, 88, 43, Math.PI / 2);
  const apex = { x: 0, y: -92 };
  return {
    edges: [
      ...closedEdges(sides).map((edge) => ({
        ...edge,
        hidden: edge.start > Math.floor(sides / 2),
      })),
      ...base.map((_, index) => ({ end: sides, start: index })),
    ],
    vertices: [...base, apex],
  };
}

function boxGeometry(cube: boolean): TemplateGeometry {
  const width = cube ? 118 : 168;
  const height = cube ? 118 : 94;
  const x = width / 2;
  const y = height / 2;
  const offset = { x: 46, y: -34 };
  const front = [
    { x: -x, y: -y },
    { x: x, y: -y },
    { x: x, y: y },
    { x: -x, y: y },
  ];
  const back = front.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
  return {
    edges: [
      ...closedEdges(4),
      ...closedEdges(4).map((edge) => ({
        end: edge.end + 4,
        hidden: edge.start === 2 || edge.start === 3,
        start: edge.start + 4,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        end: index + 4,
        hidden: index === 3,
        start: index,
      })),
    ],
    vertices: [...front, ...back],
  };
}

function solidGeometry(
  variant: Extract<TextShapeTemplate, { kind: "solid" }>["variant"],
): TemplateGeometry {
  if (variant === "cube" || variant === "cuboid") {
    return boxGeometry(variant === "cube");
  }
  if (variant === "octahedron") {
    const vertices = [
      { x: 0, y: -96 },
      { x: 92, y: 0 },
      { x: 0, y: 96 },
      { x: -92, y: 0 },
      { x: 0, y: -24 },
      { x: 0, y: 28 },
    ];
    return {
      edges: [
        { start: 0, end: 1 },
        { start: 0, end: 3 },
        { start: 0, end: 4 },
        { start: 1, end: 2 },
        { start: 2, end: 3 },
        { start: 2, end: 5 },
        { start: 1, end: 4 },
        { start: 3, end: 4, hidden: true },
        { start: 1, end: 5 },
        { start: 3, end: 5, hidden: true },
      ],
      vertices,
    };
  }
  if (variant === "cone") {
    const baseCenter = { x: 0, y: 58 };
    const baseRadius = { x: 82, y: 23 };
    return {
      edges: [
        { start: 0, end: 1 },
        { start: 0, end: 2 },
      ],
      polylines: [
        { points: ellipseArc(baseCenter, baseRadius, 0, Math.PI) },
        {
          hidden: true,
          points: ellipseArc(baseCenter, baseRadius, Math.PI, Math.PI * 2),
        },
      ],
      vertices: [
        { x: 0, y: -92 },
        { x: -82, y: 58 },
        { x: 82, y: 58 },
      ],
    };
  }
  if (variant === "cylinder" || variant === "frustum") {
    const topRadius = variant === "frustum" ? 48 : 78;
    const bottomCenter = { x: 0, y: 68 };
    const bottomRadius = { x: 82, y: 24 };
    return {
      edges: [
        { start: 0, end: 2 },
        { start: 1, end: 3 },
      ],
      ellipses: [{ center: { x: 0, y: -68 }, radius: { x: topRadius, y: 22 } }],
      polylines: [
        { points: ellipseArc(bottomCenter, bottomRadius, 0, Math.PI) },
        {
          hidden: true,
          points: ellipseArc(bottomCenter, bottomRadius, Math.PI, Math.PI * 2),
        },
      ],
      vertices: [
        { x: -topRadius, y: -68 },
        { x: topRadius, y: -68 },
        { x: -82, y: 68 },
        { x: 82, y: 68 },
      ],
    };
  }
  if (variant === "sphere") {
    return {
      edges: [],
      ellipses: [{ center: { x: 0, y: 0 }, radius: { x: 82, y: 82 } }],
      polylines: [
        {
          points: ellipseArc({ x: 0, y: 0 }, { x: 76, y: 23 }, 0, Math.PI),
        },
        {
          hidden: true,
          points: ellipseArc(
            { x: 0, y: 0 },
            { x: 76, y: 23 },
            Math.PI,
            Math.PI * 2,
          ),
        },
      ],
      vertices: [],
    };
  }
  return {
    edges: [],
    polylines: [
      {
        points: Array.from({ length: 25 }, (_, index) => {
          const angle = Math.PI + (index * Math.PI) / 24;
          return { x: Math.cos(angle) * 82, y: Math.sin(angle) * 82 - 8 };
        }),
      },
      {
        points: ellipseArc({ x: 0, y: 24 }, { x: 82, y: 32 }, 0, Math.PI),
      },
      {
        hidden: true,
        points: ellipseArc(
          { x: 0, y: 24 },
          { x: 82, y: 32 },
          Math.PI,
          Math.PI * 2,
        ),
      },
    ],
    vertices: [],
  };
}

function geometry(template: TextShapeTemplate): TemplateGeometry {
  switch (template.kind) {
    case "point":
      return { edges: [], vertices: [{ x: 0, y: 0 }], vertexNames: ["A"] };
    case "line":
      return {
        edges: [{ start: 0, end: 1 }],
        vertices: [
          { x: -96, y: 0 },
          { x: 96, y: 0 },
        ],
      };
    case "angle": {
      const degrees =
        template.degrees ??
        (template.variant === "acute"
          ? 42
          : template.variant === "right"
            ? 90
            : template.variant === "obtuse"
              ? 132
              : 64);
      const radians = (degrees * Math.PI) / 180;
      return {
        edges: [
          { start: 0, end: 1 },
          { start: 0, end: 2 },
        ],
        vertices: [
          { x: -62, y: 42 },
          { x: 82, y: 42 },
          {
            x: -62 + Math.cos(-radians) * 144,
            y: 42 + Math.sin(-radians) * 144,
          },
        ],
        vertexNames: ["O", "A", "B"],
      };
    }
    case "triangle":
      return triangleGeometry(template.variant);
    case "quadrilateral":
      return quadrilateralGeometry(template.variant);
    case "regular-polygon":
      return {
        edges: closedEdges(template.sides),
        vertices: regularPolygon(template.sides),
      };
    case "conic":
      if (template.variant === "semicircle") {
        return {
          edges: [],
          polylines: [
            {
              points: Array.from({ length: 25 }, (_, index) => {
                const angle = Math.PI + (index * Math.PI) / 24;
                return {
                  x: Math.cos(angle) * 88,
                  y: Math.sin(angle) * 88 + 34,
                };
              }),
            },
            {
              points: [
                { x: -88, y: 34 },
                { x: 88, y: 34 },
              ],
            },
          ],
          vertices: [
            { x: -88, y: 34 },
            { x: 88, y: 34 },
          ],
        };
      }
      return {
        edges: [],
        ellipses: [
          {
            center: { x: 0, y: 0 },
            radius:
              template.variant === "circle"
                ? { x: 82, y: 82 }
                : { x: 96, y: 60 },
          },
        ],
        vertices: [],
      };
    case "solid":
      return solidGeometry(template.variant);
    case "prism":
      return prismGeometry(template.sides);
    case "pyramid":
      return pyramidGeometry(template.sides);
  }
}

function objectBase(id: BoardObjectId, targetGroupId: GroupId, position: Vec2) {
  return {
    groupId: targetGroupId,
    id,
    locked: false,
    position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    visible: true,
  };
}

function pointLabelPosition(point: Vec2): Vec2 {
  const length = Math.max(1, Math.hypot(point.x, point.y));
  return {
    x: point.x + (point.x / length) * 12 + 7,
    y: point.y + (point.y / length) * 12 - 8,
  };
}

export function textShapeIdentityFromGroupId(
  value: GroupId | null,
): TextShapeIdentity | null {
  if (value === null) return null;
  const match = /^group:text-shape:([^:]+):(.+)$/.exec(value);
  return match === null
    ? null
    : { groupId: value, token: match[1]!, definitionId: match[2]! };
}

export function textShapeVertexNameFromObjectId(
  value: BoardObjectId,
): string | null {
  return (
    /^object:text-shape:[^:]+:vertex:([A-Z][0-9]*)$/.exec(value)?.[1] ?? null
  );
}

export function textShapeLabelNameFromObjectId(
  value: BoardObjectId,
): string | null {
  return (
    /^(?:object:text-shape:[^:]+:label|object:text-shape-construction:[^:]+:[^:]+:[^:]+:label|object:text-shape-manual:[^:]+:label):([A-Z][0-9]*)$/.exec(
      value,
    )?.[1] ?? null
  );
}

export function createTextShapePlacementCommand(input: {
  readonly autoLabelVertices: boolean;
  readonly definition: TextShapeDefinition;
  readonly metadata: CommandMetadata;
  readonly placement: Vec2;
  readonly token: string;
}): PasteContentCommand {
  const targetGroupId = groupId(
    `group:text-shape:${input.token}:${input.definition.id}`,
  );
  const model = geometry(input.definition.template);
  const names =
    model.vertexNames ??
    model.vertices.map((_, index) => letters[index] ?? `V${String(index + 1)}`);
  const objects: BoardObject[] = [];

  for (const [index, edge] of model.edges.entries()) {
    const start = model.vertices[edge.start]!;
    const end = model.vertices[edge.end]!;
    objects.push({
      ...objectBase(
        boardObjectId(`object:text-shape:${input.token}:edge:${String(index)}`),
        targetGroupId,
        start,
      ),
      end: { x: end.x - start.x, y: end.y - start.y },
      kind: "drawing.line",
      lineStyle: edge.hidden ? "dashed" : "solid",
      style: edge.hidden ? hiddenEdgeStyle : edgeStyle,
    });
  }
  for (const [index, item] of (model.ellipses ?? []).entries()) {
    objects.push({
      ...objectBase(
        boardObjectId(
          `object:text-shape:${input.token}:ellipse:${String(index)}`,
        ),
        targetGroupId,
        item.center,
      ),
      kind: "drawing.ellipse",
      radius: item.radius,
      style: item.hidden ? hiddenEdgeStyle : edgeStyle,
    });
  }
  for (const [index, item] of (model.polylines ?? []).entries()) {
    const first = item.points[0]!;
    const points = item.points.map((point) => ({
      x: point.x - first.x,
      y: point.y - first.y,
    }));
    objects.push({
      ...objectBase(
        boardObjectId(
          `object:text-shape:${input.token}:curve:${String(index)}`,
        ),
        targetGroupId,
        first,
      ),
      ink: createVectorInkDataFromPoints(points),
      kind: "drawing.pen-stroke",
      points,
      style: item.hidden ? hiddenEdgeStyle : edgeStyle,
    });
  }
  for (const [index, point] of model.vertices.entries()) {
    const name = names[index]!;
    objects.push({
      ...objectBase(
        boardObjectId(`object:text-shape:${input.token}:vertex:${name}`),
        targetGroupId,
        point,
      ),
      kind: "drawing.ellipse",
      radius: { x: 4.5, y: 4.5 },
      style: vertexStyle,
    });
    objects.push({
      ...objectBase(
        boardObjectId(`object:text-shape:${input.token}:label:${name}`),
        targetGroupId,
        pointLabelPosition(point),
      ),
      kind: "drawing.text",
      style: labelStyle,
      text: name,
      visible: input.autoLabelVertices,
    });
  }

  const group: BoardGroup = {
    id: targetGroupId,
    locked: false,
    objectIds: objects.map(({ id }) => id),
    transform: {
      ...identityTransform,
      translation: input.placement,
    },
  };
  return {
    ...input.metadata,
    geometryImports: [],
    groups: [group],
    kind: "core.clipboard.paste",
    objects,
  };
}
