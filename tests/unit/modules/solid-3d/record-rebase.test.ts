import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  groupId,
  solid3DId,
  solidPointId,
  solidSectionId,
  type Solid3DPoint,
  type Solid3DRecord,
  type Solid3DSectionDefinition,
} from "../../../../src/core/public";
import { rebaseSolid3DRecordUpdate } from "../../../../src/modules/solid-3d/public";

const definition = { edgeLength: 2, kind: "cube" } as const;
const topology = createSolidTopology(definition)!;

function point(index: number): Solid3DPoint {
  const vertex = topology.vertices[index]!;
  return {
    anchor: { kind: "vertex", vertexId: vertex.id },
    id: solidPointId(`solid-point:merge-${index}`),
    label: `P${index}`,
    position: vertex.position,
  };
}

function section(points: readonly Solid3DPoint[]): Solid3DSectionDefinition {
  return {
    algorithmVersion: "polyhedron-plane/1",
    id: solidSectionId("solid-section:merge-a"),
    pointIds: [points[0]!.id, points[1]!.id, points[2]!.id],
    visible: true,
  };
}

function record(): Solid3DRecord {
  const points = [point(0), point(1), point(6)];
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:merge"),
    points,
    projection: defaultSolidProjection,
    rootGroupId: groupId("group:merge"),
    schemaVersion: "1.0",
    sections: [section(points)],
    source: { kind: "text-template", templateId: "cube" },
  };
}

