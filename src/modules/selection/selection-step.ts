import type {
  BoardDocument,
  BoardObjectId,
  BoardSceneReadModel,
} from "../../core/public";
import type { SelectionObjectTransform } from "./commands";
import { selectSelectionBounds } from "./geometry";

const minimumObjectScale = 0.05;
const maximumObjectScale = 100;
const epsilon = 1e-9;

/**
 * Scale and rotate a homogeneous, unlocked selection around its visual center.
 * Use one uniform factor for all items, preserving their relative positions
 * and avoiding aspect-ratio distortion when any item reaches a scale limit.
 */
export function createSelectionStepTransforms(
  document: BoardDocument,
  scene: BoardSceneReadModel,
  objectIds: readonly BoardObjectId[],
  scaleFactor: number,
  rotationDelta: number,
): readonly SelectionObjectTransform[] | null {
  if (
    objectIds.length === 0 ||
    new Set(objectIds).size !== objectIds.length ||
    !Number.isFinite(scaleFactor) ||
    scaleFactor <= 0 ||
    !Number.isFinite(rotationDelta)
  ) {
    return null;
  }

  const objects = objectIds.map((id) => document.objects[id]);
  if (
    objects.some(
      (object) =>
        object === undefined ||
        object.locked ||
        object.groupId !== null ||
        object.source.kind !== "user" ||
        object.scale.x <= 0 ||
        object.scale.y <= 0,
    )
  ) {
    return null;
  }

  const bounds = selectSelectionBounds(scene, objectIds);
  if (bounds.length !== objectIds.length) return null;
  const left = Math.min(...bounds.map(({ rect }) => rect.x));
  const top = Math.min(...bounds.map(({ rect }) => rect.y));
  const right = Math.max(...bounds.map(({ rect }) => rect.x + rect.width));
  const bottom = Math.max(...bounds.map(({ rect }) => rect.y + rect.height));
  const pivot = { x: (left + right) / 2, y: (top + bottom) / 2 };

  let minimumFactor = 0;
  let maximumFactor = Infinity;
  for (const object of objects) {
    if (object === undefined) return null;
    for (const scale of [object.scale.x, object.scale.y]) {
      minimumFactor = Math.max(minimumFactor, minimumObjectScale / scale);
      maximumFactor = Math.min(maximumFactor, maximumObjectScale / scale);
    }
  }
  const factor = Math.min(maximumFactor, Math.max(minimumFactor, scaleFactor));
  if (Math.abs(factor - 1) < epsilon && Math.abs(rotationDelta) < epsilon)
    return null;

  const radians = (rotationDelta * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return objects.flatMap((object) => {
    if (object === undefined) return [];
    const dx = (object.position.x - pivot.x) * factor;
    const dy = (object.position.y - pivot.y) * factor;
    return [
      {
        objectId: object.id,
        position: {
          x: pivot.x + dx * cosine - dy * sine,
          y: pivot.y + dx * sine + dy * cosine,
        },
        rotation: object.rotation + rotationDelta,
        scale: {
          x: object.scale.x * factor,
          y: object.scale.y * factor,
        },
      },
    ];
  });
}
