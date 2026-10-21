import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  calculateSolidDistance,
  createEmptyBoardDocument,
  createSolidTopology,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  reprojectSolid3DRecord,
  saveSolidDistance,
  serializeBoardDocument,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DRecord,
  type SolidDistanceEndpoint,
} from "../../../../src/core/public";
import { rebaseSolid3DRecordUpdate } from "../../../../src/modules/solid-3d/public";

function cube(): Solid3DRecord {
  return {
    id: solid3DId("solid:measurement-unit"),
    rootGroupId: groupId("group:measurement-unit"),
    boardObjectIds: [],
    definition: { kind: "cube", edgeLength: 2 },
    projection: defaultSolidProjection,
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
    points: [],
    sections: [],
  };
}
function vertex(index: number): SolidDistanceEndpoint {
  return {
    kind: "vertex",
    id: createSolidTopology(cube().definition)!.vertices[index]!.id,
  };
}

describe("semantic 3D point distance measurements", () => {
  it("measures a cube edge and recomputes automatically when resizing", () => {
    const record = cube();
    const topology = createSolidTopology(record.definition)!;
    const edge = topology.edges[0]!;
    const first: SolidDistanceEndpoint = {
      kind: "vertex",
      id: edge.startVertexId,
    };
    const second: SolidDistanceEndpoint = {
      kind: "vertex",
      id: edge.endVertexId,
    };
    const saved = saveSolidDistance(
      record,
      first,
      second,
      "solid-distance:edge",
    )!;
    expect(calculateSolidDistance(saved, first, second)).toBeCloseTo(2);
    const resized = reprojectSolid3DRecord(saved, {
      kind: "cube",
      edgeLength: 5,
    });
    expect(calculateSolidDistance(resized, first, second)).toBeCloseTo(5);
    expect(resized.measurements).toEqual(saved.measurements);
    expect(validateSolid3DRecord(resized)).toEqual([]);
  });

  it("follows semantic point anchors and rejects dangling and duplicate measurements", () => {
    const starting = cube();
    const topology = createSolidTopology(starting.definition)!;
    const p = topology.vertices[0]!;
    const q = topology.vertices[1]!;
    const record: Solid3DRecord = {
      ...starting,
      points: [
        {
          id: solidPointId("solid-point:measurement"),
          anchor: { kind: "vertex", vertexId: p.id },
          position: p.position,
          label: "M",
        },
      ],
    };
    const first: SolidDistanceEndpoint = {
      kind: "point",
      id: record.points[0]!.id,
    };
    const second: SolidDistanceEndpoint = { kind: "vertex", id: q.id };
    const saved = saveSolidDistance(record, first, second, "solid-distance:m")!;
    expect(calculateSolidDistance(saved, first, second)).toBeCloseTo(2);
    expect(
      saveSolidDistance(saved, second, first, "solid-distance:duplicate"),
    ).toBeNull();
    expect(
      saveSolidDistance(saved, first, first, "solid-distance:same"),
    ).toBeNull();
    expect(
      validateSolid3DRecord({ ...saved, points: [] }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
    const moved: Solid3DRecord = {
      ...saved,
      points: [
        { ...saved.points[0]!, anchor: { kind: "vertex", vertexId: q.id } },
      ],
    };
    expect(calculateSolidDistance(moved, first, second)).toBe(0);
  });

  it("round-trips optional saved measurements through current board schema", () => {
    const record = cube();
    const edge = createSolidTopology(record.definition)!.edges[0]!;
    const measured = saveSolidDistance(
      record,
      { kind: "vertex", id: edge.startVertexId },
      { kind: "vertex", id: edge.endVertexId },
      "solid-distance:persist",
    )!;
    const objectId = boardObjectId("object:measurement");
    const group = {
      id: measured.rootGroupId,
      locked: false,
      objectIds: [objectId],
      transform: identityTransform,
    };
    const base = createEmptyBoardDocument({
      id: documentId("document:measurement"),
      createdAt: "2026-10-21T07:00:00.000Z",
      title: "3D measurement",
    });
    const doc = {
      ...base,
      groups: { [group.id]: group },
      objects: {
        [objectId]: {
          kind: "drawing.line" as const,
          id: objectId,
          groupId: group.id,
          position: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
          locked: false,
          rotation: 0,
          scale: { x: 1, y: 1 },
          source: { kind: "user" as const },
          style: { fill: null, stroke: "#111827", opacity: 1, strokeWidth: 2 },
          visible: true,
        },
      },
      order: [objectId],
      solidModels: {
        [measured.id]: { ...measured, boardObjectIds: [objectId] },
      },
    };
    const serialized = serializeBoardDocument(doc);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    expect(restored.document.solidModels[measured.id]?.measurements).toEqual(
      measured.measurements,
    );
    expect(validateSolid3DRecord(cube())).toEqual([]);
  });

  it("merges independent distance additions while retaining remote points", () => {
    const starting = cube();
    const remote = saveSolidDistance(
      starting,
      vertex(0),
      vertex(1),
      "solid-distance:remote",
    )!;
    const local = saveSolidDistance(
      starting,
      vertex(2),
      vertex(3),
      "solid-distance:local",
    )!;
    const merged = rebaseSolid3DRecordUpdate({
      starting,
      current: remote,
      replacement: local,
    });
    expect(merged.status).toBe("ok");
    if (merged.status === "ok") {
      expect(merged.record.measurements?.map(({ id }) => id)).toEqual([
        "solid-distance:remote",
        "solid-distance:local",
      ]);
    }
  });

  it("rejects concurrent deletion of a measurement endpoint", () => {
    const starting = cube();
    const topology = createSolidTopology(starting.definition)!;
    const firstPoint = topology.vertices[0]!;
    const record: Solid3DRecord = {
      ...starting,
      points: [
        {
          id: solidPointId("solid-point:dependent"),
          label: "A",
          anchor: { kind: "vertex", vertexId: firstPoint.id },
          position: firstPoint.position,
        },
      ],
    };
    const local = saveSolidDistance(
      record,
      { kind: "point", id: record.points[0]!.id },
      vertex(2),
      "solid-distance:local",
    )!;
    expect(
      rebaseSolid3DRecordUpdate({
        starting: record,
        current: { ...record, points: [] },
        replacement: local,
      }).status,
    ).toBe("conflict");
  });
});
