import type { CoordinatePlotDefinition } from "./coordinate-plot";
import type { BoardObjectId, GeometryImportId, GroupId } from "./identifiers";
import type { Size2, Vec2 } from "./primitives";

export const svgSanitizerPolicyVersion = "tutorboard.svg-sanitizer/1" as const;

export const boardObjectKinds = [
  "drawing.pen-stroke",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
  "image.embedded",
  "svg-import.svg",
  "math.coordinate-plot",
] as const;

export type BoardObjectKind = (typeof boardObjectKinds)[number];

export const embeddedImageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/gif",
] as const;

export type EmbeddedImageMimeType = (typeof embeddedImageMimeTypes)[number];

export interface UserObjectSource {
  readonly kind: "user";
}

export interface GeometryOsObjectSource {
  readonly girEntityId: string;
  readonly girEntityType: string;
  readonly importId: GeometryImportId;
  readonly kind: "geometryos";
}

export type BoardObjectSource = GeometryOsObjectSource | UserObjectSource;

export const strokeStyles = [
  "thin",
  "thick",
  "dashed",
  "dash-dot",
  "wavy",
  "hand-pencil",
  "hand-pen",
  "marker",
] as const;

export type StrokeStyle = (typeof strokeStyles)[number];

export interface ObjectStyle {
  readonly fill: string | null;
  readonly opacity: number;
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly strokeStyle?: StrokeStyle;
}

interface BoardObjectBase {
  readonly groupId: GroupId | null;
  readonly id: BoardObjectId;
  readonly locked: boolean;
  readonly position: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
  readonly source: BoardObjectSource;
  readonly style: ObjectStyle;
  readonly visible: boolean;
}

export interface PenStrokeObject extends BoardObjectBase {
  readonly kind: "drawing.pen-stroke";
  readonly points: readonly Vec2[];
}

export interface LineObject extends BoardObjectBase {
  readonly end: Vec2;
  readonly kind: "drawing.line";
  readonly lineStyle?: "dashed" | "solid";
}

export interface RectangleObject extends BoardObjectBase {
  readonly kind: "drawing.rectangle";
  readonly size: Size2;
}

export interface EllipseObject extends BoardObjectBase {
  readonly kind: "drawing.ellipse";
  readonly radius: Vec2;
}

export interface TextObject extends BoardObjectBase {
  readonly kind: "drawing.text";
  readonly text: string;
}

export interface EmbeddedImageObject extends BoardObjectBase {
  readonly contentSha256: string;
  readonly dataUrl: string;
  readonly fileName: string;
  readonly intrinsicSize: Size2;
  readonly kind: "image.embedded";
  readonly mimeType: EmbeddedImageMimeType;
  readonly size: Size2;
}

export interface CoordinatePlotObject extends BoardObjectBase {
  readonly definition: CoordinatePlotDefinition;
  readonly kind: "math.coordinate-plot";
}

export interface SvgViewBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface SvgObject extends BoardObjectBase {
  readonly kind: "svg-import.svg";
  readonly sanitizedSvg: string;
  readonly sanitizerPolicyVersion: typeof svgSanitizerPolicyVersion;
  readonly size: Size2;
  readonly viewBox: SvgViewBox;
}

export type BoardObject =
  | CoordinatePlotObject
  | EllipseObject
  | EmbeddedImageObject
  | LineObject
  | PenStrokeObject
  | RectangleObject
  | SvgObject
  | TextObject;
