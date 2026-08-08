export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Plane3D {
  readonly normal: Vec3;
  readonly constant: number;
}

export const solid3DEpsilon = 1e-8;

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const subtract3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scale3 = (value: Vec3, scale: number): Vec3 => ({
  x: value.x * scale,
  y: value.y * scale,
  z: value.z * scale,
});
export const dot3 = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length3 = (value: Vec3): number => Math.sqrt(dot3(value, value));
export const distance3 = (a: Vec3, b: Vec3): number => length3(subtract3(a, b));

export function normalize3(value: Vec3): Vec3 | null {
  const length = length3(value);
  return Number.isFinite(length) && length > solid3DEpsilon
    ? scale3(value, 1 / length)
    : null;
}

export function planeFromThreePoints(
  first: Vec3,
  second: Vec3,
  third: Vec3,
): Plane3D | null {
  const normal = normalize3(
    cross3(subtract3(second, first), subtract3(third, first)),
  );
  return normal === null ? null : { normal, constant: -dot3(normal, first) };
}

export const signedDistanceToPlane = (plane: Plane3D, point: Vec3): number =>
  dot3(plane.normal, point) + plane.constant;

export function isFiniteVec3(value: Vec3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}
