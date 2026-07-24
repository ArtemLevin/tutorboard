import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  groupId,
  identityTransform,
  reduceBoardDocument,
  selectBoardScene,
  svgSanitizerPolicyVersion,
  type SvgObject,
} from "../../../../src/core/public";
import {
  createMoveSelectionCommand,
  createSetSelectionLockCommand,
  expandSelectionObjectIds,
  getSelectionMarquee,
  getSelectionPreviewDelta,
  initialSelectionState,
  reduceSelectionInteraction,
  selectObjectIdsInRect,
  selectSelectionBounds,
} from "../../../../src/modules/selection/public";
import { emptyDocument, metadata, rectangle } from "../../core/helpers";

describe("selection interaction", () => {
  it("supports click, additive click and toggle without serializing selection", () => {
    const first = reduceSelectionInteraction(initialSelectionState, {
      additive: false,
      hitObjectIds: [boardObjectId("object:one")],
      kind: "start",
      point: { x: 10, y: 20 },
      pointerId: 1,
    });
    const firstFinished = reduceSelectionInteraction(first.state, {
      kind: "finish",
      point: { x: 10, y: 20 },
      pointerId: 1,
    });
    const second = reduceSelectionInteraction(firstFinished.state, {
      additive: true,
      hitObjectIds: [boardObjectId("object:two")],
      kind: "start",
      point: { x: 30, y: 40 },
      pointerId: 2,
    });
    const secondFinished = reduceSelectionInteraction(second.state, {
      kind: "finish",
      point: { x: 30, y: 40 },
      pointerId: 2,
    });

    expect(secondFinished.state.selectedObjectIds).toEqual([
      "object:one",
      "object:two",
    ]);

    const toggled = reduceSelectionInteraction(secondFinished.state, {
      additive: true,
      hitObjectIds: [boardObjectId("object:one")],
      kind: "start",
      point: { x: 10, y: 20 },
      pointerId: 3,
    });
    expect(toggled.state.selectedObjectIds).toEqual(["object:two"]);
  });

  it("keeps drag and marquee previews runtime-only and cancel-safe", () => {
    const dragging = reduceSelectionInteraction(initialSelectionState, {
      additive: false,
      hitObjectIds: [boardObjectId("object:one")],
      kind: "start",
      point: { x: 10, y: 20 },
      pointerId: 1,
    });
    const moved = reduceSelectionInteraction(dragging.state, {
      kind: "move",
      point: { x: 35, y: 12 },
      pointerId: 1,
    });
    expect(getSelectionPreviewDelta(moved.state)).toEqual({ x: 25, y: -8 });

    const completed = reduceSelectionInteraction(moved.state, {
      kind: "finish",
      point: { x: 35, y: 12 },
      pointerId: 1,
    });
    expect(completed.completedMove).toEqual({
      delta: { x: 25, y: -8 },
      objectIds: ["object:one"],
    });
    expect(completed.state.interaction.kind).toBe("idle");

    const marquee = reduceSelectionInteraction(completed.state, {
      additive: false,
      hitObjectIds: [],
      kind: "start",
      point: { x: 80, y: 60 },
      pointerId: 2,
    });
    const resized = reduceSelectionInteraction(marquee.state, {
      kind: "move",
      point: { x: 20, y: 10 },
      pointerId: 2,
    });
    expect(getSelectionMarquee(resized.state)).toEqual({
      height: 50,
      width: 60,
      x: 20,
      y: 10,
    });

    const cancelled = reduceSelectionInteraction(resized.state, {
      kind: "cancel",
      pointerId: 2,
    });
    expect(cancelled.state).toEqual(initialSelectionState);
    expect(cancelled.completedMove).toBeNull();
  });
});

