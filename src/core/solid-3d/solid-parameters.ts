import type {
  Solid3DDefinition,
  Solid3DRecord,
} from "./definitions";
import { reprojectSolid3DRecord } from "./point-resolution";
import type { Vec2 } from "./vectors";

export type SolidEditableParameterKey =
  | "edgeLength"
  | "sizeX"
  | "sizeY"
  | "sizeZ"
  | "radius"
  | "height"
  | "bottomRadius"
  | "topRadius"
  | "baseRadius"
  | "bottomBaseRadius"
  | "topBaseRadius";

export interface SolidEditableParameter {
  readonly key: SolidEditableParameterKey;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const minimumDimension = 0.01;
const maximumDimension = 10_000;

function parameter(
  key: SolidEditableParameterKey,
  label: string,
  value: number,
): SolidEditableParameter {
  return {
    key,
    label,
    max: maximumDimension,
    min: minimumDimension,
    step: Math.max(0.01, Math.min(1, Math.abs(value) / 20)),
    value,
  };
}

function baseRadius(base: readonly Vec2[]): number {
  return base.reduce(
    (maximum, point) => Math.max(maximum, Math.hypot(point.x, point.y)),
    0,
  );
}

function scaledBase(
  base: readonly Vec2[],
  radius: number,
): readonly Vec2[] | null {
  const currentRadius = baseRadius(base);
  if (!(currentRadius > 1e-12) || !Number.isFinite(currentRadius)) return null;
  const scale = radius / currentRadius;
  return base.map((point) => ({ x: point.x * scale, y: point.y * scale }));
}

function validDimension(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= minimumDimension &&
    value <= maximumDimension
  );
}

export function solidEditableParameters(
  definition: Solid3DDefinition,
): readonly SolidEditableParameter[] {
  switch (definition.kind) {
    case "cube":
    case "tetrahedron":
    case "octahedron":
    case "regular-polyhedron":
      return [parameter("edgeLength", "Длина ребра", definition.edgeLength)];
    case "cuboid":
      return [
        parameter("sizeX", "Размер X", definition.size.x),
        parameter("sizeY", "Размер Y", definition.size.y),
        parameter("sizeZ", "Размер Z", definition.size.z),
      ];
    case "prism":
      return [
        parameter("height", "Высота", definition.height),
        parameter("baseRadius", "Масштаб основания", baseRadius(definition.base)),
      ];
    case "pyramid":
      return [
        parameter("height", "Высота", Math.abs(definition.apex.y)),
        parameter("baseRadius", "Масштаб основания", baseRadius(definition.base)),
      ];
    case "truncated-pyramid":
      return [
        parameter("height", "Высота", definition.height),
        parameter(
          "bottomBaseRadius",
          "Нижнее основание",
          baseRadius(definition.bottomBase),
        ),
        parameter(
          "topBaseRadius",
          "Верхнее основание",
          baseRadius(definition.topBase),
        ),
      ];
    case "cylinder":
    case "cone":
      return [
        parameter("radius", "Радиус", definition.radius),
        parameter("height", "Высота", definition.height),
      ];
    case "truncated-cone":
      return [
        parameter("bottomRadius", "Нижний радиус", definition.bottomRadius),
        parameter("topRadius", "Верхний радиус", definition.topRadius),
        parameter("height", "Высота", definition.height),
      ];
    case "sphere":
    case "hemisphere":
      return [parameter("radius", "Радиус", definition.radius)];
  }
}

export function updateSolidDefinitionParameter(
  definition: Solid3DDefinition,
  key: SolidEditableParameterKey,
  value: number,
): Solid3DDefinition | null {
  if (!validDimension(value)) return null;
  switch (definition.kind) {
    case "cube":
    case "tetrahedron":
    case "octahedron":
      return key === "edgeLength" ? { ...definition, edgeLength: value } : null;
    case "regular-polyhedron":
      return key === "edgeLength" ? { ...definition, edgeLength: value } : null;
    case "cuboid":
      if (key === "sizeX")
        return { ...definition, size: { ...definition.size, x: value } };
      if (key === "sizeY")
        return { ...definition, size: { ...definition.size, y: value } };
      return key === "sizeZ"
        ? { ...definition, size: { ...definition.size, z: value } }
        : null;
    case "prism": {
      if (key === "height") return { ...definition, height: value };
      if (key !== "baseRadius") return null;
      const base = scaledBase(definition.base, value);
      return base === null ? null : { ...definition, base };
    }
    case "pyramid": {
      if (key === "height")
        return {
          ...definition,
          apex: {
            ...definition.apex,
            y: (definition.apex.y < 0 ? -1 : 1) * value,
          },
        };
      if (key !== "baseRadius") return null;
      const base = scaledBase(definition.base, value);
      return base === null ? null : { ...definition, base };
    }
    case "truncated-pyramid": {
      if (key === "height") return { ...definition, height: value };
      if (key === "bottomBaseRadius") {
        const bottomBase = scaledBase(definition.bottomBase, value);
        return bottomBase === null ? null : { ...definition, bottomBase };
      }
      if (key === "topBaseRadius") {
        const topBase = scaledBase(definition.topBase, value);
        return topBase === null ? null : { ...definition, topBase };
      }
      return null;
    }
    case "cylinder":
    case "cone":
      if (key === "radius") return { ...definition, radius: value };
      return key === "height" ? { ...definition, height: value } : null;
    case "truncated-cone":
      if (key === "bottomRadius")
        return { ...definition, bottomRadius: value };
      if (key === "topRadius") return { ...definition, topRadius: value };
      return key === "height" ? { ...definition, height: value } : null;
    case "sphere":
    case "hemisphere":
      return key === "radius" ? { ...definition, radius: value } : null;
  }
}

export function updateSolidParameter(
  record: Solid3DRecord,
  key: SolidEditableParameterKey,
  value: number,
): Solid3DRecord | null {
  const definition = updateSolidDefinitionParameter(record.definition, key, value);
  return definition === null ? null : reprojectSolid3DRecord(record, definition);
}
