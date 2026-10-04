import {
  selectBoardScene,
  type BoardDocument,
  type BoardObject,
  type BoardObjectId,
  type BoardSceneReadModel,
  type GroupId,
  type PenStrokeObject,
  type Solid3DId,
  type Vec2,
} from "../../../core/public";
import { erasePenStroke } from "../../../modules/eraser/public";
import { selectObjectIdsNearPath } from "../../../modules/selection/public";

const minimumGesturePointDistance = 0.25;

export interface EraserGesturePreview {
  readonly hiddenObjectIds: readonly BoardObjectId[];
  readonly replacementObjects: readonly BoardObject[];
}

interface PenGestureState {
  readonly original: PenStrokeObject;
  fragments: readonly PenStrokeObject[];
}

export interface EraserGestureSession {
  readonly baselineDocument: BoardDocument;
  readonly baselineScene: BoardSceneReadModel;
  readonly deletedGroupIds: Set<GroupId>;
  readonly deletedObjectIds: Set<BoardObjectId>;
  readonly fragmentOwnerById: Map<BoardObjectId, BoardObjectId>;
  readonly hiddenObjectIds: Set<BoardObjectId>;
  lastProcessedPoint: Vec2 | null;
  readonly penStates: Map<BoardObjectId, PenGestureState>;
  readonly pointerId: number;
  readonly radiusWorld: number;
}

export interface EraserGestureCommitPlan {
  readonly affectedObjectIds: readonly BoardObjectId[];
  readonly changes: readonly {
    readonly original: BoardObject;
    readonly replacements: readonly BoardObject[];
  }[];
  readonly groupIds: readonly GroupId[];
  readonly groupObjectIds: readonly BoardObjectId[];
  readonly solidIds: readonly Solid3DId[];
}

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointDistance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        structurallyEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function groupEligible(document: BoardDocument, groupId: GroupId): boolean {
  const group = document.groups[groupId];
  if (group === undefined || group.locked) return false;
  return group.objectIds.every((memberId) => {
    const member = document.objects[memberId];
    return (
      member !== undefined &&
      !member.locked &&
      member.source.kind === "user"
    );
  });
}

function ungroupedEditableObject(
  document: BoardDocument,
  id: BoardObjectId,
): BoardObject | null {
  const object = document.objects[id];
  return object !== undefined &&
    object.source.kind === "user" &&
    !object.locked &&
    object.visible &&
    object.groupId === null
    ? object
    : null;
}

function previewFromSession(
  session: EraserGestureSession,
): EraserGesturePreview {
  return {
    hiddenObjectIds: session.baselineDocument.order.filter((id) =>
      session.hiddenObjectIds.has(id),
    ),
    replacementObjects: session.baselineDocument.order.flatMap((id) => {
      const state = session.penStates.get(id);
      return state === undefined ? [] : [...state.fragments];
    }),
  };
}

function workingScene(session: EraserGestureSession): BoardSceneReadModel {
  const baselineItems = session.baselineScene.items.filter(
    ({ object }) => !session.hiddenObjectIds.has(object.id),
  );
  const replacementItems = [...session.penStates.values()].flatMap(({ fragments }) =>
    fragments.map((object) => ({ object, transforms: [] as const })),
  );
  return {
    viewport: session.baselineScene.viewport,
    items: [...baselineItems, ...replacementItems],
  };
}

function acceptedDelta(
  session: EraserGestureSession,
  rawPoints: readonly Vec2[],
): readonly Vec2[] {
  const accepted: Vec2[] = [];
  let previous = session.lastProcessedPoint;
  for (const point of rawPoints) {
    if (!finitePoint(point)) continue;
    if (
      previous === null ||
      pointDistance(previous, point) > minimumGesturePointDistance
    ) {
      accepted.push(point);
      previous = point;
    }
  }
  if (accepted.length === 0) return [];

  const delta =
    session.lastProcessedPoint === null
      ? accepted
      : [session.lastProcessedPoint, ...accepted];
  session.lastProcessedPoint = accepted.at(-1) ?? session.lastProcessedPoint;
  return delta;
}

function removeFragmentOwners(
  session: EraserGestureSession,
  fragments: readonly PenStrokeObject[],
): void {
  for (const fragment of fragments) {
    session.fragmentOwnerById.delete(fragment.id);
  }
}

function registerFragmentOwners(
  session: EraserGestureSession,
  ownerId: BoardObjectId,
  fragments: readonly PenStrokeObject[],
): void {
  for (const fragment of fragments) {
    session.fragmentOwnerById.set(fragment.id, ownerId);
  }
}

export function createEraserGestureSession(
  document: BoardDocument,
  pointerId: number,
  radiusWorld: number,
): EraserGestureSession {
  if (!Number.isFinite(radiusWorld) || radiusWorld <= 0) {
    throw new RangeError("Eraser gesture radius must be positive and finite.");
  }
  return {
    baselineDocument: document,
    baselineScene: selectBoardScene(document),
    deletedGroupIds: new Set(),
    deletedObjectIds: new Set(),
    fragmentOwnerById: new Map(),
    hiddenObjectIds: new Set(),
    lastProcessedPoint: null,
    penStates: new Map(),
    pointerId,
    radiusWorld,
  };
}

