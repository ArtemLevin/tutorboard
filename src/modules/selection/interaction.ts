import type { BoardObjectId, Vec2 } from "../../core/public";

export interface Rect2 {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

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
  readonly additive: boolean;
  readonly baseObjectIds: readonly BoardObjectId[];
  readonly current: Vec2;
  readonly kind: "marquee";
  readonly pointerId: number;
  readonly start: Vec2;
}

export type SelectionInteraction =
  DragInteraction | IdleInteraction | MarqueeInteraction;

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
        state.interaction.kind === "marquee"
          ? state.interaction.baseObjectIds
          : state.selectedObjectIds,
    });
  }

  if (action.kind === "start") {
    if (state.interaction.kind !== "idle") {
      return transition(state);
    }

    if (action.hitObjectIds.length === 0) {
      const baseObjectIds = action.additive ? state.selectedObjectIds : [];
      return transition({
        interaction: {
          additive: action.additive,
          baseObjectIds,
          current: action.point,
          kind: "marquee",
          pointerId: action.pointerId,
          start: action.point,
        },
        selectedObjectIds: baseObjectIds,
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
    return transition({
      ...state,
      interaction: { ...interaction, current: action.point },
    });
  }

  if (interaction.kind === "marquee") {
    const areaObjectIds = action.marqueeObjectIds ?? [];
    return transition({
      interaction: { kind: "idle" },
      selectedObjectIds: unique([
        ...interaction.baseObjectIds,
        ...areaObjectIds,
      ]),
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