describe("selection geometry and commands", () => {
  it("selects intersecting objects in world coordinates independently of zoom", () => {
    const one = rectangle("one", { x: 10, y: 20 });
    const two = rectangle("two", { x: 400, y: 300 });
    const document = {
      ...emptyDocument(),
      objects: { [one.id]: one, [two.id]: two },
      order: [one.id, two.id],
      viewport: { offset: { x: 900, y: -300 }, zoom: 4 },
    };
    const scene = selectBoardScene(document);

    expect(
      selectObjectIdsInRect(scene, {
        height: 100,
        width: 140,
        x: 0,
        y: 0,
      }),
    ).toEqual(["object:one"]);
    expect(selectSelectionBounds(scene, [one.id])).toEqual([
      {
        id: one.id,
        rect: { height: 82, width: 122, x: 9, y: 19 },
      },
    ]);
  });

  it("uses stored SVG dimensions for selection bounds", () => {
    const svg: SvgObject = {
      groupId: null,
      id: boardObjectId("object:svg"),
      kind: "svg-import.svg",
      locked: false,
      position: { x: 20, y: 30 },
      rotation: 0,
      sanitizedSvg:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>',
      sanitizerPolicyVersion: svgSanitizerPolicyVersion,
      scale: { x: 1, y: 1 },
      size: { height: 100, width: 200 },
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
      viewBox: { height: 100, width: 200, x: 0, y: 0 },
      visible: true,
    };
    const document = {
      ...emptyDocument(),
      objects: { [svg.id]: svg },
      order: [svg.id],
    };

    expect(selectSelectionBounds(selectBoardScene(document), [svg.id])).toEqual(
      [{ id: svg.id, rect: { height: 100, width: 200, x: 20, y: 30 } }],
    );
  });

  it("expands a group and creates one mixed-target movement command", () => {
    const one = rectangle("one", { group: "group:pair", x: 10 });
    const two = rectangle("two", { group: "group:pair", x: 30 });
    const free = rectangle("free", { x: 90 });
    const document = {
      ...emptyDocument(),
      objects: { [one.id]: one, [two.id]: two, [free.id]: free },
      order: [one.id, two.id, free.id],
      groups: {
        [groupId("group:pair")]: {
          id: groupId("group:pair"),
          locked: false,
          objectIds: [one.id, two.id],
          transform: identityTransform,
        },
      },
    };

    expect(expandSelectionObjectIds(document, [one.id, free.id])).toEqual([
      one.id,
      two.id,
      free.id,
    ]);
    expect(
      createMoveSelectionCommand(
        metadata("selection-move"),
        document,
        [one.id, two.id, free.id],
        { x: 12, y: -4 },
      ),
    ).toMatchObject({
      delta: { x: 12, y: -4 },
      groupIds: ["group:pair"],
      kind: "core.selection.move",
      objectIds: ["object:free"],
    });
    expect(
      createSetSelectionLockCommand(
        metadata("selection-lock"),
        document,
        [one.id, two.id, free.id],
        true,
      ),
    ).toMatchObject({
      groupIds: ["group:pair"],
      kind: "core.selection.set-lock",
      locked: true,
      objectIds: ["object:free"],
    });
  });

  it("moves independent objects and groups atomically through the reducer", () => {
    const member = rectangle("member", { group: "group:pair", x: 10 });
    const free = rectangle("free", { x: 90 });
    const document = {
      ...emptyDocument(),
      objects: { [member.id]: member, [free.id]: free },
      order: [member.id, free.id],
      groups: {
        [groupId("group:pair")]: {
          id: groupId("group:pair"),
          locked: false,
          objectIds: [member.id],
          transform: identityTransform,
        },
      },
    };
    const result = reduceBoardDocument(
      document,
      createMoveSelectionCommand(
        metadata("mixed-move"),
        document,
        [member.id, free.id],
        { x: 15, y: -5 },
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.objects[free.id]?.position).toEqual({
        x: 105,
        y: -5,
      });
      expect(
        result.document.groups[groupId("group:pair")]?.transform.translation,
      ).toEqual({ x: 15, y: -5 });
      expect(result.document.objects[member.id]?.position).toEqual({
        x: 10,
        y: 0,
      });
    }
  });

  it("locks the normalized selection and rejects movement without mutation", () => {
    const member = rectangle("member", { group: "group:pair" });
    const free = rectangle("free");
    const document = {
      ...emptyDocument(),
      objects: { [member.id]: member, [free.id]: free },
      order: [member.id, free.id],
      groups: {
        [groupId("group:pair")]: {
          id: groupId("group:pair"),
          locked: false,
          objectIds: [member.id],
          transform: identityTransform,
        },
      },
    };
    const locked = reduceBoardDocument(
      document,
      createSetSelectionLockCommand(
        metadata("lock", "2026-07-24T12:01:00.000Z"),
        document,
        [member.id, free.id],
        true,
      ),
    );
    expect(locked.ok).toBe(true);
    if (!locked.ok) {
      return;
    }
    expect(locked.document.groups[groupId("group:pair")]?.locked).toBe(true);
    expect(locked.document.objects[member.id]?.locked).toBe(true);
    expect(locked.document.objects[free.id]?.locked).toBe(true);

    const moved = reduceBoardDocument(
      locked.document,
      createMoveSelectionCommand(
        metadata("locked-move", "2026-07-24T12:02:00.000Z"),
        locked.document,
        [member.id, free.id],
        { x: 10, y: 10 },
      ),
    );
    expect(moved.ok).toBe(false);
    expect(moved.document).toBe(locked.document);
    if (!moved.ok) {
      expect(moved.error.code).toBe("command.locked");
    }

    const malformed = reduceBoardDocument(document, {
      ...metadata("malformed-grouped-move"),
      delta: { x: 1, y: 1 },
      groupIds: [],
      kind: "core.selection.move",
      objectIds: [member.id],
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.document).toBe(document);
    if (!malformed.ok) {
      expect(malformed.error.code).toBe("command.invalid");
    }
  });
});
