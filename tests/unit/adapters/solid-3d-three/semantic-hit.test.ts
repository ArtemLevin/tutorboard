import { describe, expect, it } from "vitest";

import { resolveSolidHitAnchor } from "../../../../src/adapters/solid-3d-three/semantic-hit";
import { createSolidTopology } from "../../../../src/core/public";

describe("resolveSolidHitAnchor", () => {
  it("creates semantic sphere anchors without surface:0", () => {
    const placement = resolveSolidHitAnchor(
      { kind: "sphere", radius: 2 },
      { x: 1.8, y: 0.5, z: 0.3 },
      null,
      0,
      ["surface:sphere"],
    );
    expect(placement).not.toBeNull();
    expect(placement?.anchor).toMatchObject({
      kind: "analytic-surface",
      surfaceId: "surface:sphere",
    });
    expect(
      placement === null
        ? 0
        : Math.hypot(
            placement.position.x,
            placement.position.y,
            placement.position.z,
          ),
    ).toBeCloseTo(2, 10);
  });

  it("uses the face mapping to distinguish curved and base surfaces", () => {
    const definition = { kind: "hemisphere", radius: 2 } as const;
    const curved = resolveSolidHitAnchor(
      definition,
      { x: 1, y: 1.2, z: 0.2 },
      null,
      0,
      ["surface:hemisphere-curved", "surface:hemisphere-base"],
    );
    const base = resolveSolidHitAnchor(
      definition,
      { x: 1, y: 0.02, z: 0.2 },
      null,
      1,
      ["surface:hemisphere-curved", "surface:hemisphere-base"],
    );
    expect(curved?.anchor).toMatchObject({
      surfaceId: "surface:hemisphere-curved",
    });
    expect(base?.anchor).toMatchObject({
      surfaceId: "surface:hemisphere-base",
    });
    expect(base?.position.y).toBeCloseTo(0, 10);
  });

  it("fails closed when an analytic face has no semantic mapping", () => {
    expect(
      resolveSolidHitAnchor(
        { height: 4, kind: "cylinder", radius: 2 },
        { x: 2, y: 0, z: 0 },
        null,
        3,
        ["surface:cylinder-side"],
      ),
    ).toBeNull();
  });

  it("preserves existing polyhedron vertex snapping", () => {
    const definition = { edgeLength: 2, kind: "cube" } as const;
    const topology = createSolidTopology(definition)!;
    const vertex = topology.vertices[0]!;
    const placement = resolveSolidHitAnchor(
      definition,
      vertex.position,
      topology,
      0,
      [],
    );
    expect(placement).toEqual({
      anchor: { kind: "vertex", vertexId: vertex.id },
      position: vertex.position,
    });
  });
});
