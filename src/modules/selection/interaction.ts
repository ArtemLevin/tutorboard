import type { BoardObjectId, Vec2 } from "../../core/public";

export interface Rect2 {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export type SelectionAreaKind = "lasso" | "marquee";
export type SelectionAreaOperation = "add" | "replace" | "subtract";

interface IdleInteraction {
  readonly kind: "idle";
}

interface DragInteraction {
  readonly current: Vec2;
  readonly kind: "dragging";
  readonly pointerId: number;
  readonly selectedObjectIds: readonly BoardObjectId[];
  readonly start: Vec2;
}

interface MarqueeInteraction {
  readonly baseObjectIds: readonly BoardObjectId[];
  readonly current: Vec2;
  readonly kind: "marquee";
  readonly operation: SelectionAreaOperation;
  readonly pointerId: number;
  readonly start: Vec2;
}

interface LassoInteraction {
  readonly baseObjectIds: readonly BoardObjectId[];
  readonly kind: "lasso";
  readonly operation: SelectionAreaOperation;
  readonly pointerId: number;
  readonly points: readonly Vec2[];
}

export type SelectionInteraction =
  DragInteraction | IdleInteraction | LassoInteraction | MarqueeInteraction;

export interface SelectionState {
  readonly interaction: SelectionInteraction;
  readonly selectedObjectIds: readonly BoardObjectId[];
}

export interface CompletedSelectionMove {
  readonly delta: Vec2;
  readonly objectIds: readonly BoardObjectId[];
}

export type SelectionAction =
  | {
      readonly additive: boolean;
      readonly areaKind?: SelectionAreaKind;
      readonly areaOperation?: SelectionAreaOperation;
      readonly hitObjectIds: readonly BoardObjectId[];
      readonly kind: "start";
      readonly point: Vec2;
      readonly pointerId: number;
    }
  | {
      readonly kind: "move";
      readonly point: Vec2;
      readonly pointerId: number;
    }
  | {
      readonly areaObjectIds?: readonly BoardObjectId[];
      readonly kind: "finish";
      readonly marqueeObjectIds?: readonly BoardObjectId[];
      readonly point: Vec2;
      readonly pointerId: number;
    }
  | {
      readonly kind: "cancel";
      readonly pointerId?: number;
    }
  | {
      readonly kind: "clear";
    }
  | {
      readonly availableObjectIds: readonly BoardObjectId[];
      readonly kind: "prune";
    };

export interface SelectionTransition {
  readonly completedMove: CompletedSelectionMove | null;
  readonly state: SelectionState;
}

export const initialSelectionState: SelectionState = {
  interaction: { kind: "idle" },
  selectedObjectIds: [],
};

const minimumLassoPointDistance = 0.5;
const maximumLassoPoints = 4096;

function unique(values: readonly BoardObjectId[]): readonly BoardObjectId[] {
  return [...new Set(values)];
}

function includesAll(
  selected: readonly BoardObjectId[],
  target: readonly BoardObjectId[],
): boolean {
  const selectedSet = new Set(selected);
  return target.every((id) => selectedSet.has(id));
}

function updateClickSelection(
  selected: readonly BoardObjectId[],
  target: readonly BoardObjectId[],
  additive: boolean,
): readonly BoardObjectId[] {
  if (!additive) {
    return includesAll(selected, target) ? selected : unique(target);
  }

  const selectedSet = new Set(selected);
  if (includesAll(selected, target)) {
    return selected.filter((id) => !target.includes(id));
  }
  return unique([...selected, ...target.filter((id) => !selectedSet.has(id))]);
}

function areaBaseSelection(
  selected: readonly BoardObjectId[],
  operation: SelectionAreaOperation,
): readonly BoardObjectId[] {
  return operation === "replace" ? [] : selected;
}

function applyAreaSelection(
  baseObjectIds: readonly BoardObjectId[],
  areaObjectIds: readonly BoardObjectId[],
  operation: SelectionAreaOperation,
): readonly BoardObjectId[] {
  if (operation === "replace") {
    return unique(areaObjectIds);
  }
  if (operation === "subtract") {
    const removed = new Set(areaObjectIds);
    return baseObjectIds.filter((id) => !removed.has(id));
  }
  return unique([...baseObjectIds, ...areaObjectIds]);
}

function appendLassoPoint(
  points: readonly Vec2[],
  point: Vec2,
): readonly Vec2[] {
  const previous = points.at(-1);
  if (
    previous !== undefined &&
    Math.hypot(point.x - previous.x, point.y - previous.y) <
      minimumLassoPointDistance
  ) {
    return points;
  }
  if (points.length >= maximumLassoPoints) {
    return [...points.slice(0, -1), point];
  }
  return [...points, point];
}

function transition(
  state: SelectionState,
  completedMove: CompletedSelectionMove | null = null,
): SelectionTransition {
  return { completedMove, state };
}

export function normalizeRect(start: Vec2, finish: Vec2): Rect2 {
  return {
    height: Math.abs(finish.y - start.y),
    width: Math.abs(finish.x - start.x),
    x: Math.min(start.x, finish.x),
    y: Math.min(start.y, finish.y),
  };
}

export function getSelectionPreviewDelta(state: SelectionState): Vec2 | null {
  const interaction = state.interaction;
  if (interaction.kind !== "dragging") {
    return null;
  }
  return {
    x: interaction.current.x - interaction.start.x,
    y: interaction.current.y - interaction.start.y,
  };
}

export function getSelectionMarquee(state: SelectionState): Rect2 | null {
  const interaction = state.interaction;
  return interaction.kind === "marquee"
    ? normalizeRect(interaction.start, interaction.current)
    : null;
}

export function getSelectionLasso(
  state: SelectionState,
): readonly Vec2[] | null {
  return state.interaction.kind === "lasso" ? state.interaction.points : null;
}

export function reduceSelectionInteraction(
  state: SelectionState,
  action: SelectionAction,
): SelectionTransition {
  if (action.kind === "clear") {
    return transition(initialSelectionState);
  }

  if (action.kind === "prune") {
    const available = new Set(action.availableObjectIds);
    return transition({
      interaction: { kind: "idle" },
      selectedObjectIds: state.selectedObjectIds.filter((id) =>
        available.has(id),
      ),
    });
  }

  if (action.kind === "cancel") {
    if (
      state.interaction.kind === "idle" ||
      (action.pointerId !== undefined &&
        action.pointerId !== state.interaction.pointerId)
    ) {
      return transition(state);
    }
    return transition({
      interaction: { kind: "idle" },
      selectedObjectIds:
        state.interaction.kind === "marquee" ||
        state.interaction.kind === "lasso"
          ? state.interaction.baseObjectIds
          : state.selectedObjectIds,
    });
  }

  if (action.kind === "start") {
    if (state.interaction.kind !== "idle") {
      return transition(state);
    }

    if (action.hitObjectIds.length === 0) {
      const operation =
        action.areaOperation ?? (action.additive ? "add" : "replace");
      const baseObjectIds = state.selectedObjectIds;
      const selectedObjectIds = areaBaseSelection(
        state.selectedObjectIds,
        operation,
      );
      if (action.areaKind === "lasso") {
        return transition({
          interaction: {
            baseObjectIds,
            kind: "lasso",
            operation,
            pointerId: action.pointerId,
            points: [action.point],
          },
          selectedObjectIds,
        });
      }
      return transition({
        interaction: {
          baseObjectIds,
          current: action.point,
          kind: "marquee",
          operation,
          pointerId: action.pointerId,
          start: action.point,
        },
        selectedObjectIds,
      });
    }

    const selectedObjectIds = updateClickSelection(
      state.selectedObjectIds,
      action.hitObjectIds,
      action.additive,
    );
    return transition({
      interaction: {
        current: action.point,
        kind: "dragging",
        pointerId: action.pointerId,
        selectedObjectIds,
        start: action.point,
      },
      selectedObjectIds,
    });
  }

  const interaction = state.interaction;
  if (
    interaction.kind === "idle" ||
    interaction.pointerId !== action.pointerId
  ) {
    return transition(state);
  }

  if (action.kind === "move") {
    if (interaction.kind === "lasso") {
      return transition({
        ...state,
        interaction: {
          ...interaction,
          points: appendLassoPoint(interaction.points, action.point),
        },
      });
    }
    return transition({
      ...state,
      interaction: { ...interaction, current: action.point },
    });
  }

  if (interaction.kind === "marquee" || interaction.kind === "lasso") {
    const areaObjectIds = action.areaObjectIds ?? action.marqueeObjectIds ?? [];
    return transition({
      interaction: { kind: "idle" },
      selectedObjectIds: applyAreaSelection(
        interaction.baseObjectIds,
        areaObjectIds,
        interaction.operation,
      ),
    });
  }

  const delta = {
    x: action.point.x - interaction.start.x,
    y: action.point.y - interaction.start.y,
  };
  return transition(
    {
      interaction: { kind: "idle" },
      selectedObjectIds: state.selectedObjectIds,
    },
    delta.x === 0 && delta.y === 0
      ? null
      : { delta, objectIds: interaction.selectedObjectIds },
  );
}
