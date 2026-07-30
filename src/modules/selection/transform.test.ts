import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  reduceBoardDocument,
  type RectangleObject,
} from "../../core/public";
import { createTransformSelectionCommand } from "./commands";

const rectangle: RectangleObject = {
  groupId: null,
  id: boardObjectId("object:rectangle"),
  kind: "drawing.rectangle",
  locked: false,
  position: { x: 20, y: 30 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  size: { height: 60, width: 100 },
  source: { kind: "user" },
  style: { fill: null, opacity: 1, stroke: "#000", strokeWidth: 2 },
  visible: true,
};

describe("createTransformSelectionCommand", () => {
  it("commits position, scale and rotation as an undoable snapshot replacement", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-07-30T12:00:00.000Z",
      id: documentId("document:transform"),
      title: "Transform",
    });
    const added = reduceBoardDocument(empty, {
      actorId: actorId("actor:test"),
      id: commandId("command:add"),
      kind: "core.objects.add",
      objects: [rectangle],
      timestamp: "2026-07-30T12:00:01.000Z",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const command = createTransformSelectionCommand(
      {
        actorId: actorId("actor:test"),
        id: commandId("command:transform"),
        timestamp: "2026-07-30T12:00:02.000Z",
      },
      added.document,
      [
        {
          objectId: rectangle.id,
          position: { x: 70, y: 80 },
          rotation: 375,
          scale: { x: 1.5, y: 0.75 },
        },
      ],
    );

    expect(command.originals).toEqual([rectangle]);
    expect(command.replacements[0]).toMatchObject({
      position: { x: 70, y: 80 },
      rotation: 15,
      scale: { x: 1.5, y: 0.75 },
    });
    const transformed = reduceBoardDocument(added.document, command);
    expect(transformed.ok).toBe(true);
    expect(transformed.document.objects[rectangle.id]).toEqual(
      command.replacements[0],
    );
  });

  it("rejects locked and imported selection targets", () => {
    const document = {
      ...createEmptyBoardDocument({
        createdAt: "2026-07-30T12:00:00.000Z",
        id: documentId("document:locked"),
        title: "Locked",
      }),
      objects: { [rectangle.id]: { ...rectangle, locked: true } },
      order: [rectangle.id],
    };
    expect(() =>
      createTransformSelectionCommand(
        {
          actorId: actorId("actor:test"),
          id: commandId("command:locked"),
          timestamp: "2026-07-30T12:00:01.000Z",
        },
        document,
        [
          {
            objectId: rectangle.id,
            position: rectangle.position,
            rotation: 0,
            scale: rectangle.scale,
          },
        ],
      ),
    ).toThrow("Only unlocked, ungrouped user objects");
  });
});
