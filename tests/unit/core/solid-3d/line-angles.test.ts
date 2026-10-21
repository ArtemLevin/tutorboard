import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  calculateSolidLineAngle,
  createEmptyBoardDocument,
  defaultSolidProjection,
  deserializeBoardDocument,
  documentId,
  groupId,
  identityTransform,
  reprojectSolid3DRecord,
  saveSolidLineAngle,
  serializeBoardDocument,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DRecord,
  type SolidAngleLine,
} from "../../../../src/core/public";
import { rebaseSolid3DRecordUpdate } from "../../../../src/modules/solid-3d/public";

const v = (index: number) => ({
  kind: "vertex" as const,
  id: `vertex:${index}`,
});
const line = (first: number, second: number): SolidAngleLine => [
  v(first),
  v(second),
];
const lines = (a: SolidAngleLine, b: SolidAngleLine) => [a, b] as const;

function record(): Solid3DRecord {
  return {
    id: solid3DId("solid:angle-test"),
    rootGroupId: groupId("group:angle-test"),
    boardObjectIds: [],
    definition: { kind: "cube", edgeLength: 2 },
    projection: defaultSolidProjection,
    points: [],
    sections: [],
    schemaVersion: "1.0",
    source: { kind: "text-template", templateId: "cube" },
  };
}

describe("3D angles between infinite lines", () => {
  it("measures perpendicular and parallel lines, including disjoint/skew ones", () => {
    const cube = record();
    expect(
      calculateSolidLineAngle(cube, lines(line(0, 1), line(0, 3)))?.degrees,
    ).toBeCloseTo(90);
    // x direction and an equal disjoint x direction.
    expect(
      calculateSolidLineAngle(cube, lines(line(0, 1), line(4, 5)))?.degrees,
    ).toBeCloseTo(0);
    // x and z directions, with distinct bases that never meet.
    expect(
      calculateSolidLineAngle(cube, lines(line(0, 1), line(3, 7)))?.degrees,
    ).toBeCloseTo(90);
    const reversed = calculateSolidLineAngle(
      cube,
      lines(line(1, 0), line(7, 3)),
    );
    expect(reversed?.degrees).toBeCloseTo(90);
  });

  it("always chooses the smaller orientation-independent angle", () => {
    const cube = record();
    const forward = calculateSolidLineAngle(
      cube,
      lines(line(0, 6), line(0, 1)),
    );
    const backward = calculateSolidLineAngle(
      cube,
      lines(line(6, 0), line(1, 0)),
    );
    expect(forward?.degrees).toBeCloseTo(54.7356103, 5);
    expect(backward?.degrees).toBeCloseTo(forward!.degrees);
    expect(forward!.degrees).toBeGreaterThanOrEqual(0);
    expect(forward!.degrees).toBeLessThanOrEqual(90);
  });

  it("rejects degenerate lines, stale endpoints, and repeated selection", () => {
    const cube = record();
    expect(
      calculateSolidLineAngle(cube, lines(line(0, 0), line(0, 1))),
    ).toBeNull();
    expect(
      calculateSolidLineAngle(cube, lines(line(0, 99), line(0, 1))),
    ).toBeNull();
    const created = saveSolidLineAngle(
      cube,
      lines(line(0, 1), line(0, 3)),
      "solid-angle:first",
    )!;
    expect(created.angleMeasurements).toHaveLength(1);
    expect(
      saveSolidLineAngle(
        created,
        lines(line(3, 0), line(1, 0)),
        "solid-angle:dup",
      ),
    ).toBeNull();
    expect(
      validateSolid3DRecord({
        ...created,
        angleMeasurements: [
          {
            id: "solid-angle:bad",
            lines: lines(line(0, 0), line(0, 3)),
          },
        ],
      }).map(({ code }) => code),
    ).toContain("solid.invalid-reference");
  });

  it("recalculates an angle after a nonuniform resize", () => {
    const cube = record();
    const source = saveSolidLineAngle(
      cube,
      lines(line(0, 5), line(0, 1)),
      "solid-angle:dynamic",
    )!;
    expect(
      calculateSolidLineAngle(source, source.angleMeasurements![0]!.lines)
        ?.degrees,
    ).toBeCloseTo(45);
    const updated = reprojectSolid3DRecord(source, {
      kind: "cuboid",
      size: { x: 6, y: 2, z: 4 },
    });
    expect(
      calculateSolidLineAngle(updated, updated.angleMeasurements![0]!.lines)
        ?.degrees,
    ).toBeCloseTo(33.6900675, 5);
    expect(validateSolid3DRecord(updated)).toEqual([]);
  });

  it("serializes angle measurements without breaking documents without angles", () => {
    const base = record();
    const measured = saveSolidLineAngle(
      base,
      lines(line(0, 1), line(3, 7)),
      "solid-angle:stored",
    )!;
    const objectId = boardObjectId("object:angle-test");
    const entity = { ...measured, boardObjectIds: [objectId] };
    const empty = createEmptyBoardDocument({
      id: documentId("document:angle-test"),
      createdAt: "2026-10-21T10:00:00.000Z",
      title: "Angles",
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
    expect(restored.document.solidModels[entity.id]?.angleMeasurements).toEqual(
      measured.angleMeasurements,
    );
    expect(validateSolid3DRecord(base)).toEqual([]);
  });

  it("rebases concurrent measurements and rejects removal of their supporting points", () => {
    const base = record();
    const remote = saveSolidLineAngle(
      base,
      lines(line(0, 1), line(3, 7)),
      "solid-angle:remote",
    )!;
    const local = saveSolidLineAngle(
      base,
      lines(line(0, 3), line(4, 5)),
      "solid-angle:local",
    )!;
    const merged = rebaseSolid3DRecordUpdate({
      starting: base,
      current: remote,
      replacement: local,
    });
    expect(merged.status).toBe("ok");
    if (merged.status === "ok")
      expect(merged.record.angleMeasurements?.map(({ id }) => id)).toEqual([
        "solid-angle:remote",
        "solid-angle:local",
      ]);
    const withPoint = {
      ...base,
      points: [
        {
          id: solidPointId("solid-point:angle-point"),
          label: "M",
          position: { x: -1, y: -1, z: -1 },
          anchor: { kind: "vertex" as const, vertexId: "vertex:0" },
        },
      ],
    };
    const dependent = saveSolidLineAngle(
      withPoint,
      lines([{ kind: "point", id: withPoint.points[0]!.id }, v(1)], line(3, 7)),
      "solid-angle:dependent",
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
