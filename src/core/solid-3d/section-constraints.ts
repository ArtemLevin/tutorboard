import { solidPointId, solidSectionId } from "../board/identifiers";
import type {
  Solid3DDefinition,
  Solid3DPoint,
  Solid3DRecord,
  Solid3DSectionDefinition,
} from "./definitions";
import { createSolidTopology } from "./topology";
import { add3, cross3, normalize3, subtract3, type Vec3 } from "./vectors";

export type SolidSectionConstraint =
  | {
      readonly edgeId: string;
      readonly kind: "through-edge-and-point";
      readonly pointId: string;
    }
  | {
      readonly faceId: string;
      readonly kind: "through-point-parallel-face";
      readonly pointId: string;
    }
  | {
      readonly edgeId: string;
      readonly kind: "through-point-perpendicular-edge";
      readonly pointId: string;
    }
  | {
      readonly kind: "through-point-parallel-surface";
      readonly pointId: string;
      readonly surfaceId: string;
    };

export type SolidSectionConstraintCode = "ep" | "pf" | "pe" | "ps";

export interface MaterializedSolidSectionConstraint {
  readonly helperPoints: readonly Solid3DPoint[];
  readonly section: Solid3DSectionDefinition;
}

const helperPrefix = "solid-point:section-helper:";

const constraintCode = (
  constraint: SolidSectionConstraint,
): SolidSectionConstraintCode => {
  switch (constraint.kind) {
    case "through-edge-and-point":
      return "ep";
    case "through-point-parallel-face":
      return "pf";
    case "through-point-perpendicular-edge":
      return "pe";
    case "through-point-parallel-surface":
      return "ps";
  }
};

export function isSolidSectionHelperPoint(point: Solid3DPoint): boolean {
  return point.id.startsWith(helperPrefix);
}

export function solidSectionHelperCode(
  point: Solid3DPoint,
): SolidSectionConstraintCode | null {
  if (!isSolidSectionHelperPoint(point)) return null;
  const code = point.id.slice(helperPrefix.length).split(":", 1)[0];
  return code === "ep" || code === "pf" || code === "pe" || code === "ps"
    ? code
    : null;
}

export function isSyntheticSolidSectionHelperPoint(
  point: Solid3DPoint,
): boolean {
  const code = solidSectionHelperCode(point);
  return code === "pf" || code === "pe" || code === "ps";
}

function helperId(
  code: SolidSectionConstraintCode,
  token: string,
  role: "a" | "b",
) {
  return solidPointId(`${helperPrefix}${code}:${token}:${role}`);
}

function helperLabel(code: SolidSectionConstraintCode, role: "a" | "b") {
  return `_${code}_${role}`;
}

function topologyFaceDirections(
  definition: Solid3DDefinition,
  faceId: string,
): readonly [Vec3, Vec3] | null {
  const topology = createSolidTopology(definition);
  const face = topology?.faces.find(({ id }) => id === faceId);
  if (topology === null || topology === undefined || face === undefined)
    return null;
  const vertices = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );
  const first = vertices.get(face.vertexIds[0]!);
  const second = vertices.get(face.vertexIds[1]!);
  const third = vertices.get(face.vertexIds[2]!);
  if (first === undefined || second === undefined || third === undefined)
    return null;
  const firstDirection = subtract3(second, first);
  const secondDirection = subtract3(third, first);
  return normalize3(cross3(firstDirection, secondDirection)) === null
    ? null
    : [firstDirection, secondDirection];
}

function topologyEdgeDirection(
  definition: Solid3DDefinition,
  edgeId: string,
): Vec3 | null {
  const topology = createSolidTopology(definition);
  const edge = topology?.edges.find(({ id }) => id === edgeId);
  if (topology === null || topology === undefined || edge === undefined)
    return null;
  const vertices = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );
  const start = vertices.get(edge.startVertexId);
  const end = vertices.get(edge.endVertexId);
  return start === undefined || end === undefined
    ? null
    : normalize3(subtract3(end, start));
}

