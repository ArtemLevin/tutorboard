import type {
  BoardObject,
  EllipseObject,
  LineObject,
  PenStrokeObject,
  RectangleObject,
  Vec2,
} from "../../core/public";

export const smartInkCompositeRecognizerVersion =
  "tutorboard.smart-ink-composite/1.0" as const;

export type SmartInkCompositeKind =
  | "inscribed-triangle"
  | "inscribed-quadrilateral"
  | "circumscribed-triangle"
  | "circumscribed-quadrilateral"
  | "sphere"
  | "cone"
  | "cylinder"
  | "cube"
  | "cuboid"
  | "triangular-prism"
  | "pyramid";

export interface SmartInkCompositeProposal {
  readonly confidence: number;
  readonly kind: SmartInkCompositeKind;
  readonly label: string;
  readonly originals: readonly BoardObject[];
  readonly recognizerVersion: typeof smartInkCompositeRecognizerVersion;
  readonly replacements: readonly BoardObject[];
}

interface PolygonPrimitive {
  readonly object: PenStrokeObject | RectangleObject;
  readonly vertices: readonly Vec2[];
}

interface Segment {
  readonly end: Vec2;
  readonly object: LineObject;
  readonly start: Vec2;
}

const labels: Readonly<Record<SmartInkCompositeKind, string>> = {
  "circumscribed-quadrilateral": "Окружность, вписанная в четырёхугольник",
  "circumscribed-triangle": "Окружность, вписанная в треугольник",
  cone: "Конус",
  cube: "Куб",
  cuboid: "Прямоугольный параллелепипед",
  cylinder: "Цилиндр",
  "inscribed-quadrilateral": "Четырёхугольник, вписанный в окружность",
  "inscribed-triangle": "Треугольник, вписанный в окружность",
  pyramid: "Пирамида",
  sphere: "Сфера",
  "triangular-prism": "Треугольная призма",
};

function add(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x + right.x, y: left.y + right.y };
}

