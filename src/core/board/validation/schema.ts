import { z } from "zod";

import type {
  BoardObjectId,
  DocumentId,
  GeometryImportId,
  GroupId,
} from "../identifiers";
import { isValidIdentifier } from "../identifiers";
import { boardObjectKinds } from "../objects";

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
const objectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...objectBase,
      kind: z.literal("drawing.pen-stroke"),
      points: z.array(vec2Schema).min(2).max(100_000),
    })
    .strict(),
  z
    .object({
      ...objectBase,
      end: vec2Schema,
      kind: z.literal("drawing.line"),
    })
    .strict(),
  z
    .object({
      ...objectBase,
      kind: z.literal("drawing.rectangle"),
      size: sizeSchema,
    })
    .strict(),
  z
    .object({
      ...objectBase,
      kind: z.literal("drawing.ellipse"),
      radius: positiveVec2Schema,
    })
    .strict(),
  z
    .object({
      ...objectBase,
      kind: z.literal("drawing.text"),
      text: z.string().max(100_000),
    })
    .strict(),
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
      .regex(/^[A-Za-z0-9._-]{1,128}$/)
      .nullable(),
    rootGroupId: groupIdSchema,
    visualOverrides: z.record(boardObjectIdSchema, visualOverrideSchema),
    visualTransform: transformSchema,
  })
  .strict();

export const boardDocumentSchema = z
  .object({
    createdAt: timestampSchema,
    geometryImports: z.record(geometryImportIdSchema, geometryImportSchema),
    groups: z.record(groupIdSchema, groupSchema),
    id: documentIdSchema,
    objects: z.record(boardObjectIdSchema, objectSchema),
    order: z.array(boardObjectIdSchema),
    schemaVersion: z.literal("0.1"),
    title: z.string().min(1).max(256),
    updatedAt: timestampSchema,
    viewport: viewportSchema,
  })
  .strict();

export const knownBoardObjectKinds = new Set<string>(boardObjectKinds);
