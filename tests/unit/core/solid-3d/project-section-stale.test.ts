import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  createSolidTopology,
  documentId,
  reduceBoardDocument,
  solidPointId,
  solidSectionId,
} from "../../../../src/core/public";
import {
  calculateSolidSection,
  createProjectSolid3DSectionCommand,
} from "../../../../src/modules/solid-3d/public";
import {
  createTextShapePlacementCommand,
  textShapeCatalog,
} from "../../../../src/modules/text-shape-placement/public";

const metadata = (name: string) => ({
  actorId: actorId("actor:projection-guard"),
  id: commandId(`command:projection-guard:${name}`),
  timestamp: "2026-10-21T12:00:00.000Z",
});

describe("3D section projection optimistic concurrency", () => {
  it("rejects projection after a concurrent geometry edit", () => {
    const empty = createEmptyBoardDocument({
      createdAt: metadata("created").timestamp,
      id: documentId("document:projection-guard"),
      title: "3D",
    });
    const cube = textShapeCatalog.find(({ id }) => id === "cube")!;
    const placed = reduceBoardDocument(
      empty,
      createTextShapePlacementCommand({
        autoLabelVertices: true,
        definition: cube,
        metadata: metadata("place"),
        placement: { x: 0, y: 0 },
        token: "projection-guard",
      }),
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const initial = Object.values(placed.document.solidModels)[0]!;
    const topology = createSolidTopology(initial.definition)!;
    const points = [
      topology.vertices[0]!,
      topology.vertices[1]!,
      topology.vertices[6]!,
    ].map((vertex, i) => ({
      anchor: { kind: "vertex" as const, vertexId: vertex.id },
      id: solidPointId(`solid-point:projection-${i}`),
      label: `P${i}`,
      position: vertex.position,
    }));
    const sectionId = solidSectionId("solid-section:projection-guard");
    const saved = {
      ...initial,
      points,
      sections: [
        {
          algorithmVersion: "polyhedron-plane/1" as const,
          id: sectionId,
          pointIds: [points[0]!.id, points[1]!.id, points[2]!.id] as const,
          visible: true,
        },
      ],
    };
    const configured = reduceBoardDocument(placed.document, {
      ...metadata("configure"),
      kind: "core.solid-3d.update",
      expected: initial,
      replacement: saved,
      solidId: initial.id,
    });
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    const calculated = calculateSolidSection(saved, saved.sections[0]!.pointIds);
    expect(calculated.status).toBe("ok");
    if (calculated.status !== "ok") return;
    const projected = createProjectSolid3DSectionCommand({
      metadata: metadata("project"),
      record: saved,
      sectionId,
      section: calculated.section,
      token: "project",
      translation: { x: 0, y: 0 },
    });
    expect(reduceBoardDocument(configured.document, projected).ok).toBe(true);
    const rotated = {
      ...saved,
      projection: {
        ...saved.projection,
        origin: { x: 30, y: 0 },
      },
    };
    const concurrent = reduceBoardDocument(configured.document, {
      ...metadata("concurrent"),
      kind: "core.solid-3d.update",
      expected: saved,
      replacement: rotated,
      solidId: saved.id,
    });
    expect(concurrent.ok).toBe(true);
    if (!concurrent.ok) return;
    const stale = reduceBoardDocument(concurrent.document, projected);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("command.stale-solid");
    expect(stale.document).toEqual(concurrent.document);
    const tampered = {
      ...projected,
      objects: projected.objects.map((object, index) =>
        index === 0 && object.kind === "drawing.line"
          ? { ...object, position: { ...object.position, x: object.position.x + 50 } }
          : object,
      ),
    };
    const rejected = reduceBoardDocument(configured.document, tampered);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("command.stale-solid");
  });
});
