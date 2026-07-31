import { z } from "zod";

import type {
  BoardObjectId,
  DocumentId,
  GeometryImportId,
  GroupId,
} from "../identifiers";
import { isValidIdentifier } from "../identifiers";
import {
  boardObjectKinds,
  strokeStyles,
  svgSanitizerPolicyVersion,
} from "../objects";

const identifierSchema = z
  .string()
  .refine(isValidIdentifier, "Invalid or unsafe identifier");
const boardObjectIdSchema = identifierSchema.transform(
  (value) => value as BoardObjectId,
);
const documentIdSchema = identifierSchema.transform(
  (value) => value as DocumentId,
);
const geometryImportIdSchema = identifierSchema.transform(
  (value) => value as GeometryImportId,
);
const groupIdSchema = identifierSchema.transform((value) => value as GroupId);
const timestampSchema = z.iso.datetime({ offset: true });
const finiteNumberSchema = z.number().finite();
const vec2Schema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();
const positiveVec2Schema = z
  .object({
    x: finiteNumberSchema.positive(),
    y: finiteNumberSchema.positive(),
  })
  .strict();
const sizeSchema = z
  .object({
    height: finiteNumberSchema.positive(),
    width: finiteNumberSchema.positive(),
  })
  .strict();
const svgSizeSchema = z
  .object({
    height: finiteNumberSchema.positive().max(16_384),
    width: finiteNumberSchema.positive().max(16_384),
  })
  .strict();
const transformSchema = z
  .object({
    rotation: finiteNumberSchema,
    scale: positiveVec2Schema,
    translation: vec2Schema,
  })
  .strict();
const viewportSchema = z
  .object({
    offset: vec2Schema,
    zoom: finiteNumberSchema.positive(),
  })
  .strict();
const styleSchema = z
  .object({
    fill: z.string().max(256).nullable(),
    opacity: finiteNumberSchema.min(0).max(1),
    stroke: z.string().max(256).nullable(),
    strokeWidth: finiteNumberSchema.nonnegative(),
    strokeStyle: z.enum(strokeStyles).optional(),
  })
  .strict();
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user") }).strict(),
  z
    .object({
      girEntityId: z.string().min(1).max(256),
      girEntityType: z.string().min(1).max(128),
      importId: geometryImportIdSchema,
      kind: z.literal("geometryos"),
    })
    .strict(),
]);
const objectBase = {
  groupId: groupIdSchema.nullable(),
  id: boardObjectIdSchema,
  locked: z.boolean(),
  position: vec2Schema,
  rotation: finiteNumberSchema,
  scale: positiveVec2Schema,
  source: sourceSchema,
  style: styleSchema,
  visible: z.boolean(),
};
const penStrokeSchema = z
  .object({
    ...objectBase,
    kind: z.literal("drawing.pen-stroke"),
    points: z.array(vec2Schema).min(2).max(100_000),
  })
  .strict();
const lineSchema = z
  .object({
    ...objectBase,
    end: vec2Schema,
    kind: z.literal("drawing.line"),
    lineStyle: z.enum(["dashed", "solid"]).optional(),
  })
  .strict();
const rectangleSchema = z
  .object({
    ...objectBase,
    kind: z.literal("drawing.rectangle"),
    size: sizeSchema,
  })
  .strict();
const ellipseSchema = z
  .object({
    ...objectBase,
    kind: z.literal("drawing.ellipse"),
    radius: positiveVec2Schema,
  })
  .strict();
const textSchema = z
  .object({
    ...objectBase,
    kind: z.literal("drawing.text"),
    text: z.string().max(100_000),
  })
  .strict();
const svgViewBoxSchema = z
  .object({
    height: finiteNumberSchema.positive().max(1_000_000),
    width: finiteNumberSchema.positive().max(1_000_000),
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();
const svgObjectSchema = z
  .object({
    ...objectBase,
    kind: z.literal("svg-import.svg"),
    sanitizedSvg: z
      .string()
      .min(1)
      .max(512 * 1024),
    sanitizerPolicyVersion: z.literal(svgSanitizerPolicyVersion),
    size: svgSizeSchema,
    viewBox: svgViewBoxSchema,
  })
  .strict();

const legacyObjectSchema = z.discriminatedUnion("kind", [
  penStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
]);
const objectSchema = z.discriminatedUnion("kind", [
  penStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
  svgObjectSchema,
]);
const groupSchema = z
  .object({
    id: groupIdSchema,
    locked: z.boolean(),
    objectIds: z.array(boardObjectIdSchema).min(1),
    transform: transformSchema,
  })
  .strict();
const visualOverrideSchema = z
  .object({
    rotation: finiteNumberSchema,
    scale: positiveVec2Schema,
    style: styleSchema.partial().strict().optional(),
    translation: vec2Schema,
  })
  .strict();
const geometryImportSchema = z
  .object({
    boardObjectIds: z.array(boardObjectIdSchema).min(1),
    canonicalGir: z.json(),
    createdAt: timestampSchema,
    geometryOsApiVersion: z.literal("1.0.0"),
    girSchemaVersion: z.literal("0.2.0"),
    id: geometryImportIdSchema,
    mapping: z.record(z.string().min(1), z.array(boardObjectIdSchema).min(1)),
    prompt: z.string().max(100_000),
    rawResponse: z.json(),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,220}$/)
      .nullable(),
    rootGroupId: groupIdSchema,
    visualOverrides: z.record(boardObjectIdSchema, visualOverrideSchema),
    visualTransform: transformSchema,
  })
  .strict();

function documentSchema(
  schemaVersion: "0.1" | "0.2" | "1.0",
  storedObjectSchema: typeof legacyObjectSchema | typeof objectSchema,
) {
  return z
    .object({
      createdAt: timestampSchema,
      geometryImports: z.record(geometryImportIdSchema, geometryImportSchema),
      groups: z.record(groupIdSchema, groupSchema),
      id: documentIdSchema,
      objects: z.record(boardObjectIdSchema, storedObjectSchema),
      order: z.array(boardObjectIdSchema),
      schemaVersion: z.literal(schemaVersion),
      title: z.string().min(1).max(256),
      updatedAt: timestampSchema,
      viewport: viewportSchema,
    })
    .strict();
}

export const boardDocumentSchema01 = documentSchema("0.1", legacyObjectSchema);
export const boardDocumentSchema02 = documentSchema("0.2", objectSchema);
export const boardDocumentSchema = documentSchema("1.0", objectSchema);

export const legacyBoardObjectKinds = new Set<string>([
  "drawing.pen-stroke",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
]);
export const knownBoardObjectKinds = new Set<string>(boardObjectKinds);