function subtract(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function rotate(point: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function worldPoint(object: BoardObject, point: Vec2): Vec2 {
  return add(
    object.position,
    rotate(
      { x: point.x * object.scale.x, y: point.y * object.scale.y },
      object.rotation,
    ),
  );
}

function ellipseRadii(ellipse: EllipseObject): Vec2 {
  return {
    x: Math.abs(ellipse.radius.x * ellipse.scale.x),
    y: Math.abs(ellipse.radius.y * ellipse.scale.y),
  };
}

function ellipseCenter(ellipse: EllipseObject): Vec2 {
  return { ...ellipse.position };
}

function lineSegment(object: BoardObject): Segment | null {
  if (object.kind !== "drawing.line") return null;
  return {
    end: worldPoint(object, object.end),
    object,
    start: worldPoint(object, { x: 0, y: 0 }),
  };
}

function closeEnough(left: Vec2, right: Vec2, tolerance: number): boolean {
  return distance(left, right) <= tolerance;
}

function uniqueClosedVertices(points: readonly Vec2[]): readonly Vec2[] | null {
  if (points.length < 4) return null;
  const scale = Math.max(
    1,
    ...points.map((point) => Math.hypot(point.x, point.y)),
  );
  if (!closeEnough(points[0]!, points.at(-1)!, scale * 0.08)) return null;
  const vertices = points.slice(0, -1).filter((point, index, all) => {
    const previous = all[index - 1];
    return (
      previous === undefined || !closeEnough(previous, point, scale * 0.03)
    );
  });
  return vertices.length === 3 || vertices.length === 4 ? vertices : null;
}

function polygonPrimitive(object: BoardObject): PolygonPrimitive | null {
  if (object.kind === "drawing.rectangle") {
    const local = [
      { x: 0, y: 0 },
      { x: object.size.width, y: 0 },
      { x: object.size.width, y: object.size.height },
      { x: 0, y: object.size.height },
    ];
    return {
      object,
      vertices: local.map((point) => worldPoint(object, point)),
    };
  }
  if (object.kind !== "drawing.pen-stroke") return null;
  const vertices = uniqueClosedVertices(object.points);
  return vertices === null
    ? null
    : { object, vertices: vertices.map((point) => worldPoint(object, point)) };
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const delta = subtract(end, start);
  const lengthSquared = delta.x * delta.x + delta.y * delta.y;
  if (lengthSquared === 0) return distance(point, start);
  const offset = subtract(point, start);
  const t = Math.max(
    0,
    Math.min(1, (offset.x * delta.x + offset.y * delta.y) / lengthSquared),
  );
  return distance(point, {
    x: start.x + delta.x * t,
    y: start.y + delta.y * t,
  });
}

function polygonCenter(vertices: readonly Vec2[]): Vec2 {
  return {
    x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
    y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length,
  };
}

function polygonIncenter(vertices: readonly Vec2[]): Vec2 {
  if (vertices.length !== 3) return polygonCenter(vertices);
  const [first, second, third] = vertices as readonly [Vec2, Vec2, Vec2];
  const firstWeight = distance(second, third);
  const secondWeight = distance(first, third);
  const thirdWeight = distance(first, second);
  const total = firstWeight + secondWeight + thirdWeight;
  return {
    x:
      (first.x * firstWeight +
        second.x * secondWeight +
        third.x * thirdWeight) /
      total,
    y:
      (first.y * firstWeight +
        second.y * secondWeight +
        third.y * thirdWeight) /
      total,
  };
}

function canonicalLine(segment: Segment, start: Vec2, end: Vec2): LineObject {
  return {
    ...segment.object,
    end: subtract(end, start),
    position: start,
    rotation: 0,
    scale: { x: 1, y: 1 },
  };
}

function canonicalEllipse(
  ellipse: EllipseObject,
  center: Vec2,
  radius: Vec2,
): EllipseObject {
  return {
    ...ellipse,
    position: center,
    radius,
    rotation: 0,
    scale: { x: 1, y: 1 },
  };
}

function canonicalPolygon(
  polygon: PolygonPrimitive,
  vertices: readonly Vec2[],
): BoardObject {
  if (polygon.object.kind === "drawing.rectangle") return polygon.object;
  const first = vertices[0]!;
  return {
    ...polygon.object,
    points: [...vertices, first].map((point) => subtract(point, first)),
    position: first,
    rotation: 0,
    scale: { x: 1, y: 1 },
  };
}

function proposal(
  kind: SmartInkCompositeKind,
  originals: readonly BoardObject[],
  replacements: readonly BoardObject[],
  confidence: number,
): SmartInkCompositeProposal {
  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    kind,
    label: labels[kind],
    originals,
    recognizerVersion: smartInkCompositeRecognizerVersion,
    replacements,
  };
}

function recognizeCircleAndPolygon(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 2) return null;
  const ellipse = objects.find(
    (object): object is EllipseObject => object.kind === "drawing.ellipse",
  );
  const polygonObject = objects.find((object) => object !== ellipse);
  const polygon =
    polygonObject === undefined ? null : polygonPrimitive(polygonObject);
  if (ellipse === undefined || polygon === null) return null;
  const center = ellipseCenter(ellipse);
  const radii = ellipseRadii(ellipse);
  const meanRadius = (radii.x + radii.y) / 2;
  if (
    meanRadius < 8 ||
    Math.min(radii.x, radii.y) / Math.max(radii.x, radii.y) < 0.72
  ) {
    return null;
  }

  const radialErrors = polygon.vertices.map((vertex) => {
    const relative = subtract(vertex, center);
    return Math.abs(Math.hypot(relative.x / radii.x, relative.y / radii.y) - 1);
  });
  const maximumRadialError = Math.max(...radialErrors);
  if (maximumRadialError <= 0.24) {
    const snapped = polygon.vertices.map((vertex) => {
      const relative = subtract(vertex, center);
      const normalized = Math.hypot(relative.x / radii.x, relative.y / radii.y);
      return normalized === 0
        ? vertex
        : {
            x: center.x + relative.x / normalized,
            y: center.y + relative.y / normalized,
          };
    });
    const kind =
      polygon.vertices.length === 3
        ? "inscribed-triangle"
        : "inscribed-quadrilateral";
    return proposal(
      kind,
      objects,
      objects.map((object) =>
        object === polygon.object ? canonicalPolygon(polygon, snapped) : object,
      ),
      1 - maximumRadialError,
    );
  }

  const edgeDistances = polygon.vertices.map((vertex, index) =>
    pointSegmentDistance(
      center,
      vertex,
      polygon.vertices[(index + 1) % polygon.vertices.length]!,
    ),
  );
  const inradius =
    edgeDistances.reduce((sum, value) => sum + value, 0) / edgeDistances.length;
  const tangentError =
    Math.max(...edgeDistances.map((value) => Math.abs(value - inradius))) /
    inradius;
  const radiusError =
    Math.abs(inradius - meanRadius) / Math.max(inradius, meanRadius);
  if (inradius < 8 || tangentError > 0.22 || radiusError > 0.3) return null;
  const kind =
    polygon.vertices.length === 3
      ? "circumscribed-triangle"
      : "circumscribed-quadrilateral";
  const snappedCenter = polygonIncenter(polygon.vertices);
  const snappedRadius = Math.min(
    ...polygon.vertices.map((vertex, index) =>
      pointSegmentDistance(
        snappedCenter,
        vertex,
        polygon.vertices[(index + 1) % polygon.vertices.length]!,
      ),
    ),
  );
  return proposal(
    kind,
    objects,
    objects.map((object) =>
      object === ellipse
        ? canonicalEllipse(ellipse, snappedCenter, {
            x: snappedRadius,
            y: snappedRadius,
          })
        : object,
    ),
    1 - Math.max(tangentError, radiusError),
  );
}

