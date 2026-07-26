import type { JsonValue } from "./json";
import type { BoardObjectId, GeometryImportId, GroupId } from "./identifiers";
import type { ObjectStyle } from "./objects";
import type { Transform2D } from "./primitives";

export type VisualStyleOverride = Readonly<Partial<ObjectStyle>>;

export interface VisualOverride extends Transform2D {
  readonly style?: VisualStyleOverride;
}

export interface GeometryImportRecord {
  readonly boardObjectIds: readonly BoardObjectId[];
  readonly canonicalGir: JsonValue;
  readonly createdAt: string;
  readonly geometryOsApiVersion: "1.0.0";
  readonly girSchemaVersion: "0.2.0";
  readonly id: GeometryImportId;
  readonly mapping: Readonly<Record<string, readonly BoardObjectId[]>>;
  readonly prompt: string;
  readonly rawResponse: JsonValue;
  readonly requestId: string | null;
  readonly rootGroupId: GroupId;
  readonly visualOverrides: Readonly<
    Partial<Record<BoardObjectId, VisualOverride>>
  >;
  readonly visualTransform: Transform2D;
}