function perpendicularBasis(direction: Vec3): readonly [Vec3, Vec3] | null {
  const reference =
    Math.abs(direction.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const first = normalize3(cross3(direction, reference));
  if (first === null) return null;
  const second = normalize3(cross3(direction, first));
  return second === null ? null : [first, second];
}

export function isPlanarAnalyticSurfaceId(surfaceId: string): boolean {
  return new Set([
    "surface:hemisphere-base",
    "surface:cylinder-bottom",
    "surface:cylinder-top",
    "surface:cone-base",
    "surface:truncated-cone-bottom",
    "surface:truncated-cone-top",
  ]).has(surfaceId);
}

export function constrainedHelperPositions(
  definition: Solid3DDefinition,
  code: SolidSectionConstraintCode,
  referenceId: string,
  origin: Vec3,
): readonly [Vec3, Vec3] | null {
  if (code === "pf") {
    const directions = topologyFaceDirections(definition, referenceId);
    return directions === null
      ? null
      : [add3(origin, directions[0]), add3(origin, directions[1])];
  }
  if (code === "pe") {
    const direction = topologyEdgeDirection(definition, referenceId);
    const basis = direction === null ? null : perpendicularBasis(direction);
    return basis === null
      ? null
      : [add3(origin, basis[0]), add3(origin, basis[1])];
  }
  if (code === "ps") {
    return isPlanarAnalyticSurfaceId(referenceId)
      ? [add3(origin, { x: 1, y: 0, z: 0 }), add3(origin, { x: 0, y: 0, z: 1 })]
      : null;
  }
  return null;
}

function syntheticHelpers(
  definition: Solid3DDefinition,
  code: "pf" | "pe" | "ps",
  referenceId: string,
  origin: Vec3,
  token: string,
): readonly [Solid3DPoint, Solid3DPoint] | null {
  const positions = constrainedHelperPositions(
    definition,
    code,
    referenceId,
    origin,
  );
  if (positions === null) return null;
  const anchor =
    code === "pf"
      ? ({
          faceId: referenceId,
          kind: "face" as const,
          localCoordinates: { x: 0, y: 0 },
        } as const)
      : code === "pe"
        ? ({
            edgeId: referenceId,
            kind: "edge" as const,
            parameter: 0.5,
          } as const)
        : ({
            kind: "analytic-surface" as const,
            parameters: [],
            surfaceId: referenceId,
          } as const);
  return [
    {
      anchor,
      id: helperId(code, token, "a"),
      label: helperLabel(code, "a"),
      position: positions[0],
    },
    {
      anchor,
      id: helperId(code, token, "b"),
      label: helperLabel(code, "b"),
      position: positions[1],
    },
  ];
}

function edgeHelpers(
  definition: Solid3DDefinition,
  edgeId: string,
  token: string,
): readonly [Solid3DPoint, Solid3DPoint] | null {
  const topology = createSolidTopology(definition);
  const edge = topology?.edges.find(({ id }) => id === edgeId);
  if (topology === null || topology === undefined || edge === undefined)
    return null;
  const vertices = new Map(
    topology.vertices.map((vertex) => [vertex.id, vertex.position]),
  );
  const start = vertices.get(edge.startVertexId);
  const end = vertices.get(edge.endVertexId);
  if (start === undefined || end === undefined) return null;
  return [
    {
      anchor: { kind: "vertex", vertexId: edge.startVertexId },
      id: helperId("ep", token, "a"),
      label: helperLabel("ep", "a"),
      position: start,
    },
    {
      anchor: { kind: "vertex", vertexId: edge.endVertexId },
      id: helperId("ep", token, "b"),
      label: helperLabel("ep", "b"),
      position: end,
    },
  ];
}

export function materializeSolidSectionConstraint(input: {
  readonly constraint: SolidSectionConstraint;
  readonly origin: Vec3;
  readonly record: Solid3DRecord;
  readonly token: string;
}): MaterializedSolidSectionConstraint | null {
  const code = constraintCode(input.constraint);
  const helpers =
    input.constraint.kind === "through-edge-and-point"
      ? edgeHelpers(
          input.record.definition,
          input.constraint.edgeId,
          input.token,
        )
      : input.constraint.kind === "through-point-parallel-face"
        ? syntheticHelpers(
            input.record.definition,
            "pf",
            input.constraint.faceId,
            input.origin,
            input.token,
          )
        : input.constraint.kind === "through-point-perpendicular-edge"
          ? syntheticHelpers(
              input.record.definition,
              "pe",
              input.constraint.edgeId,
              input.origin,
              input.token,
            )
          : syntheticHelpers(
              input.record.definition,
              "ps",
              input.constraint.surfaceId,
              input.origin,
              input.token,
            );
  if (helpers === null) return null;
  return {
    helperPoints: helpers,
    section: {
      algorithmVersion:
        createSolidTopology(input.record.definition) === null
          ? "analytic-plane/1"
          : "polyhedron-plane/1",
      id: solidSectionId(`solid-section:constraint:${code}:${input.token}`),
      pointIds: [
        input.constraint.pointId as Solid3DPoint["id"],
        helpers[0].id,
        helpers[1].id,
      ],
      visible: true,
    },
  };
}