describe("3D collaborative editor three-way rebase", () => {
  it("reproduces the stale-replacement bug and retains a remote point", () => {
    const starting = record();
    const added = point(4);
    const current = { ...starting, points: [...starting.points, added] };
    const replacement = {
      ...starting,
      points: starting.points.map((entry, index) =>
        index === 0 ? { ...entry, label: "Local label" } : entry,
      ),
    };

    // The old controller would set expected=current, replacement=stale,
    // losing the remote point despite a successful reducer CAS.
    expect(replacement.points).not.toContainEqual(added);
    const result = rebaseSolid3DRecordUpdate({
      current,
      replacement,
      starting,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.record.points).toEqual([
      { ...starting.points[0], label: "Local label" },
      starting.points[1],
      starting.points[2],
      added,
    ]);
    expect(result.record.sections).toEqual(starting.sections);
    expect(current.points[0]?.label).toBe("P0");
  });

  it("merges independent remote and local saved sections without clobbering order", () => {
    const starting = record();
    const remote: Solid3DSectionDefinition = {
      ...starting.sections[0]!,
      id: solidSectionId("solid-section:remote"),
      label: "Remote",
    };
    const local: Solid3DSectionDefinition = {
      ...starting.sections[0]!,
      id: solidSectionId("solid-section:local"),
      label: "Local",
    };
    const result = rebaseSolid3DRecordUpdate({
      starting,
      current: { ...starting, sections: [...starting.sections, remote] },
      replacement: { ...starting, sections: [...starting.sections, local] },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok")
      expect(result.record.sections.map(({ id }) => id)).toEqual([
        starting.sections[0]!.id,
        remote.id,
        local.id,
      ]);
  });

  it("rejects writes to a remotely renamed, deleted or re-used point ID", () => {
    const starting = record();
    const local = {
      ...starting,
      points: [
        { ...starting.points[0]!, label: "Local" },
        ...starting.points.slice(1),
      ],
    };
    const conflicting = {
      ...starting,
      points: [
        { ...starting.points[0]!, label: "Remote" },
        ...starting.points.slice(1),
      ],
    };
    const removed = {
      ...starting,
      points: starting.points.slice(1),
      sections: [],
    };
    const rebase = (current: Solid3DRecord) =>
      rebaseSolid3DRecordUpdate({ starting, current, replacement: local })
        .status;
    expect(rebase(conflicting)).toBe("conflict");
    expect(rebase(removed)).toBe("conflict");

    const addedId = point(3);
    const remoteAdded = { ...starting, points: [...starting.points, addedId] };
    const localAdded = {
      ...starting,
      points: [...starting.points, { ...addedId, label: "Other" }],
    };
    expect(
      rebaseSolid3DRecordUpdate({
        current: remoteAdded,
        starting,
        replacement: localAdded,
      }).status,
    ).toBe("conflict");
  });

  it("rejects deletion when a newly added section references that point", () => {
    const starting = record();
    const dependent: Solid3DSectionDefinition = {
      ...starting.sections[0]!,
      id: solidSectionId("solid-section:new-dependent"),
    };
    const current = {
      ...starting,
      sections: [...starting.sections, dependent],
    };
    const replacement = {
      ...starting,
      points: starting.points.slice(1),
      sections: [],
    };
    expect(
      rebaseSolid3DRecordUpdate({ current, starting, replacement }).status,
    ).toBe("conflict");
  });

  it("rejects a newly created section when a source point moved remotely", () => {
    const starting = { ...record(), sections: [] };
    const newSection = section(starting.points);
    const current = {
      ...starting,
      points: starting.points.map((entry, index) =>
        index === 0 ? { ...entry, label: "Changed remotely" } : entry,
      ),
    };
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current,
        replacement: { ...starting, sections: [newSection] },
      }).status,
    ).toBe("conflict");
  });

  it("keeps geometry edits atomic and rejects edits across a remote resize", () => {
    const starting = record();
    const current = { ...starting, points: [...starting.points, point(5)] };
    const resized = {
      ...starting,
      definition: { kind: "cube" as const, edgeLength: 3 },
      points: [],
      sections: [],
    };
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current,
        replacement: resized,
      }).status,
    ).toBe("conflict");
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current: { ...starting, definition: { kind: "cube", edgeLength: 3 } },
        replacement: { ...starting, points: [...starting.points, point(4)] },
      }).status,
    ).toBe("conflict");
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current: starting,
        replacement: resized,
      }).status,
    ).toBe("ok");
  });

  it("preserves a remote point while updating only the model projection", () => {
    const starting = record();
    const current = { ...starting, points: [...starting.points, point(5)] };
    const projection = {
      ...starting.projection,
      viewportScale: 1.25,
    };
    const result = rebaseSolid3DRecordUpdate({
      starting,
      current,
      replacement: { ...starting, projection },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.record.projection).toEqual(projection);
      expect(result.record.points).toEqual(current.points);
    }
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current: {
          ...current,
          projection: { ...projection, viewportScale: 2 },
        },
        replacement: { ...starting, projection },
      }).status,
    ).toBe("conflict");
  });

  it("rejects invalid merged references or capacity and rejects ownership changes", () => {
    const starting = record();
    const current = { ...starting, points: [...starting.points, point(4)] };
    const replacement = {
      ...starting,
      points: starting.points.slice(1),
      // Leaves a dangling reference in a saved section.
    };
    expect(
      rebaseSolid3DRecordUpdate({ starting, current, replacement }).status,
    ).toBe("conflict");
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current,
        replacement: { ...starting, rootGroupId: groupId("group:other") },
      }).status,
    ).toBe("conflict");

    const fullStarting = { ...starting, sections: [] };
    const remoteFull = {
      ...fullStarting,
      points: [
        ...fullStarting.points,
        ...Array.from({ length: 29 }, (_, i) => ({
          ...point(3),
          id: solidPointId(`solid-point:remote:${i}`),
        })),
      ],
    };
    expect(remoteFull.points).toHaveLength(32);
    expect(
      rebaseSolid3DRecordUpdate({
        starting: fullStarting,
        current: remoteFull,
        replacement: {
          ...fullStarting,
          points: [...fullStarting.points, point(4)],
        },
      }).status,
    ).toBe("conflict");
  });

  it("does not create a command for no-ops or already-applied changes", () => {
    const starting = record();
    const updated = {
      ...starting,
      points: starting.points.map((entry, index) =>
        index === 0 ? { ...entry, label: "New" } : entry,
      ),
    };
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current: updated,
        replacement: starting,
      }).status,
    ).toBe("unchanged");
    expect(
      rebaseSolid3DRecordUpdate({
        starting,
        current: updated,
        replacement: updated,
      }).status,
    ).toBe("unchanged");
  });
});
