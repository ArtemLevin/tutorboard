import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  defaultSolidProjection,
  withSolid3DModelEulerDegrees,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { createProjectSolid3DSectionCommand } from "../../../../src/modules/solid-3d/public";

const record = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: "solid:projection-rotation",
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: "group:projection-rotation",
  schemaVersion: "1.0",
  sections: [
    {
      algorithmVersion: "polyhedron-plane/1",
      id: "solid-section:projection-rotation",
      pointIds: ["point:a", "point:b", "point:c"],
      visible: true,
    },
  ],
  source: { kind: "text-template", templateId: "cube" },
} as Solid3DRecord;

describe("rotated solid board projection", () => {
  it("applies body rotation before the 2D projection matrix", () => {
    const rotated = withSolid3DModelEulerDegrees(record, { x: 0, y: 0, z: 90 });
    const command = createProjectSolid3DSectionCommand({
      metadata: {
        actorId: actorId("actor:projection-rotation"),
        id: commandId("command:projection-rotation"),
        timestamp: "2026-08-09T17:50:00.000Z",
      },
      record: rotated,
      section: {
        area: 0.5,
        intersections: 3,
        perimeter: 3.4,
        vertices: [
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
      },
      sectionId: "solid-section:projection-rotation",
      token: "rotation",
      translation: { x: 0, y: 0 },
    });
    const first = command.objects[0];
    expect(first?.position.x).toBeCloseTo(0, 8);
    expect(first?.position.y).toBeCloseTo(-1, 8);
  });
});
