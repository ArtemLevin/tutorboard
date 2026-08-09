import {
  regularBase,
  solidDefinitionFromTemplate,
  type RegularPolyhedronVariant,
  type Solid3DDefinition,
  type Solid3DRecord,
} from "./definitions";
import type { Vec2 } from "./vectors";

export type SolidConstructionKind =
  | "cone"
  | "cube"
  | "cuboid"
  | "cylinder"
  | "dodecahedron"
  | "hemisphere"
  | "icosahedron"
  | "octahedron"
  | "prism"
  | "pyramid"
  | "sphere"
  | "tetrahedron"
  | "truncated-cone"
  | "truncated-pyramid";

export interface SolidBaseValidation {
  readonly code:
    | "base.ok"
    | "base.too-few-vertices"
    | "base.non-finite"
    | "base.zero-area"
    | "base.self-intersection";
  readonly valid: boolean;
}

const orientation = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function polygonSignedArea(base: readonly Vec2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < base.length; index += 1) {
    const current = base[index]!;
    const next = base[(index + 1) % base.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

export function validateSolidConstructionBase(
  base: readonly Vec2[],
): SolidBaseValidation {
  if (base.length < 3)
    return { code: "base.too-few-vertices", valid: false };
  if (
    base.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return { code: "base.non-finite", valid: false };
  if (Math.abs(polygonSignedArea(base)) <= 1e-8)
    return { code: "base.zero-area", valid: false };
  for (let first = 0; first < base.length; first += 1) {
    const firstNext = (first + 1) % base.length;
    for (let second = first + 1; second < base.length; second += 1) {
      const secondNext = (second + 1) % base.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      )
        continue;
      if (
        segmentsIntersect(
          base[first]!,
          base[firstNext]!,
          base[second]!,
          base[secondNext]!,
        )
      )
        return { code: "base.self-intersection", valid: false };
    }
  }
  return { code: "base.ok", valid: true };
}

function regularPolyhedron(
  variant: RegularPolyhedronVariant,
): Solid3DDefinition {
  if (variant === "tetrahedron")
    return { edgeLength: 2.6, kind: "tetrahedron" };
  if (variant === "octahedron")
    return { edgeLength: 2.6, kind: "octahedron" };
  if (variant === "cube") return { edgeLength: 2, kind: "cube" };
  return { edgeLength: 2, kind: "regular-polyhedron", variant };
}

export function definitionForSolidConstruction(
  kind: SolidConstructionKind,
  sides = 4,
): Solid3DDefinition {
  const safeSides = Math.max(3, Math.min(32, Math.round(sides)));
  switch (kind) {
    case "tetrahedron":
    case "cube":
    case "octahedron":
    case "dodecahedron":
    case "icosahedron":
      return regularPolyhedron(kind);
    case "prism":
      return {
        base: regularBase(safeSides, 1.25),
        height: 2.5,
        kind: "prism",
      };
    case "pyramid":
      return {
        apex: { x: 0, y: 2.7, z: 0 },
        base: regularBase(safeSides, 1.35),
        kind: "pyramid",
      };
    case "truncated-pyramid":
      return {
        bottomBase: regularBase(safeSides, 1.35),
        height: 2.8,
        kind: "truncated-pyramid",
        topBase: regularBase(safeSides, 0.75),
      };
    case "truncated-cone":
      return solidDefinitionFromTemplate("frustum")!;
    default:
      return solidDefinitionFromTemplate(kind)!;
  }
}

export function constructionKindFromDefinition(
  definition: Solid3DDefinition,
): SolidConstructionKind {
  return definition.kind === "regular-polyhedron"
    ? definition.variant
    : definition.kind;
}

export function constructionSideCount(
  definition: Solid3DDefinition,
): number | null {
  switch (definition.kind) {
    case "prism":
    case "pyramid":
      return definition.base.length;
    case "truncated-pyramid":
      return definition.bottomBase.length;
    default:
      return null;
  }
}

export function replaceSolidConstructionDefinition(
  record: Solid3DRecord,
  definition: Solid3DDefinition,
): Solid3DRecord {
  return {
    ...record,
    definition,
    points: [],
    sections: [],
  };
}

export function replaceSolidConstructionBase(
  record: Solid3DRecord,
  base: readonly Vec2[],
  topBase?: readonly Vec2[],
): Solid3DRecord | null {
  if (!validateSolidConstructionBase(base).valid) return null;
  const definition = record.definition;
  if (definition.kind === "prism")
    return replaceSolidConstructionDefinition(record, { ...definition, base });
  if (definition.kind === "pyramid")
    return replaceSolidConstructionDefinition(record, { ...definition, base });
  if (definition.kind !== "truncated-pyramid") return null;
  const nextTop = topBase ?? definition.topBase;
  if (
    nextTop.length !== base.length ||
    !validateSolidConstructionBase(nextTop).valid
  )
    return null;
  return replaceSolidConstructionDefinition(record, {
    ...definition,
    bottomBase: base,
    topBase: nextTop,
  });
}
