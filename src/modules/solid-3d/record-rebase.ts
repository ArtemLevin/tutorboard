import { validateSolid3DRecord, type Solid3DRecord } from "../../core/public";

type Identified = { readonly id: string };

export type Solid3DRecordRebaseResult =
  | { readonly status: "ok"; readonly record: Solid3DRecord }
  | { readonly status: "unchanged" | "conflict" };

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Three-way merge of stable semantic IDs. The current document determines
 * ordering; local insertions are appended. Every touched ID is compared with
 * the editor snapshot so a concurrent change or deletion cannot be replaced.
 */
function mergeItems<T extends Identified>(
  starting: readonly T[],
  current: readonly T[],
  replacement: readonly T[],
): readonly T[] | null {
  const ids = (items: readonly T[]) => new Set(items.map(({ id }) => id));
  if (
    ids(starting).size !== starting.length ||
    ids(current).size !== current.length ||
    ids(replacement).size !== replacement.length
  )
    return null;

  const before = new Map(starting.map((item) => [item.id, item]));
  const latest = new Map(current.map((item) => [item.id, item]));
  const wanted = new Map(replacement.map((item) => [item.id, item]));
  const changes = new Map<string, T | undefined>();

  for (const id of new Set([...before.keys(), ...wanted.keys()])) {
    const original = before.get(id);
    const proposed = wanted.get(id);
    if (equal(original, proposed)) continue;
    const actual = latest.get(id);
    if (!equal(original, actual)) {
      if (!equal(proposed, actual)) return null;
      continue; // Already applied by a concurrent update.
    }
    changes.set(id, proposed);
  }

  const merged = current
    .filter(
      (item) => !changes.has(item.id) || changes.get(item.id) !== undefined,
    )
    .map((item) => changes.get(item.id) ?? item);
  for (const item of replacement) {
    if (!latest.has(item.id) && changes.get(item.id) === item)
      merged.push(item);
  }
  return merged;
}

function sameOwnership(left: Solid3DRecord, right: Solid3DRecord): boolean {
  return (
    left.id === right.id &&
    left.rootGroupId === right.rootGroupId &&
    left.schemaVersion === right.schemaVersion &&
    equal(left.boardObjectIds, right.boardObjectIds) &&
    equal(left.source, right.source)
  );
}

/**
 * Rebase an editor's finished action against the authoritative document.
 * Shape changes are atomic (anchors depend on geometry). Point and section
 * edits may be combined only when they touch independent semantic IDs.
 * A failed rebase never issues a command or silently drops remote work.
 */
export function rebaseSolid3DRecordUpdate(input: {
  readonly starting: Solid3DRecord;
  readonly current: Solid3DRecord;
  readonly replacement: Solid3DRecord;
}): Solid3DRecordRebaseResult {
  const { starting, current, replacement } = input;
  if (
    !sameOwnership(starting, current) ||
    !sameOwnership(starting, replacement)
  )
    return { status: "conflict" };

  if (equal(starting, replacement)) return { status: "unchanged" };
  if (!equal(current.definition, starting.definition)) {
    return { status: "conflict" };
  }
  if (!equal(starting.definition, replacement.definition)) {
    // A resize/reconstruction may reproject or discard *all* anchored data.
    if (!equal(current, starting)) return { status: "conflict" };
    return validateSolid3DRecord(replacement).length === 0
      ? { status: "ok", record: replacement }
      : { status: "conflict" };
  }

  const pointChanges = mergeItems(
    starting.points,
    current.points,
    replacement.points,
  );
  const sectionChanges = mergeItems(
    starting.sections,
    current.sections,
    replacement.sections,
  );
  const measurementChanges = mergeItems(
    starting.measurements ?? [],
    current.measurements ?? [],
    replacement.measurements ?? [],
  );
  const angleChanges = mergeItems(
    starting.angleMeasurements ?? [],
    current.angleMeasurements ?? [],
    replacement.angleMeasurements ?? [],
  );
  const linePlaneChanges = mergeItems(
    starting.linePlaneMeasurements ?? [],
    current.linePlaneMeasurements ?? [],
    replacement.linePlaneMeasurements ?? [],
  );
  const dihedralChanges = mergeItems(
    starting.dihedralMeasurements ?? [],
    current.dihedralMeasurements ?? [],
    replacement.dihedralMeasurements ?? [],
  );
  if (
    pointChanges === null ||
    sectionChanges === null ||
    measurementChanges === null ||
    angleChanges === null ||
    linePlaneChanges === null ||
    dihedralChanges === null
  )
    return { status: "conflict" };

  // An added or modified section was calculated from its source points.
  // Recomputing it implicitly from concurrently moved points changes the
  // teacher's intended plane, even if all IDs still resolve successfully.
  for (const section of replacement.sections) {
    const original = starting.sections.find(({ id }) => id === section.id);
    if (equal(original, section)) continue;
    if (
      section.pointIds.some((id) => {
        const initial = starting.points.find((point) => point.id === id);
        const latest = current.points.find((point) => point.id === id);
        return initial !== undefined && !equal(initial, latest);
      })
    )
      return { status: "conflict" };
  }

  const projectionChanged = !equal(starting.projection, replacement.projection);
  if (
    projectionChanged &&
    !equal(current.projection, starting.projection) &&
    !equal(current.projection, replacement.projection)
  )
    return { status: "conflict" };

  const merged: Solid3DRecord = {
    ...current,
    points: pointChanges,
    sections: sectionChanges,
    ...(measurementChanges.length > 0 ||
    current.measurements !== undefined ||
    replacement.measurements !== undefined
      ? { measurements: measurementChanges }
      : {}),
    ...(angleChanges.length > 0 ||
    current.angleMeasurements !== undefined ||
    replacement.angleMeasurements !== undefined
      ? { angleMeasurements: angleChanges }
      : {}),
    ...(linePlaneChanges.length > 0 ||
    current.linePlaneMeasurements !== undefined ||
    replacement.linePlaneMeasurements !== undefined
      ? { linePlaneMeasurements: linePlaneChanges }
      : {}),
    ...(dihedralChanges.length > 0 ||
    current.dihedralMeasurements !== undefined ||
    replacement.dihedralMeasurements !== undefined
      ? { dihedralMeasurements: dihedralChanges }
      : {}),
    projection: projectionChanged ? replacement.projection : current.projection,
  };
  if (validateSolid3DRecord(merged).length > 0) return { status: "conflict" };
  return equal(current, merged)
    ? { status: "unchanged" }
    : { status: "ok", record: merged };
}
