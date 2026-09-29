import {
  createVectorInkData,
  resolveVectorInkData,
  type BoardObject,
  type BoardObjectId,
  type PenStrokeObject,
  type VectorInkSample,
  type Vec2,
} from "../../core/public";

const maximumEraserPathPoints = 4096;
const maximumSegmentSubdivisions = 64;
const boundaryRefinementSteps = 10;
const pointEpsilon = 1e-6;

export const eraserRadiusPx = 12;

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
