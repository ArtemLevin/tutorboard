import type {
  Solid3DDefinition,
  SolidPointAnchor,
  SolidTopology,
} from "./definitions";
import { add3, scale3, subtract3, type Vec3 } from "./vectors";

export type SolidAnalyticSurfaceId =
  | "surface:sphere"
  | "surface:hemisphere-curved"
  | "surface:hemisphere-base"
  | "surface:cylinder-side"
  | "surface:cylinder-bottom"
  | "surface:cylinder-top"
  | "surface:cone-side"
  | "surface:cone-base"
  | "surface:truncated-cone-side"
  | "surface:truncated-cone-bottom"
  | "surface:truncated-cone-top";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const finiteParameter = (
  parameters: readonly number[],
  index: number,
): number | null => {
  const value = parameters[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

function diskPoint(
  radius: number,
  y: number,
  parameters: readonly number[],
): Vec3 | null {
  const angle = finiteParameter(parameters, 0);
  const radialParameter = finiteParameter(parameters, 1);
  if (angle === null || radialParameter === null) return null;
  const radial = clamp01(radialParameter) * radius;
  return {
    x: Math.cos(angle) * radial,
    y,
    z: Math.sin(angle) * radial,
  };
}

function sphericalPoint(
  radius: number,
  parameters: readonly number[],
  maximumPolarAngle: number,
): Vec3 | null {
  const azimuth = finiteParameter(parameters, 0);
  const polarAngle = finiteParameter(parameters, 1);
  if (azimuth === null || polarAngle === null) return null;
  const polar = Math.min(maximumPolarAngle, Math.max(0, polarAngle));
  const horizontalRadius = radius * Math.sin(polar);
  return {
    x: horizontalRadius * Math.cos(azimuth),
    y: radius * Math.cos(polar),
    z: horizontalRadius * Math.sin(azimuth),
  };
}

function revolutionSidePoint(
  bottomRadius: number,
  topRadius: number,
  height: number,
  parameters: readonly number[],
): Vec3 | null {
  const angle = finiteParameter(parameters, 0);
  const heightParameter = finiteParameter(parameters, 1);
  if (angle === null || heightParameter === null) return null;
  const progress = clamp01(heightParameter);
  const radius = bottomRadius + (topRadius - bottomRadius) * progress;
  return {
    x: Math.cos(angle) * radius,
    y: -height / 2 + height * progress,
    z: Math.sin(angle) * radius,
  };
}

export function analyticSurfaceIds(
  definition: Solid3DDefinition,
): readonly SolidAnalyticSurfaceId[] {
  switch (definition.kind) {
    case "sphere":
      return ["surface:sphere"];
    case "hemisphere":
      return ["surface:hemisphere-curved", "surface:hemisphere-base"];
    case "cylinder":
      return [
        "surface:cylinder-side",
        "surface:cylinder-bottom",
        "surface:cylinder-top",
      ];
    case "cone":
      return ["surface:cone-side", "surface:cone-base"];
    case "truncated-cone":
      return [
        "surface:truncated-cone-side",
        "surface:truncated-cone-bottom",
        "surface:truncated-cone-top",
      ];
    case "cube":
    case "cuboid":
    case "octahedron":
    case "prism":
    case "pyramid":
    case "regular-polyhedron":
    case "tetrahedron":
    case "truncated-pyramid":
      return [];
  }
}

export function resolveAnalyticSolidPointAnchor(
  definition: Solid3DDefinition,
  anchor: SolidPointAnchor,
): Vec3 | null {
  if (anchor.kind !== "analytic-surface") return null;
  switch (definition.kind) {
    case "sphere":
      return anchor.surfaceId === "surface:sphere"
        ? sphericalPoint(definition.radius, anchor.parameters, Math.PI)
        : null;
    case "hemisphere":
      if (anchor.surfaceId === "surface:hemisphere-curved")
        return sphericalPoint(
          definition.radius,
          anchor.parameters,
          Math.PI / 2,
        );
      return anchor.surfaceId === "surface:hemisphere-base"
        ? diskPoint(definition.radius, 0, anchor.parameters)
        : null;
    case "cylinder":
      if (anchor.surfaceId === "surface:cylinder-side")
        return revolutionSidePoint(
          definition.radius,
          definition.radius,
          definition.height,
          anchor.parameters,
        );
      if (anchor.surfaceId === "surface:cylinder-bottom")
        return diskPoint(
          definition.radius,
          -definition.height / 2,
          anchor.parameters,
        );
      return anchor.surfaceId === "surface:cylinder-top"
        ? diskPoint(definition.radius, definition.height / 2, anchor.parameters)
        : null;
    case "cone":
      if (anchor.surfaceId === "surface:cone-side")
        return revolutionSidePoint(
          definition.radius,
          0,
          definition.height,
          anchor.parameters,
        );
      return anchor.surfaceId === "surface:cone-base"
        ? diskPoint(
            definition.radius,
            -definition.height / 2,
            anchor.parameters,
          )
        : null;
    case "truncated-cone":
      if (anchor.surfaceId === "surface:truncated-cone-side")
        return revolutionSidePoint(
          definition.bottomRadius,
          definition.topRadius,
          definition.height,
          anchor.parameters,
        );
      if (anchor.surfaceId === "surface:truncated-cone-bottom")
        return diskPoint(
          definition.bottomRadius,
          -definition.height / 2,
          anchor.parameters,
        );
      return anchor.surfaceId === "surface:truncated-cone-top"
        ? diskPoint(
            definition.topRadius,
            definition.height / 2,
            anchor.parameters,
          )
        : null;
    case "cube":
    case "cuboid":
    case "octahedron":
    case "prism":
    case "pyramid":
    case "regular-polyhedron":
    case "tetrahedron":
    case "truncated-pyramid":
      return null;
  }
}

export function resolveSolidPointAnchor(
  topology: SolidTopology,
  anchor: SolidPointAnchor,
): Vec3 | null {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  if (anchor.kind === "vertex") return vertices.get(anchor.vertexId) ?? null;
  if (anchor.kind === "edge") {
    const edge = topology.edges.find((item) => item.id === anchor.edgeId);
    if (edge === undefined) return null;
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    return add3(
      start,
      scale3(subtract3(end, start), Math.min(1, Math.max(0, anchor.parameter))),
    );
  }
  if (anchor.kind === "face") {
    const face = topology.faces.find((item) => item.id === anchor.faceId);
    if (face === undefined || face.vertexIds.length < 3) return null;
    const first = vertices.get(face.vertexIds[0]!)!;
    const second = vertices.get(face.vertexIds[1]!)!;
    const third = vertices.get(face.vertexIds[2]!)!;
    return add3(
      first,
      add3(
        scale3(subtract3(second, first), anchor.localCoordinates.x),
        scale3(subtract3(third, first), anchor.localCoordinates.y),
      ),
    );
  }
  return null;
}
