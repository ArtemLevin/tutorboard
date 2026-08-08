import type { Solid3DDefinition } from "./definitions";
import type { SolidSectionResult } from "./polyhedron-section";
import {
  add3,
  cross3,
  distance3,
  dot3,
  normalize3,
  scale3,
  type Plane3D,
  type Vec3,
} from "./vectors";

function measure(
  points: readonly Vec3[],
  plane: Plane3D,
): SolidSectionResult | null {
  if (points.length < 3) return null;
  let areaVector: Vec3 = { x: 0, y: 0, z: 0 };
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    areaVector = add3(areaVector, cross3(current, next));
    perimeter += distance3(current, next);
  }
  return {
    area: Math.abs(dot3(areaVector, plane.normal)) / 2,
    intersections: points.length,
    perimeter,
    vertices: points,
  };
}

function basis(normal: Vec3): readonly [Vec3, Vec3] {
  const reference =
    Math.abs(normal.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const first = normalize3(cross3(normal, reference))!;
  return [first, cross3(normal, first)];
}

function sphereSection(
  radius: number,
  plane: Plane3D,
  samples: number,
): SolidSectionResult | null {
  const distance = Math.abs(plane.constant);
  if (distance >= radius) return null;
  const center = scale3(plane.normal, -plane.constant);
  const sectionRadius = Math.sqrt(radius * radius - distance * distance);
  const [u, v] = basis(plane.normal);
  const points = Array.from({ length: samples }, (_, index) => {
    const angle = (index * Math.PI * 2) / samples;
    return add3(
      center,
      add3(
        scale3(u, Math.cos(angle) * sectionRadius),
        scale3(v, Math.sin(angle) * sectionRadius),
      ),
    );
  });
  const measured = measure(points, plane);
  return measured === null
    ? null
    : {
        ...measured,
        area: Math.PI * sectionRadius * sectionRadius,
        perimeter: 2 * Math.PI * sectionRadius,
      };
}

function verticalCylinderSection(
  radius: number,
  height: number,
  plane: Plane3D,
): SolidSectionResult | null {
  const horizontal = normalize3({ x: plane.normal.x, y: 0, z: plane.normal.z });
  if (horizontal === null) return null;
  const distance =
    Math.abs(plane.constant) / Math.hypot(plane.normal.x, plane.normal.z);
  if (distance >= radius) return null;
  const center = scale3(
    horizontal,
    -plane.constant / Math.hypot(plane.normal.x, plane.normal.z),
  );
  const tangent = { x: -horizontal.z, y: 0, z: horizontal.x };
  const halfWidth = Math.sqrt(radius * radius - distance * distance);
  const halfHeight = height / 2;
  const points = [
    add3(add3(center, scale3(tangent, -halfWidth)), {
      x: 0,
      y: -halfHeight,
      z: 0,
    }),
    add3(add3(center, scale3(tangent, halfWidth)), {
      x: 0,
      y: -halfHeight,
      z: 0,
    }),
    add3(add3(center, scale3(tangent, halfWidth)), {
      x: 0,
      y: halfHeight,
      z: 0,
    }),
    add3(add3(center, scale3(tangent, -halfWidth)), {
      x: 0,
      y: halfHeight,
      z: 0,
    }),
  ];
  return measure(points, plane);
}

function verticalRevolutionSection(
  height: number,
  radiusAtY: (y: number) => number,
  plane: Plane3D,
  samples = 64,
): SolidSectionResult | null {
  const horizontalLength = Math.hypot(plane.normal.x, plane.normal.z);
  if (horizontalLength < 1e-10) return null;
  const horizontal = {
    x: plane.normal.x / horizontalLength,
    y: 0,
    z: plane.normal.z / horizontalLength,
  };
  const signedAxisDistance = plane.constant / horizontalLength;
  const center = scale3(horizontal, -signedAxisDistance);
  const tangent = { x: -horizontal.z, y: 0, z: horizontal.x };
  const positive: Vec3[] = [];
  const negative: Vec3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const y = -height / 2 + (index * height) / samples;
    const radius = radiusAtY(y);
    if (radius + 1e-9 < Math.abs(signedAxisDistance)) continue;
    const halfWidth = Math.sqrt(
      Math.max(0, radius * radius - signedAxisDistance * signedAxisDistance),
    );
    const level = add3(center, { x: 0, y, z: 0 });
    positive.push(add3(level, scale3(tangent, halfWidth)));
    negative.push(add3(level, scale3(tangent, -halfWidth)));
  }
  return measure([...positive, ...negative.reverse()], plane);
}

function sampledRevolutionSection(
  height: number,
  radiusAtY: (y: number) => number,
  plane: Plane3D,
  samples: number,
): SolidSectionResult | null {
  if (Math.abs(plane.normal.y) < 1e-8) return null;
  const points: Vec3[] = [];
  const half = height / 2;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index * Math.PI * 2) / samples;
    const horizontal =
      plane.normal.x * Math.cos(angle) + plane.normal.z * Math.sin(angle);
    const radius0 = radiusAtY(0);
    const radius1 = radiusAtY(1);
    const slope = radius1 - radius0;
    const denominator = plane.normal.y + horizontal * slope;
    if (Math.abs(denominator) < 1e-10) continue;
    const y = -(plane.constant + horizontal * radius0) / denominator;
    if (y < -half - 1e-7 || y > half + 1e-7) continue;
    const radius = radiusAtY(y);
    points.push({
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
    });
  }
  return points.length < samples * 0.8 ? null : measure(points, plane);
}

export function intersectAnalyticSolidWithPlane(
  definition: Solid3DDefinition,
  plane: Plane3D,
  samples = 128,
): SolidSectionResult | null {
  switch (definition.kind) {
    case "sphere":
      return sphereSection(definition.radius, plane, samples);
    case "cylinder":
      return Math.abs(plane.normal.y) < 1e-8
        ? verticalCylinderSection(definition.radius, definition.height, plane)
        : sampledRevolutionSection(
            definition.height,
            () => definition.radius,
            plane,
            samples,
          );
    case "cone":
      return Math.abs(plane.normal.y) < 1e-8
        ? verticalRevolutionSection(
            definition.height,
            (y) => definition.radius * Math.max(0, 0.5 - y / definition.height),
            plane,
          )
        : sampledRevolutionSection(
            definition.height,
            (y) => definition.radius * Math.max(0, 0.5 - y / definition.height),
            plane,
            samples,
          );
    case "truncated-cone": {
      const slope =
        (definition.topRadius - definition.bottomRadius) / definition.height;
      const radiusAtY = (y: number) =>
        definition.bottomRadius + (y + definition.height / 2) * slope;
      return Math.abs(plane.normal.y) < 1e-8
        ? verticalRevolutionSection(definition.height, radiusAtY, plane)
        : sampledRevolutionSection(
            definition.height,
            radiusAtY,
            plane,
            samples,
          );
    }
    case "cube":
    case "cuboid":
    case "prism":
    case "pyramid":
    case "tetrahedron":
      return null;
  }
}
