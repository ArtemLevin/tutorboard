import type { Solid3DBoardProjection } from "./definitions";
import type { Vec2, Vec3 } from "./vectors";

export function projectSolidPoint(
  point: Vec3,
  projection: Solid3DBoardProjection,
): Vec2 {
  const matrix = projection.matrix;
  if (matrix.length < 6)
    throw new RangeError("Solid projection matrix requires six coefficients.");
  return {
    x:
      projection.origin.x +
      projection.viewportScale *
        (matrix[0]! * point.x + matrix[1]! * point.y + matrix[2]! * point.z),
    y:
      projection.origin.y +
      projection.viewportScale *
        (matrix[3]! * point.x + matrix[4]! * point.y + matrix[5]! * point.z),
  };
}
