import type {
  Solid3DRecord,
  SolidDistanceEndpoint,
  SolidDistanceMeasurement,
} from "./definitions";
import { resolveSolid3DPointPosition } from "./point-resolution";
import { createSolidTopology } from "./topology";
import { distance3, type Vec3 } from "./vectors";

/** Endpoints follow semantically anchored points or model vertices after resizing. */
export function resolveSolidDistanceEndpoint(
  record: Solid3DRecord,
  endpoint: SolidDistanceEndpoint,
): Vec3 | null {
  if (endpoint.kind === "point") {
    const point = record.points.find(({ id }) => id === endpoint.id);
    return point === undefined
      ? null
      : resolveSolid3DPointPosition(record.definition, point);
  }
  return (
    createSolidTopology(record.definition)?.vertices.find(
      ({ id }) => id === endpoint.id,
    )?.position ?? null
  );
}

export function calculateSolidDistance(
  record: Solid3DRecord,
  first: SolidDistanceEndpoint,
  second: SolidDistanceEndpoint,
): number | null {
  const start = resolveSolidDistanceEndpoint(record, first);
  const end = resolveSolidDistanceEndpoint(record, second);
  if (start === null || end === null) return null;
  const result = distance3(start, end);
  return Number.isFinite(result) ? result : null;
}

export function saveSolidDistance(
  record: Solid3DRecord,
  first: SolidDistanceEndpoint,
  second: SolidDistanceEndpoint,
  id: string,
): Solid3DRecord | null {
  if (first.kind === second.kind && first.id === second.id) return null;
  if (calculateSolidDistance(record, first, second) === null) return null;
  const measurements = record.measurements ?? [];
  if (
    measurements.length >= 16 ||
    measurements.some(
      (item) =>
        (item.first.kind === first.kind &&
          item.first.id === first.id &&
          item.second.kind === second.kind &&
          item.second.id === second.id) ||
        (item.first.kind === second.kind &&
          item.first.id === second.id &&
          item.second.kind === first.kind &&
          item.second.id === first.id),
    )
  )
    return null;
  const measurement: SolidDistanceMeasurement = { id, first, second };
  return { ...record, measurements: [...measurements, measurement] };
}
