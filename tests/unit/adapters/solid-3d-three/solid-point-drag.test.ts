import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createSolidTopology,
  defaultSolidProjection,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DRecord,
  type SolidPointAnchor,
  type Vec3,
} from "../../../../src/core/public";
import { buildSolidScene } from "../../../../src/adapters/solid-3d-three/scene-builder";
import {
  dragSolidPointToPointer,
  pickSolidPointForDrag,
} from "../../../../src/adapters/solid-3d-three/solid-point-drag";

const definition = { kind: "cube", edgeLength: 2 } as const;
const topology = createSolidTopology(definition)!;
const edgeId = topology.edges[0]!.id;
const anchor: SolidPointAnchor = { kind: "edge", edgeId, parameter: 0.25 };
const pointId = solidPointId("solid-point:pick-test");

function record(): Solid3DRecord {
  return {
    id: solid3DId("solid:pick-test"),
    rootGroupId: "group:pick-test" as never,
    boardObjectIds: [],
    definition,
    projection: defaultSolidProjection,
    points: [
      {
        id: pointId,
        label: "P",
        anchor,
        position: resolveSolidPointAnchor(topology, anchor)!,
      },
    ],
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
  };
}

function project(point: Vec3, camera: THREE.Camera, bounds: DOMRect) {
  const image = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: bounds.left + ((image.x + 1) / 2) * bounds.width,
    y: bounds.top + ((1 - image.y) / 2) * bounds.height,
  };
}

describe("point drag screen-space geometry", () => {
  it("picks an existing edge point and slides it along the same edge", () => {
    const solid = record();
    const built = buildSolidScene(definition);
    const camera = new THREE.OrthographicCamera(
      -3.5,
      3.5,
      2.8,
      -2.8,
      0.01,
      100,
    );
    camera.position.set(4.8, 3.8, 5.4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    built.root.updateMatrixWorld(true);
    const bounds = new DOMRect(10, 20, 800, 600);
    const scene = {
      camera,
      root: built.root,
      mesh: built.mesh,
      topology: built.topology,
      surfaceFaceIds: built.semanticSurfaceFaceIds,
    };
    const start = project(solid.points[0]!.position, camera, bounds);
    const picked = pickSolidPointForDrag(
      solid,
      scene,
      bounds,
      start.x,
      start.y,
    );
    expect(picked?.id).toBe(pointId);
    expect(
      pickSolidPointForDrag(solid, scene, bounds, start.x + 200, start.y),
    ).toBeNull();

    const laterAnchor: SolidPointAnchor = {
      kind: "edge",
      edgeId,
      parameter: 0.75,
    };
    const target = resolveSolidPointAnchor(topology, laterAnchor)!;
    const destination = project(target, camera, bounds);
    const result = dragSolidPointToPointer(
      solid,
      picked!,
      scene,
      bounds,
      destination.x,
      destination.y,
    );
    expect(result?.anchor).toMatchObject({
      kind: "edge",
      edgeId,
      parameter: expect.closeTo(0.75, 5),
    });
    expect(result?.position).toEqual(target);
  });
});
