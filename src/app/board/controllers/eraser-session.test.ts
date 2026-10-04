import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  createVectorInkData,
  documentId,
  groupId,
  identityTransform,
  type BoardDocument,
  type BoardObject,
  type PenStrokeObject,
  type VectorInkSample,
} from "../../../core/public";
import {
  advanceEraserGesture,
  createEraserGestureSession,
  reconcileEraserGesture,
} from "./eraser-session";

const timestamp = "2026-10-04T10:00:00.000Z";
const strokeStyle = {
  fill: null,
  opacity: 1,
  stroke: "#111827",
  strokeWidth: 3,
} as const;

function rectangle(
  id: string,
  x: number,
  y: number,
  width = 40,
  height = 40,
  group: ReturnType<typeof groupId> | null = null,
): Extract<BoardObject, { kind: "drawing.rectangle" }> {
  return {
    groupId: group,
    id: boardObjectId(id),
    kind: "drawing.rectangle",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height, width },
    source: { kind: "user" },
    style: { ...strokeStyle, fill: "#ffffff" },
    visible: true,
  };
}

function penStroke(id = "object:pen"): PenStrokeObject {
  const samples: readonly VectorInkSample[] = Array.from(
    { length: 11 },
    (_value, index) => ({
      point: { x: index * 10, y: 0 },
      pressure: 0.4 + index * 0.02,
      timestampMs: index * 8,
    }),
  );
  return {
    groupId: null,
    id: boardObjectId(id),
    ink: createVectorInkData(samples),
    kind: "drawing.pen-stroke",
    locked: false,
    points: samples.map(({ point }) => point),
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: strokeStyle,
    visible: true,
  };
}

function documentWith(
  objects: readonly BoardObject[],
  groups: BoardDocument["groups"] = {},
): BoardDocument {
  const empty = createEmptyBoardDocument({
    createdAt: timestamp,
    id: documentId("document:eraser-session"),
    title: "Eraser session",
  });
  return {
    ...empty,
    groups,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
  };
}

describe("incremental eraser gesture session", () => {
  it("keeps existing fragment IDs stable while later segments split survivors", () => {
    const original = penStroke();
    const document = documentWith([original]);
    const session = createEraserGestureSession(document, 7, 6);
    let created = 0;
    const createFragmentId = () =>
      boardObjectId(`object:fragment-${++created}`);

    const first = advanceEraserGesture(
      session,
      [{ x: 30, y: 0 }],
      createFragmentId,
    );
    expect(first.hiddenObjectIds).toEqual([original.id]);
    expect(first.replacementObjects.map(({ id }) => id)).toEqual([
      original.id,
      boardObjectId("object:fragment-1"),
    ]);

    const second = advanceEraserGesture(
      session,
      [
        { x: 30, y: 40 },
        { x: 70, y: 40 },
        { x: 70, y: 0 },
      ],
      createFragmentId,
    );
    expect(second.replacementObjects.map(({ id }) => id)).toEqual([
      original.id,
      boardObjectId("object:fragment-1"),
      boardObjectId("object:fragment-2"),
    ]);
    expect(created).toBe(2);
  });

  it("processes every accepted point in a coalesced batch", () => {
    const left = rectangle("object:left", 0, 0);
    const middle = rectangle("object:middle", 80, 0);
    const right = rectangle("object:right", 160, 0);
    const document = documentWith([left, middle, right]);
    const session = createEraserGestureSession(document, 8, 8);

    const preview = advanceEraserGesture(
      session,
      [
        { x: 10, y: 20 },
        { x: 100, y: 20 },
        { x: 180, y: 20 },
      ],
      () => boardObjectId("object:unused-fragment"),
    );

    expect(preview.hiddenObjectIds).toEqual([left.id, middle.id, right.id]);
    expect(session.lastProcessedPoint).toEqual({ x: 180, y: 20 });
  });

  it("drops a stale deletion while preserving other current targets", () => {
    const first = rectangle("object:first", 0, 0);
    const second = rectangle("object:second", 80, 0);
    const baseline = documentWith([first, second]);
    const session = createEraserGestureSession(baseline, 9, 8);

    advanceEraserGesture(
      session,
      [
        { x: 10, y: 20 },
        { x: 100, y: 20 },
      ],
      () => boardObjectId("object:unused-fragment"),
    );

    const current: BoardDocument = {
      ...baseline,
      objects: {
        ...baseline.objects,
        [first.id]: { ...first, position: { x: 300, y: 0 } },
      },
    };
    const plan = reconcileEraserGesture(session, current);

    expect(plan.changes).toEqual([{ original: second, replacements: [] }]);
    expect(plan.affectedObjectIds).toEqual([second.id]);
  });

  it("drops a stale pen replacement after a concurrent edit", () => {
    const original = penStroke();
    const baseline = documentWith([original]);
    const session = createEraserGestureSession(baseline, 10, 6);

    advanceEraserGesture(session, [{ x: 50, y: 0 }], () =>
      boardObjectId("object:fragment"),
    );

    const current: BoardDocument = {
      ...baseline,
      objects: {
        ...baseline.objects,
        [original.id]: {
          ...original,
          style: { ...original.style, stroke: "#ff0000" },
        },
      },
    };

    expect(reconcileEraserGesture(session, current).changes).toEqual([]);
  });

  it("reconciles unchanged groups and rejects concurrently transformed groups", () => {
    const id = groupId("group:eraser");
    const member = rectangle("object:group-member", 20, 20, 50, 50, id);
    const baseline = documentWith([member], {
      [id]: {
        id,
        locked: false,
        objectIds: [member.id],
        transform: identityTransform,
      },
    });
    const session = createEraserGestureSession(baseline, 11, 8);

    advanceEraserGesture(session, [{ x: 40, y: 40 }], () =>
      boardObjectId("object:unused-fragment"),
    );

    const unchanged = reconcileEraserGesture(session, baseline);
    expect(unchanged.groupIds).toEqual([id]);
    expect(unchanged.groupObjectIds).toEqual([member.id]);

    const changed: BoardDocument = {
      ...baseline,
      groups: {
        ...baseline.groups,
        [id]: {
          ...baseline.groups[id]!,
          transform: {
            ...identityTransform,
            translation: { x: 30, y: 0 },
          },
        },
      },
    };
    expect(reconcileEraserGesture(session, changed).groupIds).toEqual([]);
  });

  it("ignores duplicate sub-pixel samples instead of reprocessing them", () => {
    const target = rectangle("object:target", 0, 0);
    const document = documentWith([target]);
    const session = createEraserGestureSession(document, 12, 4);
    let fragmentCalls = 0;

    const first = advanceEraserGesture(session, [{ x: 200, y: 200 }], () => {
      fragmentCalls += 1;
      return boardObjectId("object:unused-fragment");
    });
    const second = advanceEraserGesture(
      session,
      [
        { x: 200.1, y: 200.1 },
        { x: 200.15, y: 200.15 },
      ],
      () => {
        fragmentCalls += 1;
        return boardObjectId("object:unused-fragment");
      },
    );

    expect(second).toEqual(first);
    expect(session.lastProcessedPoint).toEqual({ x: 200, y: 200 });
    expect(fragmentCalls).toBe(0);
  });
});
