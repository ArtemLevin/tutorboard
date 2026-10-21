import { describe, expect, it } from "vitest";
import {
  boardObjectId,
  calculateSolidDihedralAngle,
  createEmptyBoardDocument,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  reprojectSolid3DRecord,
  saveSolidDihedralAngle,
  serializeBoardDocument,
  solid3DId,
  validateSolid3DRecord,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { rebaseSolid3DRecordUpdate } from "../../../../src/modules/solid-3d/public";

function cube(): Solid3DRecord {
  return {
    id: solid3DId("solid:dihedral-test"),
    rootGroupId: groupId("group:dihedral-test"),
    boardObjectIds: [],
    definition: { kind: "cube", edgeLength: 2 },
    projection: defaultSolidProjection,
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
    points: [],
    sections: [],
  };
}

describe("linear angle of a 3D dihedral", () => {
  it("constructs two perpendicular section rays along the common cube edge", () => {
    const result = calculateSolidDihedralAngle(cube().definition, [
      "face:1",
      "face:4",
    ]);
    expect(result?.degrees).toBeCloseTo(90, 8);
    expect(result?.edgeId).toBe("edge:6:7");
    expect(result?.origin).toEqual({ x: 0, y: 1, z: 1 });
    const edge = result!.edge;
    const axis = {
      x: edge[1].x - edge[0].x,
      y: edge[1].y - edge[0].y,
      z: edge[1].z - edge[0].z,
    };
    for (const ray of result!.rays) {
      const dot = axis.x * ray.x + axis.y * ray.y + axis.z * ray.z;
      expect(dot).toBeCloseTo(0, 10);
      expect(Math.hypot(ray.x, ray.y, ray.z)).toBeCloseTo(1, 10);
    }
  });

  it("measures the interior dihedral of a regular tetrahedron", () => {
    const tetra = { kind: "tetrahedron" as const, edgeLength: 2 };
    const result = calculateSolidDihedralAngle(tetra, ["face:0", "face:1"]);
    expect(result?.degrees).toBeCloseTo(70.5287794, 5);
    const reversed = calculateSolidDihedralAngle(tetra, ["face:1", "face:0"]);
    expect(reversed?.degrees).toBeCloseTo(result!.degrees, 10);
  });

  it("rejects nonadjacent, duplicate and unknown faces", () => {
    const definition = cube().definition;
    expect(
      calculateSolidDihedralAngle(definition, ["face:0", "face:1"]),
    ).toBeNull();
    expect(
      calculateSolidDihedralAngle(definition, ["face:1", "face:1"]),
    ).toBeNull();
    expect(
      calculateSolidDihedralAngle(definition, ["face:1", "face:404"]),
    ).toBeNull();
    const base = cube();
    const saved = saveSolidDihedralAngle(
      base,
      ["face:1", "face:4"],
      "solid-dihedral:saved",
    )!;
    expect(
      saveSolidDihedralAngle(
        saved,
        ["face:4", "face:1"],
        "solid-dihedral:duplicate",
      ),
    ).toBeNull();
    expect(
      saveSolidDihedralAngle(
        saved,
        ["face:2", "face:3"],
        "solid-dihedral:saved",
      ),
    ).toBeNull();
    expect(
      validateSolid3DRecord({
        ...base,
        dihedralMeasurements: [
          { id: "solid-dihedral:invalid", faces: ["face:0", "face:1"] },
        ],
      }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
    expect(
      validateSolid3DRecord({
        ...saved,
        dihedralMeasurements: [
          saved.dihedralMeasurements![0]!,
          saved.dihedralMeasurements![0]!,
        ],
      }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
  });

  it("keeps semantic face IDs valid on cuboid resize and correct angle", () => {
    const base = cube();
    const saved = saveSolidDihedralAngle(
      base,
      ["face:1", "face:4"],
      "solid-dihedral:resize",
    )!;
    const resized = reprojectSolid3DRecord(saved, {
      kind: "cuboid",
      size: { x: 5, y: 3, z: 8 },
    });
    expect(resized.dihedralMeasurements).toEqual(saved.dihedralMeasurements);
    expect(
      calculateSolidDihedralAngle(
        resized.definition,
        resized.dihedralMeasurements![0]!.faces,
      )?.degrees,
    ).toBeCloseTo(90, 8);
    expect(validateSolid3DRecord(resized)).toEqual([]);
  });

  it("round-trips the new optional field through strict board serialization", () => {
    const base = cube();
    const saved = saveSolidDihedralAngle(
      base,
      ["face:1", "face:4"],
      "solid-dihedral:persist",
    )!;
    const objectId = boardObjectId("object:dihedral");
    const entity = { ...saved, boardObjectIds: [objectId] };
    const empty = createEmptyBoardDocument({
      id: documentId("document:dihedral"),
      createdAt: "2026-10-21T13:56:00.000Z",
      title: "Dihedral measurements",
    });
    const doc = {
      ...empty,
      groups: {
        [entity.rootGroupId]: {
          id: entity.rootGroupId,
          locked: false,
          objectIds: [objectId],
          transform: identityTransform,
        },
      },
      objects: {
        [objectId]: {
          kind: "drawing.line" as const,
          id: objectId,
          groupId: entity.rootGroupId,
          position: { x: 0, y: 0 },
          end: { x: 2, y: 1 },
          locked: false,
          rotation: 0,
          scale: { x: 1, y: 1 },
          source: { kind: "user" as const },
          style: { fill: null, stroke: "#111827", opacity: 1, strokeWidth: 2 },
          visible: true,
        },
      },
      order: [objectId],
      solidModels: { [entity.id]: entity },
    };
    const serialized = serializeBoardDocument(doc);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") return;
    expect(
      restored.document.solidModels[entity.id]?.dihedralMeasurements,
    ).toEqual(saved.dihedralMeasurements);
    expect(validateSolid3DRecord(base)).toEqual([]);
  });

  it("preserves independent concurrent edits, detects conflicts and invalid geometry", () => {
    const base = cube();
    const remote = saveSolidDihedralAngle(
      base,
      ["face:1", "face:4"],
      "solid-dihedral:remote",
    )!;
    const local = saveSolidDihedralAngle(
      base,
      ["face:1", "face:2"],
      "solid-dihedral:local",
    )!;
    const merged = rebaseSolid3DRecordUpdate({
      starting: base,
      current: remote,
      replacement: local,
    });
    expect(merged.status).toBe("ok");
    if (merged.status === "ok")
      expect(merged.record.dihedralMeasurements?.map(({ id }) => id)).toEqual([
        "solid-dihedral:remote",
        "solid-dihedral:local",
      ]);
    // A concurrent geometry replacement that invalidates the face IDs fails CAS/rebase.
    const conflicting = rebaseSolid3DRecordUpdate({
      starting: base,
      current: { ...base, definition: { kind: "sphere", radius: 2 } },
      replacement: remote,
    });
    expect(conflicting.status).toBe("conflict");
  });
});
