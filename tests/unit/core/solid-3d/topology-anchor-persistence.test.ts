import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  canonicalizeTopologyFaceAnchor,
  createEmptyBoardDocument,
  createSolidTopology,
  decodeTopologyFaceAnchorId,
  defaultSolidProjection,
  documentId,
  groupId,
  identityTransform,
  serializeBoardDocument,
  deserializeBoardDocument,
  solid3DId,
  solidPointId,
  type BoardDocument,
  type Solid3DRecord,
} from "../../../../src/core/public";

describe("stable topology anchor persistence", () => {
  it("round-trips the encoded triangle identity through strict board schemas", () => {
    const definition = { edgeLength: 2, kind: "cube" } as const;
    const topology = createSolidTopology(definition)!;
    const placement = canonicalizeTopologyFaceAnchor(
      topology,
      { x: 0.2, y: -0.4, z: -1 },
      1,
    )!;
    const solidId = solid3DId("solid:persistence");
    const rootGroupId = groupId("group:persistence");
    const objectId = boardObjectId("object:persistence");
    const pointId = solidPointId("solid-point:persistence");
    const solid: Solid3DRecord = {
      boardObjectIds: [objectId],
      definition,
      id: solidId,
      points: [
        {
          anchor: placement.anchor,
          id: pointId,
          label: "A",
          position: placement.position,
        },
      ],
      projection: defaultSolidProjection,
      rootGroupId,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "cube" },
    };
    const empty = createEmptyBoardDocument({
      createdAt: "2026-08-09T17:00:00.000Z",
      id: documentId("document:persistence"),
      title: "3D persistence",
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
      solidModels: { [solidId]: solid },
    };

    const serialized = serializeBoardDocument(document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    const anchor = restored.document.solidModels[solidId]!.points[0]!.anchor;
    expect(anchor.kind).toBe("face");
    if (anchor.kind === "face") {
      expect(decodeTopologyFaceAnchorId(anchor.faceId)).toEqual({
        faceId: topology.faces[0]!.id,
        triangleIndex: 1,
      });
      expect(anchor.localCoordinates).toEqual(
        placement.anchor.localCoordinates,
      );
    }
  });
});
