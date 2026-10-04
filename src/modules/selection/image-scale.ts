import type {
  BoardDocument,
  BoardObject,
  BoardObjectId,
  Vec2,
} from "../../core/public";
import type { SelectionObjectTransform } from "./commands";

export type ImageScaleStepDirection = "decrease" | "increase";

const imageScaleStep = 0.5;
const minimumImageScale = 0.5;
const maximumImageScale = 100;
const scaleEpsilon = 1e-9;

type ResizableMediaObject = Extract<
  BoardObject,
  { kind: "image.embedded" | "media.asset" }
>;

function rotate(point: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function representativeScale(object: ResizableMediaObject): number {
  return Math.sqrt(object.scale.x * object.scale.y);
}

export function nextImageScaleStep(
  current: number,
  direction: ImageScaleStepDirection,
): number {
  if (!Number.isFinite(current) || current <= 0) {
    throw new RangeError("Image scale must be finite and positive.");
  }

  if (direction === "increase") {
    const next =
      (Math.floor((current + scaleEpsilon) / imageScaleStep) + 1) *
      imageScaleStep;
    return Math.min(maximumImageScale, next);
  }

  const next =
    (Math.ceil((current - scaleEpsilon) / imageScaleStep) - 1) * imageScaleStep;
  return Math.max(minimumImageScale, next);
}

function imageCenter(object: ResizableMediaObject): Vec2 {
  const localCenter = {
    x: (object.size.width * object.scale.x) / 2,
    y: (object.size.height * object.scale.y) / 2,
  };
  const offset = rotate(localCenter, object.rotation);
  return {
    x: object.position.x + offset.x,
    y: object.position.y + offset.y,
  };
}

function transformForScaleStep(
  object: ResizableMediaObject,
  direction: ImageScaleStepDirection,
): SelectionObjectTransform | null {
  const current = representativeScale(object);
  const target = nextImageScaleStep(current, direction);
  if (Math.abs(target - current) <= scaleEpsilon) return null;

  const factor = target / current;
  const scale = {
    x: object.scale.x * factor,
    y: object.scale.y * factor,
  };
  const center = imageCenter(object);
  const nextCenterOffset = rotate(
    {
      x: (object.size.width * scale.x) / 2,
      y: (object.size.height * scale.y) / 2,
    },
    object.rotation,
  );

  return {
    objectId: object.id,
    position: {
      x: center.x - nextCenterOffset.x,
      y: center.y - nextCenterOffset.y,
    },
    rotation: object.rotation,
    scale,
  };
}

export function createImageScaleStepTransforms(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
  direction: ImageScaleStepDirection,
): readonly SelectionObjectTransform[] | null {
  if (objectIds.length === 0) return null;

  const objects = objectIds.map((objectId) => document.objects[objectId]);
  if (
    objects.some(
      (object) =>
        object === undefined ||
        (object.kind !== "image.embedded" && object.kind !== "media.asset") ||
        object.locked ||
        object.groupId !== null ||
        object.source.kind !== "user",
    )
  ) {
    return null;
  }

  const transforms = objects.flatMap((object) => {
    if (
      object === undefined ||
      (object.kind !== "image.embedded" && object.kind !== "media.asset")
    ) {
      return [];
    }
    const transform = transformForScaleStep(object, direction);
    return transform === null ? [] : [transform];
  });

  return transforms.length === 0 ? null : transforms;
}
