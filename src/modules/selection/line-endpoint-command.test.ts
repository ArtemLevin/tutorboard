import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  groupId,
  identityTransform,
  reduceBoardDocument,
  type LineObject,
} from "../../core/public";
import { createLineEndpointTransformCommand } from "./commands";

const line: LineObject = {
  end: { x: 120, y: 0 },
  groupId: groupId("group:line"),
  id: boardObjectId("object:line"),
  kind: "drawing.line",
  locked: false,
  position: { x: 20, y: 30 },
  rotation: 10,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: { fill: null, opacity: 1, stroke: "#111", strokeWidth: 2 },
  visible: true,
};

function groupedDocument() {
  const base = createEmptyBoardDocument({
    createdAt: "2026-10-04T14:00:00.000Z",
    id: documentId("document:line-endpoint"),
    title: "Line endpoint",
  });
  return {
    ...base,
    groups: {
      [groupId("group:line")]: {
        id: groupId("group:line"),
        locked: false,
        objectIds: [line.id],
        transform: identityTransform,
      },
    },
    objects: { [line.id]: line },
    order: [line.id],
  };
}

describe("line endpoint transform command", () => {
  it("updates only transform fields for an unlocked grouped user line", () => {
    const document = groupedDocument();
    const command = createLineEndpointTransformCommand(
      {
        actorId: actorId("actor:test"),
        id: commandId("command:line-endpoint"),
        timestamp: "2026-10-04T14:01:00.000Z",
      },
      document,
      {
        objectId: line.id,
        position: { x: 44, y: 55 },
        rotation: 91,
        scale: { x: 1.25, y: 1.25 },
      },
      { object: line, transforms: [identityTransform] },
    );

    expect(command.replacements[0]).toMatchObject({
      end: line.end,
      groupId: line.groupId,
      id: line.id,
      position: { x: 44, y: 55 },
      rotation: 91,
      scale: { x: 1.25, y: 1.25 },
    });
    const result = reduceBoardDocument(document, command);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.groups[line.groupId!]?.objectIds).toEqual([line.id]);
    expect(result.document.objects[line.id]).toEqual(command.replacements[0]);
  });

  it("rejects grouped replacements that mutate line geometry or membership", () => {
    const document = groupedDocument();
    const metadata = {
      actorId: actorId("actor:test"),
      id: commandId("command:malformed"),
      timestamp: "2026-10-04T14:01:00.000Z",
    };
    const geometryMutation = reduceBoardDocument(document, {
      ...metadata,
      kind: "core.objects.replace",
      originals: [line],
      replacements: [{ ...line, end: { x: 240, y: 0 } }],
    });
    expect(geometryMutation.ok).toBe(false);

    const membershipMutation = reduceBoardDocument(document, {
      ...metadata,
      id: commandId("command:membership"),
      kind: "core.objects.replace",
      originals: [line],
      replacements: [{ ...line, groupId: null }],
    });
    expect(membershipMutation.ok).toBe(false);
  });

  it("rejects endpoint transforms when the line or containing group is locked", () => {
    const document = groupedDocument();
    expect(() =>
      createLineEndpointTransformCommand(
        {
          actorId: actorId("actor:test"),
          id: commandId("command:locked-line"),
          timestamp: "2026-10-04T14:01:00.000Z",
        },
        {
          ...document,
          objects: { [line.id]: { ...line, locked: true } },
        },
        {
          objectId: line.id,
          position: line.position,
          rotation: 45,
          scale: line.scale,
        },
        { object: line, transforms: [identityTransform] },
      ),
    ).toThrow("Locked lines");

    expect(() =>
      createLineEndpointTransformCommand(
        {
          actorId: actorId("actor:test"),
          id: commandId("command:locked-group"),
          timestamp: "2026-10-04T14:01:00.000Z",
        },
        {
          ...document,
          groups: {
            [groupId("group:line")]: {
              ...document.groups[groupId("group:line")]!,
              locked: true,
            },
          },
        },
        {
          objectId: line.id,
          position: line.position,
          rotation: 45,
          scale: line.scale,
        },
        { object: line, transforms: [identityTransform] },
      ),
    ).toThrow("Locked groups");
  });

  it("rejects stale object and parent-transform baselines", () => {
    const document = groupedDocument();
    const metadata = {
      actorId: actorId("actor:test"),
      id: commandId("command:stale-line"),
      timestamp: "2026-10-04T14:02:00.000Z",
    };
    const staleObjectDocument = {
      ...document,
      objects: {
        [line.id]: {
          ...line,
          position: { x: line.position.x + 12, y: line.position.y },
        },
      },
    };
    const staleObjectCommand = createLineEndpointTransformCommand(
      metadata,
      staleObjectDocument,
      {
        objectId: line.id,
        position: { x: 44, y: 55 },
        rotation: 91,
        scale: { x: 1.25, y: 1.25 },
      },
      { object: line, transforms: [identityTransform] },
    );
    const staleObjectResult = reduceBoardDocument(
      staleObjectDocument,
      staleObjectCommand,
    );
    expect(staleObjectResult.ok).toBe(false);

    const changedParentDocument = {
      ...document,
      groups: {
        [groupId("group:line")]: {
          ...document.groups[groupId("group:line")]!,
          transform: {
            ...identityTransform,
            rotation: 15,
          },
        },
      },
    };
    expect(() =>
      createLineEndpointTransformCommand(
        {
          ...metadata,
          id: commandId("command:stale-parent"),
        },
        changedParentDocument,
        {
          objectId: line.id,
          position: { x: 44, y: 55 },
          rotation: 91,
          scale: { x: 1.25, y: 1.25 },
        },
        { object: line, transforms: [identityTransform] },
      ),
    ).toThrow("baseline is stale");
  });
});
