import type {
  BoardObjectId,
  GeometryImportId,
  GroupId,
  Solid3DId,
  SolidPointId,
  SolidSectionId,
} from "../board/identifiers";
import type { Vec2, Vec3 } from "./vectors";

export interface CubeDefinition {
  readonly kind: "cube";
  readonly edgeLength: number;
}
export interface CuboidDefinition {
  readonly kind: "cuboid";
  readonly size: Vec3;
}
export interface TetrahedronDefinition {
  readonly kind: "tetrahedron";
  readonly edgeLength: number;
}
export interface OctahedronDefinition {
  readonly kind: "octahedron";
  readonly edgeLength: number;
}
export type RegularPolyhedronVariant =
  | "tetrahedron"
  | "cube"
  | "octahedron"
  | "dodecahedron"
  | "icosahedron";
export interface RegularPolyhedronDefinition {
  readonly kind: "regular-polyhedron";
  readonly variant: RegularPolyhedronVariant;
  readonly edgeLength: number;
}
export interface PrismDefinition {
  readonly kind: "prism";
  readonly base: readonly Vec2[];
  readonly height: number;
}
export interface PyramidDefinition {
  readonly kind: "pyramid";
  readonly base: readonly Vec2[];
  readonly apex: Vec3;
}
export interface TruncatedPyramidDefinition {
  readonly kind: "truncated-pyramid";
  readonly bottomBase: readonly Vec2[];
  readonly topBase: readonly Vec2[];
  readonly height: number;
}
export interface CylinderDefinition {
  readonly kind: "cylinder";
  readonly radius: number;
  readonly height: number;
}
export interface ConeDefinition {
  readonly kind: "cone";
  readonly radius: number;
  readonly height: number;
}
export interface TruncatedConeDefinition {
  readonly kind: "truncated-cone";
  readonly bottomRadius: number;
  readonly topRadius: number;
  readonly height: number;
}
export interface SphereDefinition {
  readonly kind: "sphere";
  readonly radius: number;
}
export interface HemisphereDefinition {
  readonly kind: "hemisphere";
  readonly radius: number;
}

export type Solid3DDefinition =
  | ConeDefinition
  | CubeDefinition
  | CuboidDefinition
  | CylinderDefinition
  | HemisphereDefinition
  | OctahedronDefinition
  | PrismDefinition
  | PyramidDefinition
  | RegularPolyhedronDefinition
  | SphereDefinition
  | TetrahedronDefinition
  | TruncatedConeDefinition
  | TruncatedPyramidDefinition;

export interface SolidVertex {
  readonly id: string;
  readonly label: string;
  readonly position: Vec3;
}
export interface SolidEdge {
  readonly id: string;
  readonly startVertexId: string;
  readonly endVertexId: string;
}
export interface SolidFace {
  readonly id: string;
  readonly vertexIds: readonly string[];
  readonly edgeIds: readonly string[];
}
export interface SolidTopology {
  readonly vertices: readonly SolidVertex[];
  readonly edges: readonly SolidEdge[];
  readonly faces: readonly SolidFace[];
}

export type SolidPointAnchor =
  | { readonly kind: "vertex"; readonly vertexId: string }
  | {
      readonly kind: "edge";
      readonly edgeId: string;
      readonly parameter: number;
    }
  | {
      readonly kind: "face";
      readonly faceId: string;
      readonly localCoordinates: Vec2;
    }
  | {
      readonly kind: "analytic-surface";
      readonly surfaceId: string;
      readonly parameters: readonly number[];
    };

export interface Solid3DPoint {
  readonly id: SolidPointId;
  readonly label: string;
  readonly position: Vec3;
  readonly anchor: SolidPointAnchor;
}

export interface Solid3DSectionDefinition {
  readonly id: SolidSectionId;
  readonly pointIds: readonly [SolidPointId, SolidPointId, SolidPointId];
  readonly algorithmVersion: "polyhedron-plane/1" | "analytic-plane/1";
  readonly visible: boolean;
}