function recognizeSphere(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (
    objects.length !== 2 ||
    objects.some((object) => object.kind !== "drawing.ellipse")
  ) {
    return null;
  }
  const ellipses = objects as readonly EllipseObject[];
  const [outer, inner] = [...ellipses].sort((left, right) => {
    const a = ellipseRadii(left);
    const b = ellipseRadii(right);
    return b.x * b.y - a.x * a.y;
  });
  if (outer === undefined || inner === undefined) return null;
  const outerRadius = ellipseRadii(outer);
  const innerRadius = ellipseRadii(inner);
  const scale = Math.max(outerRadius.x, outerRadius.y);
  if (
    scale < 12 ||
    Math.min(outerRadius.x, outerRadius.y) / scale < 0.72 ||
    distance(ellipseCenter(outer), ellipseCenter(inner)) > scale * 0.22 ||
    innerRadius.x / outerRadius.x < 0.55 ||
    innerRadius.x / outerRadius.x > 1.1 ||
    innerRadius.y / outerRadius.y > 0.55
  )
    return null;
  const normalizedInner = canonicalEllipse(inner, ellipseCenter(outer), {
    x: outerRadius.x * 0.9,
    y: outerRadius.y * 0.28,
  });
  return proposal(
    "sphere",
    objects,
    objects.map((object) => (object === inner ? normalizedInner : object)),
    0.9,
  );
}

function sharedEndpoint(
  segments: readonly Segment[],
  tolerance: number,
): { apex: Vec2; bases: readonly Vec2[] } | null {
  const candidates = segments.flatMap((segment) => [
    segment.start,
    segment.end,
  ]);
  for (const candidate of candidates) {
    const bases: Vec2[] = [];
    let sum = { x: 0, y: 0 };
    let count = 0;
    for (const segment of segments) {
      if (closeEnough(segment.start, candidate, tolerance)) {
        sum = add(sum, segment.start);
        count += 1;
        bases.push(segment.end);
      } else if (closeEnough(segment.end, candidate, tolerance)) {
        sum = add(sum, segment.end);
        count += 1;
        bases.push(segment.start);
      }
    }
    if (count === segments.length) {
      return { apex: { x: sum.x / count, y: sum.y / count }, bases };
    }
  }
  return null;
}

function recognizeCone(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 3) return null;
  const ellipse = objects.find(
    (object): object is EllipseObject => object.kind === "drawing.ellipse",
  );
  const segments = objects
    .map(lineSegment)
    .filter((value): value is Segment => value !== null);
  if (ellipse === undefined || segments.length !== 2) return null;
  const radii = ellipseRadii(ellipse);
  const scale = Math.max(radii.x, radii.y);
  const shared = sharedEndpoint(segments, scale * 0.22);
  if (shared === null) return null;
  const center = ellipseCenter(ellipse);
  const targets = [
    { x: center.x - radii.x, y: center.y },
    { x: center.x + radii.x, y: center.y },
  ];
  const baseError = Math.min(
    distance(shared.bases[0]!, targets[0]!) +
      distance(shared.bases[1]!, targets[1]!),
    distance(shared.bases[0]!, targets[1]!) +
      distance(shared.bases[1]!, targets[0]!),
  );
  if (
    baseError > scale * 0.65 ||
    Math.abs(shared.apex.y - center.y) < radii.y * 1.2
  )
    return null;
  const replacements = objects.map((object) => {
    const index = segments.findIndex((segment) => segment.object === object);
    if (index < 0) return object;
    const firstAssignment =
      distance(shared.bases[0]!, targets[0]!) +
      distance(shared.bases[1]!, targets[1]!);
    const target =
      firstAssignment <= baseError + 0.001
        ? targets[index]!
        : targets[1 - index]!;
    return canonicalLine(segments[index]!, shared.apex, target);
  });
  return proposal("cone", objects, replacements, 1 - baseError / (scale * 2));
}

