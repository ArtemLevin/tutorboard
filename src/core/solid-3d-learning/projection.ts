import type {
  SolidSectionResult,
  SolidTopology,
  Vec3,
} from "../solid-3d/public";

export type SolidCameraPreset = "isometric" | "front" | "top" | "side";

export interface SolidProjectionNode {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export interface SolidProjectionEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly hidden: boolean;
}

export interface SolidProjectionViewModel {
  readonly preset: SolidCameraPreset;
  readonly nodes: readonly SolidProjectionNode[];
  readonly edges: readonly SolidProjectionEdge[];
  readonly sectionPath: readonly { readonly x: number; readonly y: number }[];
  readonly viewBox: readonly [number, number, number, number];
}

function axes(preset: SolidCameraPreset): readonly [Vec3, Vec3, Vec3] {
  if (preset === "front")
    return [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ];
  if (preset === "top")
    return [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
    ];
  if (preset === "side")
    return [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: -1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
  const inverse = 1 / Math.sqrt(2);
  return [
    { x: inverse, y: 0, z: -inverse },
    { x: -0.36, y: 0.86, z: -0.36 },
    { x: 0.61, y: 0.51, z: 0.61 },
  ];
}

function dot(point: Vec3, axis: Vec3): number {
  return point.x * axis.x + point.y * axis.y + point.z * axis.z;
}

function projected(point: Vec3, preset: SolidCameraPreset) {
  const [xAxis, yAxis, depthAxis] = axes(preset);
  return {
    depth: dot(point, depthAxis),
    x: dot(point, xAxis),
    y: dot(point, yAxis),
  };
}

export function buildSolidProjectionViewModel(
  topology: SolidTopology,
  preset: SolidCameraPreset,
  section: SolidSectionResult | null = null,
): SolidProjectionViewModel {
  const nodes = topology.vertices.map((vertex) => ({
    ...projected(vertex.position, preset),
    id: vertex.id,
    label: vertex.label,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depthValues = nodes.map(({ depth }) => depth);
  const middleDepth = (Math.min(...depthValues) + Math.max(...depthValues)) / 2;
  const edges = topology.edges.map((edge) => ({
    from: edge.startVertexId,
    hidden:
      ((byId.get(edge.startVertexId)?.depth ?? 0) +
        (byId.get(edge.endVertexId)?.depth ?? 0)) /
        2 <
      middleDepth,
    id: edge.id,
    to: edge.endVertexId,
  }));
  const sectionPath =
    section?.vertices.map((point) => {
      const value = projected(point, preset);
      return { x: value.x, y: value.y };
    }) ?? [];
  const coordinates = [...nodes.map(({ x, y }) => ({ x, y })), ...sectionPath];
  const minX = Math.min(...coordinates.map(({ x }) => x), -1);
  const maxX = Math.max(...coordinates.map(({ x }) => x), 1);
  const minY = Math.min(...coordinates.map(({ y }) => y), -1);
  const maxY = Math.max(...coordinates.map(({ y }) => y), 1);
  const padding = Math.max(maxX - minX, maxY - minY) * 0.14;
  return {
    edges,
    nodes,
    preset,
    sectionPath,
    viewBox: [
      minX - padding,
      minY - padding,
      maxX - minX + padding * 2,
      maxY - minY + padding * 2,
    ],
  };
}
