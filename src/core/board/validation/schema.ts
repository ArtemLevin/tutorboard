import { z } from "zod";

import {
  coordinatePlotExpressionLanguage,
  maximumCoordinatePlotParameters,
  maximumCoordinatePlotSeries,
  maximumPlotExpressionLength,
  plotLegendPositions,
  plotLineStyles,
} from "../coordinate-plot";
import type {
  BoardObjectId,
  DocumentId,
  GeometryImportId,
  GroupId,
  PlotParameterId,
  PlotSeriesId,
} from "../identifiers";
import { isValidIdentifier } from "../identifiers";
import {
  boardObjectKinds,
  embeddedImageMimeTypes,
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
const plotParameterIdSchema = identifierSchema.transform(
  (value) => value as PlotParameterId,
);
const plotSeriesIdSchema = identifierSchema.transform(
  (value) => value as PlotSeriesId,
);
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
const embeddedImageObjectSchema = z
  .object({
    ...objectBase,
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    dataUrl: z
      .string()
      .min(1)
      .max(12 * 1024 * 1024)
      .regex(/^data:image\/(?:png|jpeg|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/u),
    fileName: z.string().min(1).max(256),
    intrinsicSize: svgSizeSchema,
    kind: z.literal("image.embedded"),
    mimeType: z.enum(embeddedImageMimeTypes),
    size: svgSizeSchema,
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

const plotExpressionSchema = z
  .string()
  .min(1)
  .max(maximumPlotExpressionLength)
  .refine((value) => value.trim().length > 0, "Expression cannot be blank");
const plotSeriesStyleSchema = z
  .object({
    lineStyle: z.enum(plotLineStyles),
    opacity: finiteNumberSchema.min(0).max(1),
    stroke: z.string().min(1).max(256),
    strokeWidth: finiteNumberSchema.min(0.25).max(32),
  })
  .strict();
const explicitPlotSeriesSchema = z
  .object({
    domain: z
      .object({
        maxExpression: plotExpressionSchema.nullable(),
        minExpression: plotExpressionSchema.nullable(),
      })
      .strict(),
    expression: plotExpressionSchema,
    id: plotSeriesIdSchema,
    kind: z.literal("explicit"),
    name: z.string().min(1).max(128),
    style: plotSeriesStyleSchema,
    visible: z.boolean(),
  })
  .strict();
const parametricPlotSeriesSchema = z
  .object({
    closed: z.boolean(),
    id: plotSeriesIdSchema,
    kind: z.literal("parametric"),
    name: z.string().min(1).max(128),
    parameterName: z.literal("t"),
    range: z
      .object({
        maxExpression: plotExpressionSchema,
        minExpression: plotExpressionSchema,
      })
      .strict(),
    style: plotSeriesStyleSchema,
    visible: z.boolean(),
    xExpression: plotExpressionSchema,
    yExpression: plotExpressionSchema,
  })
  .strict();
const relationPlotSeriesSchema = z
  .object({
    expression: plotExpressionSchema,
    fillOpacity: finiteNumberSchema.min(0).max(1),
    id: plotSeriesIdSchema,
    kind: z.literal("relation"),
    name: z.string().min(1).max(128),
    style: plotSeriesStyleSchema,
    visible: z.boolean(),
  })
  .strict();
const plotParameterSchema = z
  .object({
    id: plotParameterIdSchema,
    max: finiteNumberSchema.nullable(),
    min: finiteNumberSchema.nullable(),
    name: z.string().min(1).max(32),
    step: finiteNumberSchema.nullable(),
    value: finiteNumberSchema,
  })
  .strict();
const coordinatePlotDefinitionSchema = z
  .object({
    axes: z
      .object({
        showArrows: z.boolean(),
        showLabels: z.boolean(),
        showXAxis: z.boolean(),
        showYAxis: z.boolean(),
        xLabel: z.string().max(32),
        yLabel: z.string().max(32),
      })
      .strict(),
    coordinateViewport: z
      .object({
        equalScale: z.boolean(),
        xMax: finiteNumberSchema,
        xMin: finiteNumberSchema,
        yMax: finiteNumberSchema,
        yMin: finiteNumberSchema,
      })
      .strict(),
    expressionLanguage: z.literal(coordinatePlotExpressionLanguage),
    grid: z
      .object({
        automaticStep: z.boolean(),
        majorVisible: z.boolean(),
        minorVisible: z.boolean(),
        visible: z.boolean(),
        xStep: finiteNumberSchema.nullable(),
        yStep: finiteNumberSchema.nullable(),
      })
      .strict(),
    legend: z
      .object({
        position: z.enum(plotLegendPositions),
        visible: z.boolean(),
      })
      .strict(),
    parameters: z
      .array(plotParameterSchema)
      .max(maximumCoordinatePlotParameters),
    series: z
      .array(
        z.discriminatedUnion("kind", [
          explicitPlotSeriesSchema,
          parametricPlotSeriesSchema,
          relationPlotSeriesSchema,
        ]),
      )
      .max(maximumCoordinatePlotSeries),
    size: z
      .object({
        height: finiteNumberSchema.min(100).max(16_384),
        width: finiteNumberSchema.min(120).max(16_384),
      })
      .strict(),
  })
  .strict();
const coordinatePlotObjectSchema = z
  .object({
    ...objectBase,
    definition: coordinatePlotDefinitionSchema,
    kind: z.literal("math.coordinate-plot"),
  })
  .strict();

const legacyObjectSchema = z.discriminatedUnion("kind", [
  penStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
]);
const objectSchema10 = z.discriminatedUnion("kind", [
  penStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
  embeddedImageObjectSchema,
  svgObjectSchema,
]);
const objectSchema11 = z.discriminatedUnion("kind", [
  penStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
  embeddedImageObjectSchema,
  svgObjectSchema,
  coordinatePlotObjectSchema,
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
  schemaVersion: "0.1" | "0.2" | "1.0" | "1.1",
  storedObjectSchema:
    typeof legacyObjectSchema | typeof objectSchema10 | typeof objectSchema11,
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
export const boardDocumentSchema02 = documentSchema("0.2", objectSchema10);
export const boardDocumentSchema10 = documentSchema("1.0", objectSchema10);
export const boardDocumentSchema = documentSchema("1.1", objectSchema11);

export const legacyBoardObjectKinds = new Set<string>([
  "drawing.pen-stroke",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
]);
export const knownBoardObjectKinds10 = new Set<string>([
  "drawing.pen-stroke",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
  "image.embedded",
  "svg-import.svg",
]);
export const knownBoardObjectKinds = new Set<string>(boardObjectKinds);
