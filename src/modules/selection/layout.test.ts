import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  geometryImportId,
  groupId,
  reduceBoardDocument,
  type BoardDocument,
  type BoardGroup,
  type BoardObjectId,
  type BoardSceneReadModel,
  type GroupId,
  type RectangleObject,
} from "../../core/public";
import { planSelectionLayout, selectionLayoutCapabilities } from "./layout";
import { createMoveSelectionCommand } from "./commands";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#000",
  strokeWidth: 2,
} as const;

function rectangle(
  name: string,
  x: number,
  y: number,
  group: GroupId | null = null,
): RectangleObject {
  return {
    groupId: group,
    id: boardObjectId(`object:${name}`),
    kind: "drawing.rectangle",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { width: 20, height: 20 },
    source: { kind: "user" },
    style,
    visible: true,
  };
}

function fixture(
  objects: readonly RectangleObject[],
  groups: readonly BoardGroup[] = [],
): { readonly document: BoardDocument; readonly scene: BoardSceneReadModel } {
  const original = createEmptyBoardDocument({
    createdAt: "2026-10-12T12:00:00.000Z",
    id: documentId("document:layout"),
    title: "Layout",
  });
  const document: BoardDocument = {
    ...original,
    groups: Object.fromEntries(groups.map((group) => [group.id, group])),
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
  };
  const scene: BoardSceneReadModel = {
    items: objects.map((object) => ({
      object,
      transforms:
        object.groupId === null
          ? []
          : [document.groups[object.groupId]!.transform],
    })),
    viewport: document.viewport,
  };
  return { document, scene };
}

describe("QoL 2.4 selection layout", () => {
  it("aligns by rendered edge while preserving document order and object metadata", () => {
    const a = rectangle("a", 0, 0);
    const b = rectangle("b", 100, 50);
    const { document, scene } = fixture([a, b]);
    const plan = planSelectionLayout(document, scene, [a.id, b.id], "left");
    expect(plan).toEqual([{ objectIds: [b.id], delta: { x: -100, y: 0 } }]);
    const command = createMoveSelectionCommand(
      {
        actorId: actorId("actor:layout"),
        id: commandId("command:layout"),
        timestamp: "2026-10-12T12:00:01.000Z",
      },
      document,
      plan![0]!.objectIds,
      plan![0]!.delta,
    );
    const result = reduceBoardDocument(document, command);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.order).toEqual([a.id, b.id]);
    expect(result.document.objects[b.id]).toEqual({
      ...b,
      position: { x: 0, y: 50 },
    });
  });

  it("distributes three different objects with equal edge gaps", () => {
    const a = rectangle("a", 0, 10);
    const b = rectangle("b", 120, 10);
    const c = rectangle("c", 300, 10);
    const { document, scene } = fixture([a, b, c]);
    expect(
      planSelectionLayout(document, scene, [a.id, b.id, c.id], "horizontal"),
    ).toEqual([{ objectIds: [b.id], delta: { x: 30, y: 0 } }]);
    expect(
      planSelectionLayout(document, scene, [a.id, b.id], "horizontal"),
    ).toBeNull();
    expect(
      planSelectionLayout(document, scene, [a.id, b.id, c.id], "vertical"),
    ).toEqual([]);
  });

  it("treats a rotated group as one atomic layout unit", () => {
    const id = groupId("group:rotated");
    const first = rectangle("first", 0, 0, id);
    const second = rectangle("second", 40, 0, id);
    const other = rectangle("other", 500, 90);
    const group: BoardGroup = {
      id,
      locked: false,
      objectIds: [first.id, second.id],
      transform: {
        rotation: 90,
        scale: { x: 1, y: 1 },
        translation: { x: 200, y: 100 },
      },
    };
    const { document, scene } = fixture([first, second, other], [group]);
    const plan = planSelectionLayout(
      document,
      scene,
      [first.id, second.id, other.id],
      "left",
    );
    expect(plan).not.toBeNull();
    expect(plan?.length).toBe(1);
    expect(plan?.[0]?.objectIds).toEqual([other.id]);
    expect(plan?.[0]?.delta.x).toBeLessThan(0);

    const right = planSelectionLayout(
      document,
      scene,
      [first.id, second.id, other.id],
      "right",
    );
    expect(right).toHaveLength(1);
    expect(right?.[0]?.objectIds).toEqual([first.id]);
    const groupMove = createMoveSelectionCommand(
      {
        actorId: actorId("actor:layout"),
        id: commandId("command:group-layout"),
        timestamp: "2026-10-12T12:00:01.000Z",
      },
      document,
      right![0]!.objectIds,
      right![0]!.delta,
    );
    const moved = reduceBoardDocument(document, groupMove);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.document.groups[id]?.transform.translation.x).toBeGreaterThan(
        200,
      );
      expect(moved.document.objects[first.id]?.position).toEqual(
        first.position,
      );
    }
    expect(
      selectionLayoutCapabilities(document, [first.id, second.id]),
    ).toEqual({ canAlign: false, canDistribute: false });
  });

  it("disables layout for locked targets, imported individuals and missing scene bounds", () => {
    const a = rectangle("a", 0, 0);
    const b = rectangle("b", 100, 0);
    const { document, scene } = fixture([a, b]);
    const locked = {
      ...document,
      objects: { ...document.objects, [b.id]: { ...b, locked: true } },
    };
    expect(selectionLayoutCapabilities(locked, [a.id, b.id]).canAlign).toBe(
      false,
    );
    expect(planSelectionLayout(locked, scene, [a.id, b.id], "left")).toBeNull();
    expect(
      planSelectionLayout(
        document,
        { ...scene, items: scene.items.slice(0, 1) },
        [a.id, b.id],
        "left",
      ),
    ).toBeNull();
    const imported: BoardDocument = {
      ...document,
      objects: {
        ...document.objects,
        [b.id]: {
          ...b,
          source: {
            kind: "geometryos",
            girEntityId: "entity:foreign",
            girEntityType: "point",
            importId: geometryImportId("import:foreign"),
          },
        },
      },
    };
    expect(selectionLayoutCapabilities(imported, [a.id, b.id]).canAlign).toBe(
      false,
    );
    expect(
      planSelectionLayout(
        document,
        scene,
        [] as readonly BoardObjectId[],
        "left",
      ),
    ).toBeNull();
  });
});
