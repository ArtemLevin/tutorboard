import {
  createSolidTopology,
  cross3,
  distance3,
  dot3,
  intersectPolyhedronWithPlane,
  planeFromThreePoints,
  resolveSolid3DPointPosition,
  signedDistanceToPlane,
  solidPointId,
  solidSectionId,
  subtract3,
  type Plane3D,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidPointAnchor,
  type SolidSectionResult,
  type SolidTopology,
  type Vec3,
} from "../../core/public";

type PointIds = readonly [Solid3DPoint["id"], Solid3DPoint["id"], Solid3DPoint["id"]];

export interface SolidSectionSweepFrame {
  readonly plane: Plane3D;
  readonly minOffset: number;
  readonly maxOffset: number;
}

export interface SolidSectionSweepPreview {
  readonly frame: SolidSectionSweepFrame;
  readonly section: SolidSectionResult | null;
}

export type SaveSolidSectionSweepResult =
  | { readonly status: "error"; readonly code: "invalid-source" | "outside" | "limit" }
  | {
      readonly status: "ok";
      readonly record: Solid3DRecord;
      readonly section: SolidSectionResult;
      readonly sectionId: string;
      readonly pointIds: PointIds;
    };

function sameSource(current: Solid3DRecord, starting: Solid3DRecord, ids: PointIds): boolean {
  if (
    current.id !== starting.id ||
    JSON.stringify(current.definition) !== JSON.stringify(starting.definition)
  ) return false;
  return ids.every((id) => {
    const before = starting.points.find((point) => point.id === id);
    const after = current.points.find((point) => point.id === id);
    return before !== undefined && JSON.stringify(before) === JSON.stringify(after);
  });
}

/** A parallel sweep is available only where stable, anchored polyhedron edges exist. */
export function getSolidSectionSweepFrame(
  record: Solid3DRecord,
  ids: PointIds,
): SolidSectionSweepFrame | null {
  const topology = createSolidTopology(record.definition);
  if (topology === null) return null;
  const points = ids.map((id) => record.points.find((point) => point.id === id));
  if (points.some((point) => point === undefined)) return null;
  const plane = planeFromThreePoints(
    resolveSolid3DPointPosition(record.definition, points[0]!),
    resolveSolid3DPointPosition(record.definition, points[1]!),
    resolveSolid3DPointPosition(record.definition, points[2]!),
  );
  if (plane === null) return null;
  const distances = topology.vertices.map((vertex) =>
    signedDistanceToPlane(plane, vertex.position),
  );
  const minOffset = Math.min(...distances);
  const maxOffset = Math.max(...distances);
  if (!Number.isFinite(minOffset) || !Number.isFinite(maxOffset) || maxOffset - minOffset < 1e-8) {
    return null;
  }
  return { plane, minOffset, maxOffset };
}

function translatedPlane(frame: SolidSectionSweepFrame, offset: number): Plane3D {
  return { normal: frame.plane.normal, constant: frame.plane.constant - offset };
}

export function previewSolidSectionSweep(
  record: Solid3DRecord,
  ids: PointIds,
  offset: number,
): SolidSectionSweepPreview | null {
  const frame = getSolidSectionSweepFrame(record, ids);
  const topology = createSolidTopology(record.definition);
  if (frame === null || topology === null || !Number.isFinite(offset)) return null;
  if (offset < frame.minOffset || offset > frame.maxOffset) {
    return { frame, section: null };
  }
  return {
    frame,
    section: intersectPolyhedronWithPlane(topology, translatedPlane(frame, offset)),
  };
}

function anchorOnBoundary(
  topology: SolidTopology,
  point: Vec3,
  tolerance: number,
): SolidPointAnchor | null {
  const vertex = topology.vertices.find((candidate) =>
    distance3(candidate.position, point) <= tolerance,
  );
  if (vertex !== undefined) return { kind: "vertex", vertexId: vertex.id };
  const vertices = new Map(topology.vertices.map(({ id, position }) => [id, position]));
  for (const edge of topology.edges) {
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    const direction = subtract3(end, start);
    const lengthSquared = dot3(direction, direction);
    if (lengthSquared < 1e-16) continue;
    const parameter = dot3(subtract3(point, start), direction) / lengthSquared;
    if (parameter < 0 || parameter > 1) continue;
    const projected = {
      x: start.x + direction.x * parameter,
      y: start.y + direction.y * parameter,
      z: start.z + direction.z * parameter,
    };
    if (distance3(projected, point) <= tolerance) {
      return { kind: "edge", edgeId: edge.id, parameter };
    }
  }
  return null;
}

function nonCollinearVertices(section: SolidSectionResult): readonly [Vec3, Vec3, Vec3] | null {
  const vertices = section.vertices;
  if (vertices.length < 3) return null;
  const first = vertices[0]!;
  let second = vertices[1]!;
  for (const point of vertices) {
    if (distance3(first, point) > distance3(first, second)) second = point;
  }
  const direction = subtract3(second, first);
  let third: Vec3 | null = null;
  let maxArea = 0;
  for (const point of vertices) {
    const cross = cross3(direction, subtract3(point, first));
    const area = dot3(cross, cross);
    if (area > maxArea) {
      maxArea = area;
      third = point;
    }
  }
  return maxArea > 1e-16 && third !== null ? [first, second, third] : null;
}

/**
 * Materialize one swept position as three stable edge/vertex anchors plus a
 * regular saved section. No schema migration and no transient command spam.
 */
export function saveSolidSectionSweep(input: {
  readonly current: Solid3DRecord;
  readonly starting: Solid3DRecord;
  readonly pointIds: PointIds;
  readonly offset: number;
  readonly token: string;
}): SaveSolidSectionSweepResult {
  const { current, starting, pointIds, offset, token } = input;
  if (!sameSource(current, starting, pointIds)) return { status: "error", code: "invalid-source" };
  if (current.sections.length >= 8 || current.points.length + 3 > 32)
    return { status: "error", code: "limit" };
  const swept = previewSolidSectionSweep(current, pointIds, offset);
  const topology = createSolidTopology(current.definition);
  if (swept === null || swept.section === null || topology === null)
    return { status: "error", code: "outside" };
  const triple = nonCollinearVertices(swept.section);
  if (triple === null) return { status: "error", code: "outside" };
  const extent = Math.max(
    1,
    ...topology.vertices.map((vertex) =>
      Math.hypot(vertex.position.x, vertex.position.y, vertex.position.z),
    ),
  );
  const anchors = triple.map((vertex) => anchorOnBoundary(topology, vertex, extent * 1e-6));
  if (anchors.some((anchor) => anchor === null)) return { status: "error", code: "outside" };
  const newPoints = triple.map((position, i): Solid3DPoint => ({
    id: solidPointId(`solid-point:sweep:${token}:${i}`),
    label: `T${i + 1}`,
    position,
    anchor: anchors[i]!,
  }));
  const ids = newPoints.map(({ id }) => id) as unknown as PointIds;
  const sectionId = solidSectionId(`solid-section:sweep:${token}`);
  if (
    current.points.some((point) => ids.includes(point.id)) ||
    current.sections.some((section) => section.id === sectionId)
  ) return { status: "error", code: "invalid-source" };
  const record: Solid3DRecord = {
    ...current,
    points: [...current.points, ...newPoints],
    sections: [...current.sections, {
      algorithmVersion: "polyhedron-plane/1",
      id: sectionId,
      pointIds: ids,
      visible: true,
    }],
  };
  return { status: "ok", record, sectionId, pointIds: ids, section: swept.section };
}
