import {
  createVectorInkData,
  resolveVectorInkData,
  type BoardDocument,
  type BoardObject,
  type BoardObjectId,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type PenStrokeObject,
  type VectorInkSample,
  type Vec2,
} from "../../core/public";

const maximumEraserPathPoints = 4096;
const maximumSegmentSubdivisions = 64;
const boundaryRefinementSteps = 10;
const pointEpsilon = 1e-6;

export const defaultEraserDiameterPx = 24;
export const minimumEraserDiameterPx = 8;
export const maximumEraserDiameterPx = 96;

export interface EraserStrokeChange {
  readonly original: PenStrokeObject;
  readonly replacements: readonly PenStrokeObject[];
}

export interface EraserResult {
  readonly changes: readonly EraserStrokeChange[];
  readonly originals: readonly PenStrokeObject[];
  readonly replacements: readonly PenStrokeObject[];
}

export type EraserFragmentIdFactory = (
  original: PenStrokeObject,
  fragmentIndex: number,
) => BoardObjectId;

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return distance(left, right) <= pointEpsilon;
}

function normalizePath(points: readonly Vec2[]): readonly Vec2[] {
  const result: Vec2[] = [];
  for (const point of points.slice(0, maximumEraserPathPoints)) {
    if (!finitePoint(point)) continue;
    const previous = result.at(-1);
    if (previous === undefined || !samePoint(previous, point)) {
      result.push(point);
    }
  }
  return result;
}

function pointToSegmentDistance(
  point: Vec2,
  start: Vec2,
  finish: Vec2,
): number {
  const dx = finish.x - start.x;
  const dy = finish.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= pointEpsilon) return distance(point, start);
  const ratio = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return distance(point, {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio,
  });
}

function distanceToPath(point: Vec2, path: readonly Vec2[]): number {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distance(point, path[0]!);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    minimum = Math.min(
      minimum,
      pointToSegmentDistance(point, path[index - 1]!, path[index]!),
    );
  }
  return minimum;
}

function worldPoint(stroke: PenStrokeObject, point: Vec2): Vec2 {
  const scaled = {
    x: point.x * stroke.scale.x,
    y: point.y * stroke.scale.y,
  };
  const radians = (stroke.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: scaled.x * cosine - scaled.y * sine + stroke.position.x,
    y: scaled.x * sine + scaled.y * cosine + stroke.position.y,
  };
}

function interpolateSample(
  start: VectorInkSample,
  finish: VectorInkSample,
  ratio: number,
): VectorInkSample {
  return {
    point: {
      x: start.point.x + (finish.point.x - start.point.x) * ratio,
      y: start.point.y + (finish.point.y - start.point.y) * ratio,
    },
    pressure: start.pressure + (finish.pressure - start.pressure) * ratio,
    timestampMs:
      start.timestampMs + (finish.timestampMs - start.timestampMs) * ratio,
  };
}

function appendSample(
  samples: VectorInkSample[],
  sample: VectorInkSample,
): void {
  const previous = samples.at(-1);
  if (previous === undefined || !samePoint(previous.point, sample.point)) {
    samples.push(sample);
  }
}

function sampleErased(
  stroke: PenStrokeObject,
  sample: VectorInkSample,
  path: readonly Vec2[],
  radiusWorld: number,
): boolean {
  return distanceToPath(worldPoint(stroke, sample.point), path) <= radiusWorld;
}

function boundarySample(
  stroke: PenStrokeObject,
  start: VectorInkSample,
  finish: VectorInkSample,
  path: readonly Vec2[],
  radiusWorld: number,
  startRatio: number,
  finishRatio: number,
  startErased: boolean,
): VectorInkSample {
  let low = startRatio;
  let high = finishRatio;
  for (let step = 0; step < boundaryRefinementSteps; step += 1) {
    const middle = (low + high) / 2;
    const erased = sampleErased(
      stroke,
      interpolateSample(start, finish, middle),
      path,
      radiusWorld,
    );
    if (erased === startErased) low = middle;
    else high = middle;
  }
  return interpolateSample(start, finish, (low + high) / 2);
}

