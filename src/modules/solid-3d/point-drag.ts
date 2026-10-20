import {
  isSolidSectionHelperPoint,
  reprojectSolid3DRecord,
  decodeTopologyFaceAnchorId,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidPointAnchor,
  type Vec3,
} from "../../core/public";

function anchorRemainsOnSameSupport(
  oldAnchor: SolidPointAnchor,
  nextAnchor: SolidPointAnchor,
): boolean {
  switch (oldAnchor.kind) {
    case "vertex":
      return false;
    case "edge":
      return (
        nextAnchor.kind === "edge" &&
        nextAnchor.edgeId === oldAnchor.edgeId &&
        Number.isFinite(nextAnchor.parameter) &&
        nextAnchor.parameter >= 0 &&
        nextAnchor.parameter <= 1
      );
    case "face":
      return (
        nextAnchor.kind === "face" &&
        decodeTopologyFaceAnchorId(nextAnchor.faceId).faceId ===
          decodeTopologyFaceAnchorId(oldAnchor.faceId).faceId &&
        Number.isFinite(nextAnchor.localCoordinates.x) &&
        Number.isFinite(nextAnchor.localCoordinates.y)
      );
    case "analytic-surface":
      return (
        nextAnchor.kind === "analytic-surface" &&
        nextAnchor.surfaceId === oldAnchor.surfaceId &&
        nextAnchor.parameters.every(Number.isFinite)
      );
  }
}

/**
 * Apply a single finished gesture to the newest record, preserving concurrent
 * edits to unrelated points/sections. A changed source point or solid geometry
 * invalidates the gesture rather than overwriting remote work.
 */
export function applySolidPointDrag(
  current: Solid3DRecord,
  startingRecord: Solid3DRecord,
  pointId: string,
  position: Vec3,
  anchor: SolidPointAnchor,
): Solid3DRecord | null {
  if (
    current.id !== startingRecord.id ||
    JSON.stringify(current.definition) !==
      JSON.stringify(startingRecord.definition)
  )
    return null;
  const expected = startingRecord.points.find(({ id }) => id === pointId);
  const actual = current.points.find(({ id }) => id === pointId);
  if (
    expected === undefined ||
    actual === undefined ||
    isSolidSectionHelperPoint(actual) ||
    actual.anchor.kind === "vertex" ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    return null;
  if (
    ![position.x, position.y, position.z].every(Number.isFinite) ||
    !anchorRemainsOnSameSupport(expected.anchor, anchor)
  )
    return null;
  const moved: Solid3DPoint = { ...actual, position, anchor };
  if (JSON.stringify(moved) === JSON.stringify(actual)) return null;
  const updated = {
    ...current,
    points: current.points.map((point) =>
      point.id === actual.id ? moved : point,
    ),
  };
  return reprojectSolid3DRecord(updated, updated.definition);
}
