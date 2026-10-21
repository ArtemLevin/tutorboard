import type {
  Solid3DRecord,
  SolidAngleLine,
  SolidAngleMeasurement,
  SolidDistanceEndpoint,
} from "./definitions";
import { resolveSolidDistanceEndpoint } from "./measurements";
import { dot3, normalize3, subtract3, type Vec3 } from "./vectors";

export interface SolidLineAngleResult {
  /** Smallest angle between unoriented infinite lines, in degrees [0, 90]. */
  readonly degrees: number;
  readonly first: readonly [Vec3, Vec3];
  readonly second: readonly [Vec3, Vec3];
  /** Unit directions aligned to depict the acute angle at first[0]. */
  readonly directions: readonly [Vec3, Vec3];
}

export function calculateSolidLineAngle(
  record: Solid3DRecord,
  lines: readonly [SolidAngleLine, SolidAngleLine],
): SolidLineAngleResult | null {
  const points = lines.map((line) =>
    line.map((endpoint) => resolveSolidDistanceEndpoint(record, endpoint)),
  );
  const first = points[0];
  const second = points[1];
  if (!first || !second || !first[0] || !first[1] || !second[0] || !second[1])
    return null;
  const u = normalize3(subtract3(first[1], first[0]));
  const v = normalize3(subtract3(second[1], second[0]));
  if (u === null || v === null) return null;
  const cosine = Math.min(1, Math.max(0, Math.abs(dot3(u, v))));
  const sign = dot3(u, v) < 0 ? -1 : 1;
  return {
    degrees: (Math.acos(cosine) * 180) / Math.PI,
    first: [first[0], first[1]],
    second: [second[0], second[1]],
    directions: [u, { x: sign * v.x, y: sign * v.y, z: sign * v.z }],
  };
}

function endpointKey(endpoint: SolidDistanceEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`;
}

function lineKey(line: SolidAngleLine): string {
  return line.map(endpointKey).sort().join("/");
}

function pairKey(lines: readonly [SolidAngleLine, SolidAngleLine]): string {
  return lines.map(lineKey).sort().join("|");
}

/** Reject incomplete, degenerate, duplicate and unbounded persisted lines. */
export function saveSolidLineAngle(
  record: Solid3DRecord,
  lines: readonly [SolidAngleLine, SolidAngleLine],
  id: string,
): Solid3DRecord | null {
  if (calculateSolidLineAngle(record, lines) === null) return null;
  const existing = record.angleMeasurements ?? [];
  if (
    existing.length >= 12 ||
    existing.some((item) => item.id === id || pairKey(item.lines) === pairKey(lines))
  )
    return null;
  const saved: SolidAngleMeasurement = { id, lines };
  return { ...record, angleMeasurements: [...existing, saved] };
}