function segmentPairError(segment: Segment, first: Vec2, second: Vec2): number {
  return Math.min(
    distance(segment.start, first) + distance(segment.end, second),
    distance(segment.start, second) + distance(segment.end, first),
  );
}

function snapSegmentsToPairs(
  segments: readonly Segment[],
  pairs: readonly (readonly [Vec2, Vec2])[],
  tolerance: number,
): readonly LineObject[] | null {
  const remaining = new Set(pairs.map((_, index) => index));
  const snapped: LineObject[] = [];
  for (const segment of segments) {
    let bestIndex = -1;
    let bestError = Number.POSITIVE_INFINITY;
    for (const index of remaining) {
      const pair = pairs[index]!;
      const error = segmentPairError(segment, pair[0], pair[1]);
      if (error < bestError) {
        bestError = error;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestError > tolerance) return null;
    remaining.delete(bestIndex);
    const pair = pairs[bestIndex]!;
    snapped.push(canonicalLine(segment, pair[0], pair[1]));
  }
  return remaining.size === 0 ? snapped : null;
}

function recognizeCylinder(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 4) return null;
  const ellipses = objects.filter(
    (object): object is EllipseObject => object.kind === "drawing.ellipse",
  );
  const segments = objects
    .map(lineSegment)
    .filter((value): value is Segment => value !== null);
  if (ellipses.length !== 2 || segments.length !== 2) return null;
  const [top, bottom] = [...ellipses].sort(
    (left, right) => left.position.y - right.position.y,
  );
  if (top === undefined || bottom === undefined) return null;
  const topRadius = ellipseRadii(top);
  const bottomRadius = ellipseRadii(bottom);
  const radius = {
    x: (topRadius.x + bottomRadius.x) / 2,
    y: (topRadius.y + bottomRadius.y) / 2,
  };
  const centerX = (top.position.x + bottom.position.x) / 2;
  const height = bottom.position.y - top.position.y;
  if (
    radius.x < 10 ||
    height < radius.y * 2 ||
    Math.abs(top.position.x - bottom.position.x) > radius.x * 0.28 ||
    Math.abs(topRadius.x - bottomRadius.x) > radius.x * 0.28
  )
    return null;
  const topCenter = { x: centerX, y: top.position.y };
  const bottomCenter = { x: centerX, y: bottom.position.y };
  const pairs: readonly (readonly [Vec2, Vec2])[] = [
    [
      { x: centerX - radius.x, y: topCenter.y },
      { x: centerX - radius.x, y: bottomCenter.y },
    ],
    [
      { x: centerX + radius.x, y: topCenter.y },
      { x: centerX + radius.x, y: bottomCenter.y },
    ],
  ];
  const snappedLines = snapSegmentsToPairs(segments, pairs, radius.x * 0.65);
  if (snappedLines === null) return null;
  return proposal(
    "cylinder",
    objects,
    objects.map((object) => {
      if (object === top) return canonicalEllipse(top, topCenter, radius);
      if (object === bottom)
        return canonicalEllipse(bottom, bottomCenter, radius);
      const index = segments.findIndex((segment) => segment.object === object);
      return index < 0 ? object : snappedLines[index]!;
    }),
    0.9,
  );
}

