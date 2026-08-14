import type { BoardObject, Vec2 } from "../../../core/public";

export type SmartInkRelationKind = "near" | "touches";

export interface SmartInkRelation {
  readonly kind: SmartInkRelationKind;
  readonly leftId: string;
  readonly rightId: string;
  readonly score: number;
}

function objectAnchor(object: BoardObject): Vec2 {
  return object.position;
}

export function buildSmartInkRelationGraph(
  objects: readonly BoardObject[],
): readonly SmartInkRelation[] {
  const output: SmartInkRelation[] = [];
  for (let left = 0; left < objects.length; left += 1) {
    for (let right = left + 1; right < objects.length; right += 1) {
      const a = objects[left]!;
      const b = objects[right]!;
      const distance = Math.hypot(
        objectAnchor(a).x - objectAnchor(b).x,
        objectAnchor(a).y - objectAnchor(b).y,
      );
      const score = Math.max(0, 1 - distance / 240);
      if (score <= 0) continue;
      output.push({
        kind: score >= 0.85 ? "touches" : "near",
        leftId: a.id,
        rightId: b.id,
        score,
      });
    }
  }
  return output;
}