function strokeBounds(
  stroke: PenStrokeObject,
  samples: readonly VectorInkSample[],
) {
  const points = samples.map((sample) => worldPoint(stroke, sample.point));
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function pathBounds(path: readonly Vec2[], radius: number) {
  const xs = path.map(({ x }) => x);
  const ys = path.map(({ y }) => y);
  return {
    left: Math.min(...xs) - radius,
    right: Math.max(...xs) + radius,
    top: Math.min(...ys) - radius,
    bottom: Math.max(...ys) + radius,
  };
}

function boundsIntersect(
  left: ReturnType<typeof strokeBounds>,
  right: ReturnType<typeof pathBounds>,
): boolean {
  return (
    left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top
  );
}

export function erasePenStroke(
  stroke: PenStrokeObject,
  rawPath: readonly Vec2[],
  radiusWorld: number,
  createFragmentId: EraserFragmentIdFactory,
): readonly PenStrokeObject[] | null {
  const path = normalizePath(rawPath);
  if (path.length === 0 || !Number.isFinite(radiusWorld) || radiusWorld <= 0) {
    return null;
  }

  const ink = resolveVectorInkData(stroke);
  const samples = ink.samples;
  if (samples.length === 1) {
    return sampleErased(stroke, samples[0]!, path, radiusWorld) ? [] : null;
  }
  if (samples.length < 2) return null;
  if (
    !boundsIntersect(
      strokeBounds(stroke, samples),
      pathBounds(path, radiusWorld),
    )
  ) {
    return null;
  }

  const fragments: VectorInkSample[][] = [];
  let current: VectorInkSample[] = [];
  let touched = false;
  const firstSample = samples[0]!;
  let previousErased = sampleErased(stroke, firstSample, path, radiusWorld);
  if (!previousErased) appendSample(current, firstSample);
  else touched = true;

  for (let index = 1; index < samples.length; index += 1) {
    const segmentStart = samples[index - 1]!;
    const segmentFinish = samples[index]!;
    const worldLength = distance(
      worldPoint(stroke, segmentStart.point),
      worldPoint(stroke, segmentFinish.point),
    );
    const stepWorld = Math.max(1, radiusWorld * 0.35);
    const subdivisions = Math.min(
      maximumSegmentSubdivisions,
      Math.max(1, Math.ceil(worldLength / stepWorld)),
    );

    for (let subdivision = 1; subdivision <= subdivisions; subdivision += 1) {
      const ratio = subdivision / subdivisions;
      const candidate = interpolateSample(segmentStart, segmentFinish, ratio);
      const erased = sampleErased(stroke, candidate, path, radiusWorld);
      if (erased !== previousErased) {
        const previousRatio = (subdivision - 1) / subdivisions;
        const boundary = boundarySample(
          stroke,
          segmentStart,
          segmentFinish,
          path,
          radiusWorld,
          previousRatio,
          ratio,
          previousErased,
        );
        if (!previousErased) {
          appendSample(current, boundary);
          if (current.length >= 2) fragments.push(current);
          current = [];
        } else {
          current = [boundary];
        }
      }
      if (!erased) appendSample(current, candidate);
      else touched = true;
      previousErased = erased;
    }
  }

  if (current.length >= 2) fragments.push(current);
  if (!touched) return null;

  return fragments.map((fragment, fragmentIndex) => ({
    ...stroke,
    id: createFragmentId(stroke, fragmentIndex),
    ink: createVectorInkData(fragment, false),
    points: fragment.map(({ point }) => point),
    style:
      ink.closed && stroke.style.fill !== null
        ? { ...stroke.style, fill: null }
        : stroke.style,
  }));
}

export function eraseDocumentPenStrokes(
  objects: readonly BoardObject[],
  path: readonly Vec2[],
  radiusWorld: number,
  createFragmentId: EraserFragmentIdFactory,
): EraserResult {
  const changes: EraserStrokeChange[] = [];
  const originals: PenStrokeObject[] = [];
  const replacements: PenStrokeObject[] = [];

  for (const object of objects) {
    if (
      object.kind !== "drawing.pen-stroke" ||
      !object.visible ||
      object.locked ||
      object.groupId !== null ||
      object.source.kind !== "user"
    ) {
      continue;
    }
    const fragments = erasePenStroke(
      object,
      path,
      radiusWorld,
      createFragmentId,
    );
    if (fragments === null) continue;
    changes.push({ original: object, replacements: fragments });
    originals.push(object);
    replacements.push(...fragments);
  }

  return { changes, originals, replacements };
}


export interface EraserDocumentResult extends EraserResult {
  readonly deletedObjectIds: readonly BoardObjectId[];
  readonly suppressedObjectIds: readonly BoardObjectId[];
}

interface ObjectPath {
  readonly closed: boolean;
  readonly points: readonly Vec2[];
}

function transformPoint(point: Vec2, transform: {
  readonly rotation: number;
  readonly scale: Vec2;
  readonly translation: Vec2;
}): Vec2 {
  const scaled = {
    x: point.x * transform.scale.x,
    y: point.y * transform.scale.y,
  };
  const radians = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: scaled.x * cosine - scaled.y * sine + transform.translation.x,
    y: scaled.x * sine + scaled.y * cosine + transform.translation.y,
  };
}

