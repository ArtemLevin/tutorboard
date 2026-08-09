import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  serializeBoardDocument,
  solid3DEulerDegreesFromQuaternion,
  solid3DId,
  solid3DModelQuaternion,
  withSolid3DModelEulerDegrees,
  type BoardDocument,
  type Solid3DRecord,
} from "../../../../src/core/public";

const rootGroupId = groupId("group:model-transform-persistence");
const objectId = boardObjectId("object:model-transform-persistence");
const solidId = solid3DId("solid:model-transform-persistence");

const baseRecord: Solid3DRecord = {
  boardObjectIds: [objectId],
  definition: { edgeLength: 2, kind: "cube" },
  id: solidId,
  points: [],
  projection: defaultSolidProjection,
  rootGroupId,
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
};

describe("persistent solid model rotation serialization", () => {
  it("round-trips quaternion slots through strict board/v1 persistence", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-08-09T18:45:00.000Z",
      id: documentId("document:model-transform-persistence"),
      title: "Persistent model rotation",
    });
    const rotated = withSolid3DModelEulerDegrees(baseRecord, {
      x: 27,
      y: -31,
      z: 14,
    });
    const document: BoardDocument = {
      ...empty,
      groups: {
        [rootGroupId]: {
          id: rootGroupId,
          locked: false,
          objectIds: [objectId],
          transform: identityTransform,
        },
      },
      objects: {
        [objectId]: {
          end: { x: 1, y: 1 },
          groupId: rootGroupId,
          id: objectId,
          kind: "drawing.line",
          locked: false,
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          source: { kind: "user" },
          style: {
            fill: null,
            opacity: 1,
            stroke: "#111827",
            strokeWidth: 2,
          },
          visible: true,
        },
      },
      order: [objectId],
      solidModels: { [solidId]: rotated },
    };

    const serialized = serializeBoardDocument(document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    const restoredRecord = restored.document.solidModels[solidId];
    expect(restoredRecord).toBeDefined();
    if (restoredRecord === undefined) return;
    expect(restoredRecord.projection.matrix).toHaveLength(10);
    const euler = solid3DEulerDegreesFromQuaternion(
      solid3DModelQuaternion(restoredRecord),
    );
    expect(euler.x).toBeCloseTo(27, 8);
    expect(euler.y).toBeCloseTo(-31, 8);
    expect(euler.z).toBeCloseTo(14, 8);
  });
});
