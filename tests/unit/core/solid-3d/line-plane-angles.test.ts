import { describe, expect, it } from "vitest";
import {
  boardObjectId,
  calculateSolidLinePlaneAngle,
  createEmptyBoardDocument,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  reprojectSolid3DRecord,
  saveSolidLinePlaneAngle,
  serializeBoardDocument,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DRecord,
  type SolidAngleLine,
} from "../../../../src/core/public";
import { rebaseSolid3DRecordUpdate } from "../../../../src/modules/solid-3d/public";

const vertex = (number: number) => ({
  kind: "vertex" as const,
  id: `vertex:${number}`,
});
const line = (first: number, second: number): SolidAngleLine => [
  vertex(first),
  vertex(second),
];
function cube(): Solid3DRecord {
  return {
    id: solid3DId("solid:line-plane-test"),
    rootGroupId: groupId("group:line-plane-test"),
    boardObjectIds: [],
    definition: { kind: "cube", edgeLength: 2 },
    projection: defaultSolidProjection,
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
    points: [],
    sections: [],
  };
}

describe("line angle to a supporting 3D face plane", () => {
  it("calculates 0° for parallel lines and 90° for perpendicular lines", () => {
    const model = cube();
    const parallel = calculateSolidLinePlaneAngle(model, line(0, 1), "face:1");
    const perpendicular = calculateSolidLinePlaneAngle(
      model,
      line(0, 4),
      "face:1",
    );
    expect(parallel?.degrees).toBeCloseTo(0);
    expect(perpendicular?.degrees).toBeCloseTo(90);
    expect(parallel?.projectedDirection).not.toBeNull();
    expect(perpendicular?.projectedDirection).toBeNull();
    // The foot is on the infinite plane even though the line starts at z=-1.
    expect(parallel?.foot.z).toBeCloseTo(1);
    expect(perpendicular?.foot.z).toBeCloseTo(1);
  });

  it("handles inclined lines without orientation sensitivity", () => {
    const model = cube();
    const first = calculateSolidLinePlaneAngle(model, line(0, 6), "face:1");
    const reversed = calculateSolidLinePlaneAngle(model, line(6, 0), "face:1");
    expect(first?.degrees).toBeCloseTo(35.2643897, 5);
    expect(reversed?.degrees).toBeCloseTo(first!.degrees, 8);
    expect(first!.degrees).toBeGreaterThan(0);
    expect(first!.degrees).toBeLessThan(90);
  });

  it("dynamically updates after nonuniform resize and point-anchor movement", () => {
    const initial = cube();
    const saved = saveSolidLinePlaneAngle(
      initial,
      line(0, 5),
      "face:1",
      "solid-line-plane:dynamic",
    )!;
    expect(
      calculateSolidLinePlaneAngle(
        saved,
        saved.linePlaneMeasurements![0]!.line,
        "face:1",
      )?.degrees,
    ).toBeCloseTo(45);
    const resized = reprojectSolid3DRecord(saved, {
      kind: "cuboid",
      size: { x: 6, y: 2, z: 4 },
    });
    expect(
      calculateSolidLinePlaneAngle(
        resized,
        saved.linePlaneMeasurements![0]!.line,
        "face:1",
      )?.degrees,
    ).toBeCloseTo(33.6900675, 5);
    expect(validateSolid3DRecord(resized)).toEqual([]);
    const withPoint: Solid3DRecord = {
      ...initial,
      points: [
        {
          id: solidPointId("solid-point:line-plane"),
          label: "P",
          position: { x: -1, y: -1, z: -1 },
          anchor: { kind: "vertex", vertexId: "vertex:0" },
        },
      ],
    };
    const fromPoint: SolidAngleLine = [
      { kind: "point", id: withPoint.points[0]!.id },
      vertex(5),
    ];
    const started = calculateSolidLinePlaneAngle(
      withPoint,
      fromPoint,
      "face:1",
    );
    expect(started?.degrees).toBeCloseTo(45);
    const moved: Solid3DRecord = {
      ...withPoint,
      points: [
        {
          ...withPoint.points[0]!,
          anchor: {
            kind: "vertex",
            vertexId: "vertex:4",
          },
        },
      ],
    };
    expect(
      calculateSolidLinePlaneAngle(moved, fromPoint, "face:1")?.degrees,
    ).toBeCloseTo(0);
  });

  it("rejects invalid and duplicate references and leaves legacy documents valid", () => {
    const initial = cube();
    expect(
      calculateSolidLinePlaneAngle(initial, line(0, 1), "face:404"),
    ).toBeNull();
    expect(
      calculateSolidLinePlaneAngle(initial, line(0, 0), "face:1"),
    ).toBeNull();
    const saved = saveSolidLinePlaneAngle(
      initial,
      line(0, 1),
      "face:1",
      "solid-line-plane:saved",
    )!;
    expect(
      saveSolidLinePlaneAngle(
        saved,
        line(1, 0),
        "face:1",
        "solid-line-plane:duplicate",
      ),
    ).toBeNull();
    expect(
      validateSolid3DRecord({
        ...saved,
        linePlaneMeasurements: [
          {
            id: "solid-line-plane:invalid",
            line: line(0, 1),
            faceId: "face:404",
          },
        ],
      }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
    expect(
      validateSolid3DRecord({
        ...saved,
        linePlaneMeasurements: [
          saved.linePlaneMeasurements![0]!,
          saved.linePlaneMeasurements![0]!,
        ],
      }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
    expect(validateSolid3DRecord(initial)).toEqual([]);
  });

  it("round-trips measured line planes in strict board/v1 serialization", () => {
    const initial = cube();
    const saved = saveSolidLinePlaneAngle(
      initial,
      line(0, 5),
      "face:1",
      "solid-line-plane:persist",
    )!;
    const objectId = boardObjectId("object:line-plane");
    const entity = { ...saved, boardObjectIds: [objectId] };
    const empty = createEmptyBoardDocument({
      id: documentId("document:line-plane"),
      createdAt: "2026-10-21T12:49:00.000Z",
      title: "Line plane angles",
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
    const result = deserializeBoardDocument(serialized.json);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(
      result.document.solidModels[entity.id]?.linePlaneMeasurements,
    ).toEqual(saved.linePlaneMeasurements);
  });

  it("merges independent concurrent measurements and prevents dangling point references", () => {
    const starting = cube();
    const remote = saveSolidLinePlaneAngle(
      starting,
      line(0, 1),
      "face:1",
      "solid-line-plane:remote",
    )!;
    const local = saveSolidLinePlaneAngle(
      starting,
      line(0, 4),
      "face:0",
      "solid-line-plane:local",
    )!;
    const merged = rebaseSolid3DRecordUpdate({
      starting,
      current: remote,
      replacement: local,
    });
    expect(merged.status).toBe("ok");
    if (merged.status === "ok") {
      expect(merged.record.linePlaneMeasurements?.map(({ id }) => id)).toEqual([
        "solid-line-plane:remote",
        "solid-line-plane:local",
      ]);
    }
    const point = {
      id: solidPointId("solid-point:dependent-line-plane"),
      label: "M",
      position: { x: -1, y: -1, z: -1 },
      anchor: { kind: "vertex" as const, vertexId: "vertex:0" },
    };
    const withPoint = { ...starting, points: [point] };
    const dependent = saveSolidLinePlaneAngle(
      withPoint,
      [{ kind: "point", id: point.id }, vertex(5)],
      "face:1",
      "solid-line-plane:dependent",
    )!;
    expect(
      rebaseSolid3DRecordUpdate({
        starting: withPoint,
        current: { ...withPoint, points: [] },
        replacement: dependent,
      }).status,
    ).toBe("conflict");
  });
});