function rectanglePath(width: number, height: number): ObjectPath {
  return {
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  };
}

function localObjectPath(object: BoardObject): ObjectPath {
  switch (object.kind) {
    case "drawing.pen-stroke":
      return { closed: false, points: object.points };
    case "drawing.line":
      return { closed: false, points: [{ x: 0, y: 0 }, object.end] };
    case "drawing.rectangle":
      return rectanglePath(object.size.width, object.size.height);
    case "drawing.ellipse": {
      const count = Math.min(
        96,
        Math.max(36, Math.ceil(Math.max(object.radius.x, object.radius.y) / 3)),
      );
      return {
        closed: true,
        points: Array.from({ length: count }, (_value, index) => {
          const angle = (index / count) * Math.PI * 2;
          return {
            x: Math.cos(angle) * object.radius.x,
            y: Math.sin(angle) * object.radius.y,
          };
        }),
      };
    }
    case "drawing.text": {
      const lines = object.text.split(/\r?\n/u);
      return rectanglePath(
        Math.max(1, ...lines.map((line) => line.length)) * 13.2,
        Math.max(1, lines.length) * 29.7,
      );
    }
    case "math.coordinate-plot":
      return rectanglePath(
        object.definition.size.width,
        object.definition.size.height,
      );
    case "image.embedded":
    case "media.asset":
    case "svg-import.svg":
      return rectanglePath(object.size.width, object.size.height);
  }
}

function worldObjectPath(item: BoardRenderItem): ObjectPath {
  const local = localObjectPath(item.object);
  const transforms = [
    {
      rotation: item.object.rotation,
      scale: item.object.scale,
      translation: item.object.position,
    },
    ...[...item.transforms].reverse(),
  ];
  return {
    closed: local.closed,
    points: local.points.map((point) =>
      transforms.reduce(
        (current, transform) => transformPoint(current, transform),
        point,
      ),
    ),
  };
}

function pathSegments(points: readonly Vec2[], closed: boolean) {
  if (points.length < 2) return [] as readonly (readonly [Vec2, Vec2])[];
  const segments: (readonly [Vec2, Vec2])[] = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push([points[index - 1]!, points[index]!]);
  }
  if (closed && points.length > 2) {
    segments.push([points.at(-1)!, points[0]!]);
  }
  return segments;
}

function crossProduct(origin: Vec2, first: Vec2, second: Vec2): number {
  return (
    (first.x - origin.x) * (second.y - origin.y) -
    (first.y - origin.y) * (second.x - origin.x)
  );
}

