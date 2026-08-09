import { describe, expect, it } from "vitest";

import {
  createEmptyBoardDocument,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  regularBase,
  serializeBoardDocument,
  solid3DId,
  type BoardDocument,
  type Solid3DDefinition,
  type Solid3DRecord,
} from "../../../../src/core/public";

const definitions: readonly Solid3DDefinition[] = [
  { kind: "hemisphere", radius: 1.4 },
  { edgeLength: 2.5, kind: "octahedron" },
  { edgeLength: 2, kind: "regular-polyhedron", variant: "dodecahedron" },
  { edgeLength: 2, kind: "regular-polyhedron", variant: "icosahedron" },
  {
    bottomBase: regularBase(5, 1.4),
    height: 2.8,
    kind: "truncated-pyramid",
    topBase: regularBase(5, 0.7),
  },
];

describe("expanded semantic solid persistence", () => {
  it("round-trips every Construction Studio solid through strict board/v1 validation", () => {
    const empty = createEmptyBoardDocument({
      createdAt: "2026-08-09T18:20:00.000Z",
      id: documentId("document:semantic-solids"),
      title: "Expanded semantic solids",
    });
    const groups: BoardDocument["groups"] = {};
    const solidModels: BoardDocument["solidModels"] = {};

    definitions.forEach((definition, index) => {
      const id = solid3DId(`solid:semantic:${String(index)}`);
      const rootGroupId = groupId(`group:semantic:${String(index)}`);
      groups[rootGroupId] = {
        id: rootGroupId,
        locked: false,
        objectIds: [],
        transform: identityTransform,
      };
      solidModels[id] = {
        boardObjectIds: [],
        definition,
        id,
        points: [],
        projection: defaultSolidProjection,
        rootGroupId,
        schemaVersion: "1.0",
        sections: [],
        source: { kind: "text-template", templateId: definition.kind },
      } satisfies Solid3DRecord;
    });

    const document: BoardDocument = {
      ...empty,
      groups,
      solidModels,
    };
    const serialized = serializeBoardDocument(document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    expect(Object.values(restored.document.solidModels)).toHaveLength(
      definitions.length,
    );
    expect(
      Object.values(restored.document.solidModels).map(
        (record) => record?.definition.kind,
      ),
    ).toEqual(definitions.map(({ kind }) => kind));
  });
});
