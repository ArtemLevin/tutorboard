import { describe, expect, it } from "vitest";
import {
  buildSectionConstructionGraph,
  createSolidTopology,
  intersectPolyhedronWithPlane,
  planeFromThreePoints,
  validateConstructionAction,
} from "../../src/core/public";

describe("solid 3D learning performance", () => {
  it("keeps section recomputation and action validation inside budgets", () => {
    const topology = createSolidTopology({ edgeLength: 2, kind: "cube" })!;
    const durations: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      const offset = (index % 100) / 200 - 0.25;
      const plane = planeFromThreePoints(
        { x: 0, y: 0, z: offset },
        { x: 1, y: 0, z: offset },
        { x: 0, y: 1, z: offset },
      )!;
      const start = performance.now();
      const section = intersectPolyhedronWithPlane(topology, plane)!;
      const graph = buildSectionConstructionGraph(topology, section);
      validateConstructionAction(graph, {
        kind: "close-contour",
        orderedPointIds: graph.cycle,
      });
      durations.push(performance.now() - start);
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    expect(p95).toBeLessThan(16);
  });
});