function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    if (
      pointToSegmentDistance(point, previous, current) <= pointEpsilon
    ) {
      return true;
    }
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): boolean {
  const a = crossProduct(a0, a1, b0);
  const b = crossProduct(a0, a1, b1);
  const c = crossProduct(b0, b1, a0);
  const d = crossProduct(b0, b1, a1);
  return a * b <= 0 && c * d <= 0;
}

function segmentDistance(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
): number {
  if (segmentsIntersect(a0, a1, b0, b1)) return 0;
  return Math.min(
    pointToSegmentDistance(a0, b0, b1),
    pointToSegmentDistance(a1, b0, b1),
    pointToSegmentDistance(b0, a0, a1),
    pointToSegmentDistance(b1, a0, a1),
  );
}

function objectTouched(
  item: BoardRenderItem,
  rawPath: readonly Vec2[],
  radiusWorld: number,
): boolean {
  const brushPath = normalizePath(rawPath);
  if (brushPath.length === 0) return false;
  const objectPath = worldObjectPath(item);
  if (
    objectPath.closed &&
    brushPath.some((point) => pointInPolygon(point, objectPath.points))
  ) {
    return true;
  }
  if (objectPath.points.length === 1) {
    return distanceToPath(objectPath.points[0]!, brushPath) <= radiusWorld;
  }
  const objectSegments = pathSegments(objectPath.points, objectPath.closed);
  const brushSegments =
    brushPath.length === 1
      ? []
      : pathSegments(brushPath, false);
  if (brushSegments.length === 0) {
    return objectSegments.some(
      ([start, finish]) =>
        pointToSegmentDistance(brushPath[0]!, start, finish) <= radiusWorld,
    );
  }
  return objectSegments.some(([objectStart, objectFinish]) =>
    brushSegments.some(
      ([brushStart, brushFinish]) =>
        segmentDistance(
          objectStart,
          objectFinish,
          brushStart,
          brushFinish,
        ) <= radiusWorld,
    ),
  );
}

export function eraseDocumentObjects(
  document: BoardDocument,
  scene: BoardSceneReadModel,
  path: readonly Vec2[],
  radiusWorld: number,
  createFragmentId: EraserFragmentIdFactory,
): EraserDocumentResult {
  const changes: EraserStrokeChange[] = [];
  const originals: PenStrokeObject[] = [];
  const replacements: PenStrokeObject[] = [];
  const deleted = new Set<BoardObjectId>();

  for (const item of scene.items) {
    const object = item.object;
    if (
      !object.visible ||
      object.locked ||
      object.source.kind !== "user" ||
      !objectTouched(item, path, radiusWorld)
    ) {
      continue;
    }
    const group =
      object.groupId === null ? undefined : document.groups[object.groupId];
    if (group?.locked === true) continue;

    if (object.groupId !== null) {
      for (const memberId of group?.objectIds ?? [object.id]) {
        const member = document.objects[memberId];
        if (
          member !== undefined &&
          member.source.kind === "user" &&
          !member.locked
        ) {
          deleted.add(member.id);
        }
      }
      continue;
    }

    if (object.kind === "drawing.pen-stroke") {
      const fragments = erasePenStroke(
        object,
        path,
        radiusWorld,
        createFragmentId,
      );
      if (fragments === null) continue;
      changes.push({ original: object, replacements: fragments });
      originals.push(object);
      replacements.push(...fragments);
      continue;
    }

    deleted.add(object.id);
  }

  const changedIds = new Set(originals.map(({ id }) => id));
  for (const id of changedIds) deleted.delete(id);
  return {
    changes,
    deletedObjectIds: document.order.filter((id) => deleted.has(id)),
    originals,
    replacements,
    suppressedObjectIds: document.order.filter(
      (id) => deleted.has(id) || changedIds.has(id),
    ),
  };
}
