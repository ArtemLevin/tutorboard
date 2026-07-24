import type { BoardObjectId, GeometryImportId, GroupId } from "./identifiers";
import type { Size2, Vec2 } from "./primitives";

export const boardObjectKinds = [
  "drawing.pen-stroke",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
] as const;

export type BoardObjectKind = (typeof boardObjectKinds)[number];

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

export interface ObjectStyle {
  readonly fill: string | null;
  readonly opacity: number;
  readonly stroke: string | null;
  readonly strokeWidth: number;
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

export type BoardObject =
  EllipseObject | LineObject | PenStrokeObject | RectangleObject | TextObject;