export interface Solid3DBoardProjection {
  readonly kind: "orthographic" | "oblique" | "perspective";
  readonly matrix: readonly number[];
  readonly viewportScale: number;
  readonly origin: Vec2;
  readonly hiddenEdgePolicy: "dashed" | "hidden";
}

export interface Solid3DRecord {
  readonly id: Solid3DId;
  readonly rootGroupId: GroupId;
  readonly boardObjectIds: readonly BoardObjectId[];
  readonly source:
    | { readonly kind: "text-template"; readonly templateId: string }
    | { readonly kind: "smart-ink"; readonly recognizerVersion: string }
    | { readonly kind: "geometryos"; readonly importId: GeometryImportId };
  readonly definition: Solid3DDefinition;
  readonly projection: Solid3DBoardProjection;
  readonly points: readonly Solid3DPoint[];
  readonly sections: readonly Solid3DSectionDefinition[];
  readonly schemaVersion: "1.0";
}

export const defaultSolidProjection: Solid3DBoardProjection = {
  hiddenEdgePolicy: "dashed",
  kind: "oblique",
  matrix: [1, 0, 0.42, 0, -1, -0.32],
  origin: { x: 0, y: 0 },
  viewportScale: 1,
};

export function regularBase(sides: number, radius = 1): readonly Vec2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function regularTruncatedPyramid(sides: number): TruncatedPyramidDefinition {
  return {
    bottomBase: regularBase(sides, 1.35),
    height: 2.8,
    kind: "truncated-pyramid",
    topBase: regularBase(sides, 0.75),
  };
}

export function solidDefinitionFromTemplate(
  templateId: string,
): Solid3DDefinition | null {
  if (templateId === "cube") return { edgeLength: 2, kind: "cube" };
  if (templateId === "cuboid")
    return { kind: "cuboid", size: { x: 3, y: 2, z: 1.7 } };
  if (templateId === "tetrahedron")
    return { edgeLength: 2.6, kind: "tetrahedron" };
  if (templateId === "octahedron")
    return { edgeLength: 2.6, kind: "octahedron" };
  if (templateId === "dodecahedron")
    return {
      edgeLength: 2,
      kind: "regular-polyhedron",
      variant: "dodecahedron",
    };
  if (templateId === "icosahedron")
    return {
      edgeLength: 2,
      kind: "regular-polyhedron",
      variant: "icosahedron",
    };
  if (templateId === "cylinder")
    return { height: 3, kind: "cylinder", radius: 1.2 };
  if (templateId === "cone")
    return { height: 3, kind: "cone", radius: 1.3 };
  if (templateId === "frustum")
    return {
      bottomRadius: 1.35,
      height: 2.8,
      kind: "truncated-cone",
      topRadius: 0.75,
    };
  if (templateId === "sphere") return { kind: "sphere", radius: 1.4 };
  if (templateId === "hemisphere") return { kind: "hemisphere", radius: 1.4 };
  if (templateId === "truncated-pyramid") return regularTruncatedPyramid(4);
  const truncatedPyramid = /^truncated-pyramid-(\d+)$/u.exec(templateId)?.[1];
  if (truncatedPyramid !== undefined) {
    const sides = Number(truncatedPyramid);
    return sides >= 3 && sides <= 32 ? regularTruncatedPyramid(sides) : null;
  }
  const prism = /^prism-(\d+)$/u.exec(templateId)?.[1];
  if (prism !== undefined) {
    const sides = Number(prism);
    return sides >= 3 && sides <= 32
      ? { base: regularBase(sides, 1.25), height: 2.5, kind: "prism" }
      : null;
  }
  const pyramid = /^pyramid-(\d+)$/u.exec(templateId)?.[1];
  if (pyramid !== undefined) {
    const sides = Number(pyramid);
    return sides >= 3 && sides <= 32
      ? {
          apex: { x: 0, y: 2.7, z: 0 },
          base: regularBase(sides, 1.35),
          kind: "pyramid",
        }
      : null;
  }
  return null;
}
