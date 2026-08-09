import type { Solid3DRecord } from "./definitions";
import type { SolidSectionResult } from "./polyhedron-section";
import type { Vec3 } from "./vectors";

export interface Solid3DQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Solid3DEulerDegrees {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const identitySolid3DQuaternion: Solid3DQuaternion = {
  w: 1,
  x: 0,
  y: 0,
  z: 0,
};

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (radiansValue: number): number =>
  (radiansValue * 180) / Math.PI;

export function normalizeSolid3DQuaternion(
  quaternion: Solid3DQuaternion,
): Solid3DQuaternion {
  const length = Math.hypot(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w,
  );
  if (!Number.isFinite(length) || length <= Number.EPSILON)
    return identitySolid3DQuaternion;
  return {
    w: quaternion.w / length,
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
  };
}

export function solid3DQuaternionFromEulerDegrees(
  euler: Solid3DEulerDegrees,
): Solid3DQuaternion {
  const x = radians(euler.x) / 2;
  const y = radians(euler.y) / 2;
  const z = radians(euler.z) / 2;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return normalizeSolid3DQuaternion({
    w: cx * cy * cz + sx * sy * sz,
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
  });
}

export function solid3DEulerDegreesFromQuaternion(
  input: Solid3DQuaternion,
): Solid3DEulerDegrees {
  const quaternion = normalizeSolid3DQuaternion(input);
  const sinX = 2 * (quaternion.w * quaternion.x + quaternion.y * quaternion.z);
  const cosX = 1 - 2 * (quaternion.x ** 2 + quaternion.y ** 2);
  const sinY = Math.max(
    -1,
    Math.min(
      1,
      2 * (quaternion.w * quaternion.y - quaternion.z * quaternion.x),
    ),
  );
  const sinZ = 2 * (quaternion.w * quaternion.z + quaternion.x * quaternion.y);
  const cosZ = 1 - 2 * (quaternion.y ** 2 + quaternion.z ** 2);
  return {
    x: degrees(Math.atan2(sinX, cosX)),
    y: degrees(Math.asin(sinY)),
    z: degrees(Math.atan2(sinZ, cosZ)),
  };
}

/**
 * TutorBoard board/v1 keeps the projection matrix extensible up to 16 finite
 * values. 3D-4 stores the model quaternion in slots 6..9, preserving the
 * original six projection coefficients byte-for-byte for legacy consumers.
 */
export function solid3DModelQuaternion(
  record: Solid3DRecord,
): Solid3DQuaternion {
  const values = record.projection.matrix.slice(6, 10);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
    return identitySolid3DQuaternion;
  const [x, y, z, w] = values;
  return normalizeSolid3DQuaternion({ x: x!, y: y!, z: z!, w: w! });
}

export function withSolid3DModelQuaternion(
  record: Solid3DRecord,
  quaternion: Solid3DQuaternion,
): Solid3DRecord {
  const normalized = normalizeSolid3DQuaternion(quaternion);
  return {
    ...record,
    projection: {
      ...record.projection,
      matrix: [
        ...record.projection.matrix.slice(0, 6),
        normalized.x,
        normalized.y,
        normalized.z,
        normalized.w,
      ],
    },
  };
}

export function withSolid3DModelEulerDegrees(
  record: Solid3DRecord,
  euler: Solid3DEulerDegrees,
): Solid3DRecord {
  return withSolid3DModelQuaternion(
    record,
    solid3DQuaternionFromEulerDegrees(euler),
  );
}

export function applySolid3DQuaternion(
  point: Vec3,
  input: Solid3DQuaternion,
): Vec3 {
  const quaternion = normalizeSolid3DQuaternion(input);
  const tx = 2 * (quaternion.y * point.z - quaternion.z * point.y);
  const ty = 2 * (quaternion.z * point.x - quaternion.x * point.z);
  const tz = 2 * (quaternion.x * point.y - quaternion.y * point.x);
  return {
    x: point.x + quaternion.w * tx + (quaternion.y * tz - quaternion.z * ty),
    y: point.y + quaternion.w * ty + (quaternion.z * tx - quaternion.x * tz),
    z: point.z + quaternion.w * tz + (quaternion.x * ty - quaternion.y * tx),
  };
}

export function transformSolid3DSectionForProjection(
  record: Solid3DRecord,
  section: SolidSectionResult,
): SolidSectionResult {
  const quaternion = solid3DModelQuaternion(record);
  return {
    ...section,
    vertices: section.vertices.map((point) =>
      applySolid3DQuaternion(point, quaternion),
    ),
  };
}
