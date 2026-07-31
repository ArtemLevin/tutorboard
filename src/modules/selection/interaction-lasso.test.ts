import { describe, expect, it } from "vitest";

import { boardObjectId } from "../../core/public";
import {
  getSelectionLasso,
  initialSelectionState,
  reduceSelectionInteraction,
  type SelectionState,
} from "./interaction";

const first = boardObjectId("object:first");
const second = boardObjectId("object:second");
const third = boardObjectId("object:third");

function selected(...selectedObjectIds: readonly (typeof first)[]): SelectionState {
  return { interaction: { kind: "idle" }, selectedObjectIds };
}

function drawLasso(
  state: SelectionState,
  operation: "add" | "replace" | "subtract",
  areaObjectIds: readonly (typeof first)[],
) {
  let transition = reduceSelectionInteraction(state, {
    additive: operation === "add",
    areaKind: "lasso",
    areaOperation: operation,
    hitObjectIds: [],
    kind: "start",
    point: { x: 0, y: 0 },
    pointerId: 7,
  });
  transition = reduceSelectionInteraction(transition.state, {
    kind: "move",
    point: { x: 20, y: 0 },
    pointerId: 7,
  });
  transition = reduceSelectionInteraction(transition.state, {
    kind: "move",
    point: { x: 20, y: 20 },
    pointerId: 7,
  });
  return reduceSelectionInteraction(transition.state, {
    areaObjectIds,
    kind: "finish",
    point: { x: 0, y: 20 },
    pointerId: 7,
  }).state;
}

describe("lasso selection interaction", () => {
  it("records a bounded freeform path", () => {
    let state = reduceSelectionInteraction(initialSelectionState, {
      additive: false,
      areaKind: "lasso",
      areaOperation: "replace",
      hitObjectIds: [],
      kind: "start",
      point: { x: 1, y: 2 },
      pointerId: 11,
    }).state;
    state = reduceSelectionInteraction(state, {
      kind: "move",
      point: { x: 1.1, y: 2.1 },
      pointerId: 11,
    }).state;
    state = reduceSelectionInteraction(state, {
      kind: "move",
      point: { x: 4, y: 5 },
      pointerId: 11,
    }).state;

    expect(getSelectionLasso(state)).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 5 },
    ]);
  });

  it("replaces, adds and subtracts area results", () => {
    expect(drawLasso(selected(second), "replace", [first])).toEqual(
      selected(first),
    );
    expect(drawLasso(selected(second), "add", [first, third])).toEqual(
      selected(second, first, third),
    );
    expect(
      drawLasso(selected(first, second, third), "subtract", [second]),
    ).toEqual(selected(first, third));
  });

  it("restores the previous selection when cancelled", () => {
    const base = selected(first, second);
    const started = reduceSelectionInteraction(base, {
      additive: false,
      areaKind: "lasso",
      areaOperation: "replace",
      hitObjectIds: [],
      kind: "start",
      point: { x: 0, y: 0 },
      pointerId: 9,
    }).state;
    const cancelled = reduceSelectionInteraction(started, {
      kind: "cancel",
      pointerId: 9,
    }).state;

    expect(cancelled).toEqual(base);
  });
});