function recognizeBox(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 6) return null;
  const rectangles = objects.filter(
    (object): object is RectangleObject => object.kind === "drawing.rectangle",
  );
  const segments = objects
    .map(lineSegment)
    .filter((value): value is Segment => value !== null);
  if (rectangles.length !== 2 || segments.length !== 4) return null;
  const polygons = rectangles.map(polygonPrimitive);
  if (polygons.some((value) => value === null)) return null;
  const first = polygons[0]!;
  const second = polygons[1]!;
  const scale = Math.max(rectangles[0]!.size.width, rectangles[0]!.size.height);
  const pairs = first.vertices.map(
    (vertex, index) => [vertex, second.vertices[index]!] as const,
  );
  const snappedLines = snapSegmentsToPairs(segments, pairs, scale * 0.65);
  if (snappedLines === null) return null;
  const firstSize = rectangles[0]!.size;
  const secondSize = rectangles[1]!.size;
  const sizeDelta = Math.max(
    Math.abs(firstSize.width - secondSize.width) /
      Math.max(firstSize.width, secondSize.width),
    Math.abs(firstSize.height - secondSize.height) /
      Math.max(firstSize.height, secondSize.height),
  );
  if (sizeDelta > 0.3) return null;
  const squareRatio =
    Math.min(firstSize.width, firstSize.height) /
    Math.max(firstSize.width, firstSize.height);
  const kind: SmartInkCompositeKind = squareRatio > 0.82 ? "cube" : "cuboid";
  return proposal(
    kind,
    objects,
    objects.map((object) => {
      const index = segments.findIndex((segment) => segment.object === object);
      return index < 0 ? object : snappedLines[index]!;
    }),
    1 - sizeDelta,
  );
}

function recognizeTriangularPrism(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 5) return null;
  const polygons = objects
    .map(polygonPrimitive)
    .filter((value): value is PolygonPrimitive => value !== null);
  const triangles = polygons.filter((polygon) => polygon.vertices.length === 3);
  const segments = objects
    .map(lineSegment)
    .filter((value): value is Segment => value !== null);
  if (triangles.length !== 2 || segments.length !== 3) return null;
  const scale = Math.max(
    ...triangles[0]!.vertices.map((point) =>
      distance(point, polygonCenter(triangles[0]!.vertices)),
    ),
  );
  const pairs = triangles[0]!.vertices.map(
    (vertex, index) => [vertex, triangles[1]!.vertices[index]!] as const,
  );
  const snappedLines = snapSegmentsToPairs(segments, pairs, scale * 0.75);
  if (snappedLines === null) return null;
  return proposal(
    "triangular-prism",
    objects,
    objects.map((object) => {
      const index = segments.findIndex((segment) => segment.object === object);
      return index < 0 ? object : snappedLines[index]!;
    }),
    0.88,
  );
}

function recognizePyramid(
  objects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  if (objects.length !== 5) return null;
  const polygon = objects
    .map(polygonPrimitive)
    .find((value): value is PolygonPrimitive => value?.vertices.length === 4);
  const segments = objects
    .map(lineSegment)
    .filter((value): value is Segment => value !== null);
  if (polygon === undefined || segments.length !== 4) return null;
  const center = polygonCenter(polygon.vertices);
  const scale = Math.max(
    ...polygon.vertices.map((point) => distance(point, center)),
  );
  const shared = sharedEndpoint(segments, scale * 0.28);
  if (shared === null || distance(shared.apex, center) < scale * 0.45)
    return null;
  const pairs = polygon.vertices.map(
    (vertex) => [shared.apex, vertex] as const,
  );
  const snappedLines = snapSegmentsToPairs(segments, pairs, scale * 0.75);
  if (snappedLines === null) return null;
  return proposal(
    "pyramid",
    objects,
    objects.map((object) => {
      const index = segments.findIndex((segment) => segment.object === object);
      return index < 0 ? object : snappedLines[index]!;
    }),
    0.86,
  );
}

const recognizers = [
  recognizeBox,
  recognizeTriangularPrism,
  recognizePyramid,
  recognizeCylinder,
  recognizeCone,
  recognizeSphere,
  recognizeCircleAndPolygon,
] as const;

export function proposeSmartInkComposite(
  recentObjects: readonly BoardObject[],
): SmartInkCompositeProposal | null {
  const eligible = recentObjects.filter(
    (object) =>
      object.source.kind === "user" &&
      object.groupId === null &&
      !object.locked,
  );
  for (const size of [6, 5, 4, 3, 2]) {
    if (eligible.length < size) continue;
    const suffix = eligible.slice(-size);
    for (const recognize of recognizers) {
      const result = recognize(suffix);
      if (result !== null) return result;
    }
  }
  return null;
}
