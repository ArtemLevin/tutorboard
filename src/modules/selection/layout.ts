import type {
  BoardDocument,
  BoardObjectId,
  BoardSceneReadModel,
  Vec2,
} from "../../core/public";
import { resolveSelectionTargets, selectionIsLocked } from "./commands";
import { selectSelectionBounds } from "./geometry";
import type { Rect2 } from "./interaction";

export type SelectionLayoutAction =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom"
  | "horizontal"
  | "vertical";

export interface SelectionLayoutMove {
  readonly objectIds: readonly BoardObjectId[];
  readonly delta: Vec2;
}

interface LayoutUnit {
  readonly objectIds: readonly BoardObjectId[];
  readonly rect: Rect2;
  readonly key: string;
}

function unionBounds(rects: readonly Rect2[]): Rect2 | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(right) &&
    Number.isFinite(bottom)
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

export function selectionLayoutCapabilities(
  document: BoardDocument,
  selectedObjectIds: readonly BoardObjectId[],
): { readonly canAlign: boolean; readonly canDistribute: boolean } {
  const unavailable = { canAlign: false, canDistribute: false };
  if (
    selectedObjectIds.length === 0 ||
    selectedObjectIds.some((id) => document.objects[id] === undefined) ||
    selectionIsLocked(document, selectedObjectIds)
  ) {
    return unavailable;
  }
  const targets = resolveSelectionTargets(document, selectedObjectIds);
  if (
    targets.objectIds.some(
      (id) => document.objects[id]?.source.kind !== "user",
    ) ||
    targets.groupIds.some((id) => document.groups[id] === undefined)
  ) {
    return unavailable;
  }
  const count = targets.objectIds.length + targets.groupIds.length;
  return { canAlign: count >= 2, canDistribute: count >= 3 };
}

/**
 * Layout uses rendered, rotation-aware bounds. Each group is a single unit;
 * each resulting move goes through the existing command authority.
 * Callers commit all moves as one transaction/undo entry.
 */
export function planSelectionLayout(
  document: BoardDocument,
  scene: BoardSceneReadModel,
  selectedObjectIds: readonly BoardObjectId[],
  action: SelectionLayoutAction,
): readonly SelectionLayoutMove[] | null {
  const capabilities = selectionLayoutCapabilities(document, selectedObjectIds);
  const distribution = action === "horizontal" || action === "vertical";
  if (distribution ? !capabilities.canDistribute : !capabilities.canAlign)
    return null;

  const targets = resolveSelectionTargets(document, selectedObjectIds);
  const members = [
    ...targets.objectIds,
    ...targets.groupIds.flatMap((id) => document.groups[id]?.objectIds ?? []),
  ];
  const uniqueMembers = [...new Set(members)];
  const bounds = selectSelectionBounds(scene, uniqueMembers);
  if (bounds.length !== uniqueMembers.length) return null;

  const rectangles = new Map(bounds.map(({ id, rect }) => [id, rect]));
  const units: LayoutUnit[] = [];
  for (const id of targets.objectIds) {
    const rect = rectangles.get(id);
    if (rect === undefined) return null;
    units.push({ key: id, objectIds: [id], rect });
  }
  for (const id of targets.groupIds) {
    const group = document.groups[id];
    if (group === undefined) return null;
    const groupRects = group.objectIds.map((memberId) =>
      rectangles.get(memberId),
    );
    if (groupRects.some((rect) => rect === undefined)) return null;
    const rect = unionBounds(groupRects.filter((rect) => rect !== undefined));
    if (rect === null) return null;
    units.push({ key: id, objectIds: [group.objectIds[0]!], rect });
  }

  const total = unionBounds(units.map((unit) => unit.rect));
  if (total === null) return null;
  const moves: SelectionLayoutMove[] = [];
  const pushMove = (unit: LayoutUnit, delta: Vec2) => {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;
    if (Math.abs(delta.x) <= 1e-7 && Math.abs(delta.y) <= 1e-7) return;
    moves.push({ objectIds: unit.objectIds, delta });
  };

  if (distribution) {
    const horizontal = action === "horizontal";
    const axis = horizontal ? "x" : "y";
    const extent = horizontal ? "width" : "height";
    const sorted = [...units].sort(
      (a, b) => a.rect[axis] - b.rect[axis] || a.key.localeCompare(b.key),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const middle = sorted.slice(1, -1);
    const innerSizes = middle.reduce((sum, unit) => sum + unit.rect[extent], 0);
    const gap =
      (last.rect[axis] -
        (first.rect[axis] + first.rect[extent]) -
        innerSizes) /
      (sorted.length - 1);
    let position = first.rect[axis] + first.rect[extent] + gap;
    for (const unit of middle) {
      const delta = position - unit.rect[axis];
      pushMove(unit, horizontal ? { x: delta, y: 0 } : { x: 0, y: delta });
      position += unit.rect[extent] + gap;
    }
    return moves;
  }

  for (const unit of units) {
    const { rect } = unit;
    let delta: Vec2;
    switch (action) {
      case "left":
        delta = { x: total.x - rect.x, y: 0 };
        break;
      case "center-x":
        delta = {
          x: total.x + total.width / 2 - (rect.x + rect.width / 2),
          y: 0,
        };
        break;
      case "right":
        delta = {
          x: total.x + total.width - (rect.x + rect.width),
          y: 0,
        };
        break;
      case "top":
        delta = { x: 0, y: total.y - rect.y };
        break;
      case "center-y":
        delta = {
          x: 0,
          y: total.y + total.height / 2 - (rect.y + rect.height / 2),
        };
        break;
      case "bottom":
        delta = {
          x: 0,
          y: total.y + total.height - (rect.y + rect.height),
        };
        break;
    }
    pushMove(unit, delta);
  }
  return moves;
}