export function advanceEraserGesture(
  session: EraserGestureSession,
  rawPoints: readonly Vec2[],
  createFragmentId: () => BoardObjectId,
): EraserGesturePreview {
  const delta = acceptedDelta(session, rawPoints);
  if (delta.length === 0) return previewFromSession(session);

  const scene = workingScene(session);
  const hitIds = selectObjectIdsNearPath(scene, delta, session.radiusWorld);
  if (hitIds.length === 0) return previewFromSession(session);

  for (const id of hitIds) {
    const baselineObject = session.baselineDocument.objects[id];
    if (
      baselineObject === undefined ||
      baselineObject.groupId === null ||
      baselineObject.source.kind !== "user" ||
      baselineObject.locked ||
      !baselineObject.visible ||
      !groupEligible(session.baselineDocument, baselineObject.groupId)
    ) {
      continue;
    }
    const group = session.baselineDocument.groups[baselineObject.groupId];
    if (group === undefined) continue;
    session.deletedGroupIds.add(group.id);
    for (const memberId of group.objectIds) {
      session.hiddenObjectIds.add(memberId);
    }
  }

  const hitSet = new Set(hitIds);
  const penOwners = new Set<BoardObjectId>();

  for (const id of hitIds) {
    const fragmentOwner = session.fragmentOwnerById.get(id);
    if (fragmentOwner !== undefined) {
      penOwners.add(fragmentOwner);
      continue;
    }

    const object = ungroupedEditableObject(session.baselineDocument, id);
    if (object === null || session.hiddenObjectIds.has(id)) continue;

    if (object.kind === "drawing.pen-stroke") {
      penOwners.add(object.id);
      continue;
    }

    session.deletedObjectIds.add(object.id);
    session.hiddenObjectIds.add(object.id);
  }

  for (const ownerId of penOwners) {
    const original = session.baselineDocument.objects[ownerId];
    if (
      original === undefined ||
      original.kind !== "drawing.pen-stroke" ||
      original.groupId !== null ||
      original.source.kind !== "user" ||
      original.locked ||
      !original.visible
    ) {
      continue;
    }

    const existing = session.penStates.get(ownerId);
    const fragments = existing?.fragments ?? [original];
    let touched = false;
    const nextFragments: PenStrokeObject[] = [];

    for (const fragment of fragments) {
      const fragmentHit =
        hitSet.has(fragment.id) ||
        (existing === undefined && fragment.id === ownerId && hitSet.has(ownerId));
      if (!fragmentHit) {
        nextFragments.push(fragment);
        continue;
      }
      const replacements = erasePenStroke(
        fragment,
        delta,
        session.radiusWorld,
        (source, fragmentIndex) =>
          fragmentIndex === 0 ? source.id : createFragmentId(),
      );
      if (replacements === null) {
        nextFragments.push(fragment);
        continue;
      }
      touched = true;
      nextFragments.push(...replacements);
    }

    if (!touched) continue;
    removeFragmentOwners(session, fragments);
    registerFragmentOwners(session, ownerId, nextFragments);
    session.penStates.set(ownerId, {
      original,
      fragments: nextFragments,
    });
    session.hiddenObjectIds.add(ownerId);
  }

  return previewFromSession(session);
}

function relatedSolidRecords(
  document: BoardDocument,
  groupId: GroupId,
): readonly NonNullable<BoardDocument["solidModels"][Solid3DId]>[] {
  return Object.values(document.solidModels).flatMap((record) =>
    record !== undefined && record.rootGroupId === groupId ? [record] : [],
  );
}

function groupStillMatchesBaseline(
  session: EraserGestureSession,
  current: BoardDocument,
  groupId: GroupId,
): boolean {
  const baselineGroup = session.baselineDocument.groups[groupId];
  const currentGroup = current.groups[groupId];
  if (
    baselineGroup === undefined ||
    currentGroup === undefined ||
    !structurallyEqual(baselineGroup, currentGroup) ||
    !groupEligible(current, groupId)
  ) {
    return false;
  }

  for (const memberId of baselineGroup.objectIds) {
    if (
      !structurallyEqual(
        session.baselineDocument.objects[memberId],
        current.objects[memberId],
      )
    ) {
      return false;
    }
  }

  return structurallyEqual(
    relatedSolidRecords(session.baselineDocument, groupId),
    relatedSolidRecords(current, groupId),
  );
}

export function reconcileEraserGesture(
  session: EraserGestureSession,
  current: BoardDocument,
): EraserGestureCommitPlan {
  const changes: {
    readonly original: BoardObject;
    readonly replacements: readonly BoardObject[];
  }[] = [];

  for (const id of session.baselineDocument.order) {
    const penState = session.penStates.get(id);
    if (penState !== undefined) {
      const currentObject = current.objects[id];
      if (
        currentObject !== undefined &&
        structurallyEqual(currentObject, penState.original) &&
        ungroupedEditableObject(current, id) !== null
      ) {
        changes.push({
          original: currentObject,
          replacements: penState.fragments,
        });
      }
      continue;
    }

    if (!session.deletedObjectIds.has(id)) continue;
    const baselineObject = session.baselineDocument.objects[id];
    const currentObject = current.objects[id];
    if (
      baselineObject !== undefined &&
      currentObject !== undefined &&
      structurallyEqual(currentObject, baselineObject) &&
      ungroupedEditableObject(current, id) !== null
    ) {
      changes.push({ original: currentObject, replacements: [] });
    }
  }

  const groupIds = [...session.deletedGroupIds].filter((groupId) =>
    groupStillMatchesBaseline(session, current, groupId),
  );
  const groupObjectIds = groupIds.flatMap(
    (groupId) => current.groups[groupId]?.objectIds ?? [],
  );
  const solidIds = Object.values(current.solidModels).flatMap((solid) =>
    solid !== undefined && groupIds.includes(solid.rootGroupId)
      ? [solid.id]
      : [],
  );

  const affectedObjectIds = [
    ...changes.map(({ original }) => original.id),
    ...groupObjectIds,
  ];

  return {
    affectedObjectIds,
    changes,
    groupIds,
    groupObjectIds,
    solidIds,
  };
}

export function currentEraserGesturePreview(
  session: EraserGestureSession,
): EraserGesturePreview {
  return previewFromSession(session);
}
