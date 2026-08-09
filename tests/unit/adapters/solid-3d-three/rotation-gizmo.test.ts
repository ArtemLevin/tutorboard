import { describe, expect, it } from "vitest";

import {
  applySolid3DQuaternion,
  identitySolid3DQuaternion,
} from "../../../../src/core/public";
import { quaternionAfterGizmoDrag } from "../../../../src/adapters/solid-3d-three/rotation-gizmo";

describe("solid rotation gizmo", () => {
  it("applies a quarter-turn around Z to the model quaternion", () => {
    const rotation = quaternionAfterGizmoDrag(
      identitySolid3DQuaternion,
      "z",
      Math.PI / 2,
    );
    const point = applySolid3DQuaternion({ x: 1, y: 0, z: 0 }, rotation);
    expect(point.x).toBeCloseTo(0, 8);
    expect(point.y).toBeCloseTo(1, 8);
    expect(point.z).toBeCloseTo(0, 8);
  });

  it("keeps drag output normalized", () => {
    const rotation = quaternionAfterGizmoDrag(
      { w: 0.9, x: 0.2, y: 0.1, z: -0.05 },
      "x",
      0.37,
    );
    expect(
      Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w),
    ).toBeCloseTo(1, 10);
  });
});
