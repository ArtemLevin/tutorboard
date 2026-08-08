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
  ActorId,
  BoardObjectId,
  DocumentId,
  GeometryImportId,
  GroupId,
  PlotParameterId,
  PlotSeriesId,
  Solid3DId,
  SolidLearningAttemptId,
  SolidPointId,
  SolidSectionId,
} from "../identifiers";
import { isValidIdentifier } from "../identifiers";
import {
  boardObjectKinds,
  embeddedImageMimeTypes,
  strokeStyles,
  svgSanitizerPolicyVersion,
} from "../objects";
import { vectorInkSchemaVersion } from "../vector-ink";

const identifierSchema = z
  .string()
  .refine(isValidIdentifier, "Invalid or unsafe identifier");
const actorIdSchema = identifierSchema.transform((value) => value as ActorId);
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
const solid3DIdSchema = identifierSchema.transform(
  (value) => value as Solid3DId,
);
const solidLearningAttemptIdSchema = identifierSchema.transform(
  (value) => value as SolidLearningAttemptId,
);
const solidPointIdSchema = identifierSchema.transform(
  (value) => value as SolidPointId,
);
const solidSectionIdSchema = identifierSchema.transform(
  (value) => value as SolidSectionId,
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
const legacyPenStrokeSchema = z
  .object({
    ...objectBase,
    kind: z.literal("drawing.pen-stroke"),
    points: z.array(vec2Schema).min(2).max(100_000),
  })
  .strict();
const vectorInkSampleSchema = z
  .object({
    point: vec2Schema,
    pressure: finiteNumberSchema.min(0).max(1),
    timestampMs: finiteNumberSchema.nonnegative(),
  })
  .strict();
const cubicBezierSegmentSchema = z
  .object({
    control1: vec2Schema,
    control2: vec2Schema,
    end: vec2Schema,
    start: vec2Schema,
  })
  .strict();
const vectorInkSchema = z
  .object({
    centerline: z.array(cubicBezierSegmentSchema).min(1).max(100_000),
    closed: z.boolean(),
    samples: z.array(vectorInkSampleSchema).min(2).max(100_000),
    version: z.literal(vectorInkSchemaVersion),
  })
  .strict();
const penStrokeSchema = z
  .object({
    ...objectBase,
    ink: vectorInkSchema,
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
  legacyPenStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
]);
const objectSchema10 = z.discriminatedUnion("kind", [
  legacyPenStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
  embeddedImageObjectSchema,
  svgObjectSchema,
]);
const objectSchema11 = z.discriminatedUnion("kind", [
  legacyPenStrokeSchema,
  lineSchema,
  rectangleSchema,
  ellipseSchema,
  textSchema,
  embeddedImageObjectSchema,
  svgObjectSchema,
  coordinatePlotObjectSchema,
]);
const objectSchema12 = z.discriminatedUnion("kind", [
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

const vec3Schema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    z: finiteNumberSchema,
  })
  .strict();
const solidDefinitionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      edgeLength: finiteNumberSchema.positive(),
      kind: z.literal("cube"),
    })
    .strict(),
  z.object({ kind: z.literal("cuboid"), size: vec3Schema }).strict(),
  z
    .object({
      edgeLength: finiteNumberSchema.positive(),
      kind: z.literal("tetrahedron"),
    })
    .strict(),
  z
    .object({
      base: z.array(vec2Schema).min(3).max(256),
      height: finiteNumberSchema.positive(),
      kind: z.literal("prism"),
    })
    .strict(),
  z
    .object({
      apex: vec3Schema,
      base: z.array(vec2Schema).min(3).max(256),
      kind: z.literal("pyramid"),
    })
    .strict(),
  z
    .object({
      height: finiteNumberSchema.positive(),
      kind: z.literal("cylinder"),
      radius: finiteNumberSchema.positive(),
    })
    .strict(),
  z
    .object({
      height: finiteNumberSchema.positive(),
      kind: z.literal("cone"),
      radius: finiteNumberSchema.positive(),
    })
    .strict(),
  z
    .object({
      bottomRadius: finiteNumberSchema.positive(),
      height: finiteNumberSchema.positive(),
      kind: z.literal("truncated-cone"),
      topRadius: finiteNumberSchema.positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sphere"),
      radius: finiteNumberSchema.positive(),
    })
    .strict(),
]);
const solidPointAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vertex"), vertexId: identifierSchema }).strict(),
  z
    .object({
      edgeId: identifierSchema,
      kind: z.literal("edge"),
      parameter: finiteNumberSchema.min(0).max(1),
    })
    .strict(),
  z
    .object({
      faceId: identifierSchema,
      kind: z.literal("face"),
      localCoordinates: vec2Schema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("analytic-surface"),
      parameters: z.array(finiteNumberSchema).max(8),
      surfaceId: identifierSchema,
    })
    .strict(),
]);
const solidPointSchema = z
  .object({
    anchor: solidPointAnchorSchema,
    id: solidPointIdSchema,
    label: z.string().min(1).max(32),
    position: vec3Schema,
  })
  .strict();
const solidSectionSchema = z
  .object({
    algorithmVersion: z.enum(["polyhedron-plane/1", "analytic-plane/1"]),
    id: solidSectionIdSchema,
    pointIds: z.tuple([
      solidPointIdSchema,
      solidPointIdSchema,
      solidPointIdSchema,
    ]),
    visible: z.boolean(),
  })
  .strict();
const solidProjectionSchema = z
  .object({
    hiddenEdgePolicy: z.enum(["dashed", "hidden"]),
    kind: z.enum(["orthographic", "oblique", "perspective"]),
    matrix: z.array(finiteNumberSchema).min(6).max(16),
    origin: vec2Schema,
    viewportScale: finiteNumberSchema.positive(),
  })
  .strict();
const solidSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text-template"),
      templateId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      kind: z.literal("smart-ink"),
      recognizerVersion: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({ importId: geometryImportIdSchema, kind: z.literal("geometryos") })
    .strict(),
]);
const solidRecordSchema = z
  .object({
    boardObjectIds: z.array(boardObjectIdSchema).max(5_000),
    definition: solidDefinitionSchema,
    id: solid3DIdSchema,
    points: z.array(solidPointSchema).max(32),
    projection: solidProjectionSchema,
    rootGroupId: groupIdSchema,
    schemaVersion: z.literal("1.0"),
    sections: z.array(solidSectionSchema).max(8),
    source: solidSourceSchema,
  })
  .strict();

const solidElementRefSchema = z.discriminatedUnion("kind", [
  z.object({ id: identifierSchema, kind: z.literal("vertex") }).strict(),
  z.object({ id: identifierSchema, kind: z.literal("edge") }).strict(),
  z.object({ id: identifierSchema, kind: z.literal("face") }).strict(),
  z.object({ id: identifierSchema, kind: z.literal("point") }).strict(),
  z
    .object({ id: identifierSchema, kind: z.literal("section-segment") })
    .strict(),
]);
const learningDiagnosticCodeSchema = z.enum([
  "points-on-different-faces",
  "missed-edge-intersection",
  "wrong-contour-order",
  "self-intersection",
  "point-outside-edge",
  "segment-outside-section-plane",
  "duplicate-or-collinear-seeds",
  "invalid-proof-premises",
  "incorrect-formula",
  "incorrect-unit",
]);
const constructionActionSchema = z.discriminatedUnion("kind", [
  z
    .object({ faceId: identifierSchema, kind: z.literal("select-face") })
    .strict(),
  z
    .object({
      edgeId: identifierSchema,
      kind: z.literal("add-derived-point"),
      parameter: finiteNumberSchema,
    })
    .strict(),
  z
    .object({
      faceId: identifierSchema,
      fromPointId: identifierSchema,
      kind: z.literal("add-trace-segment"),
      toPointId: identifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("close-contour"),
      orderedPointIds: z.array(identifierSchema).min(3).max(32),
    })
    .strict(),
]);
const exactValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      denominator: z.number().int().positive(),
      kind: z.literal("rational"),
      numerator: z.number().int(),
    })
    .strict(),
  z
    .object({
      coefficientDenominator: z.number().int().positive(),
      coefficientNumerator: z.number().int(),
      kind: z.literal("radical"),
      radicand: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal("decimal"), value: finiteNumberSchema }).strict(),
]);
export const solidLearningAttemptSchema = z
  .object({
    actorId: actorIdSchema,
    answers: z
      .array(
        z
          .object({
            correct: z.boolean(),
            formulaId: identifierSchema.nullable(),
            parsed: exactValueSchema.nullable(),
            raw: z.string().max(256),
            taskId: identifierSchema,
            timestamp: timestampSchema,
            unit: z.string().max(32),
          })
          .strict(),
      )
      .max(128),
    checkpoints: z
      .array(
        z
          .object({
            area: finiteNumberSchema.nonnegative(),
            parameter: finiteNumberSchema,
            perimeter: finiteNumberSchema.nonnegative(),
            timestamp: timestampSchema,
            vertexCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(32),
    construction: z
      .object({
        completed: z.boolean(),
        trace: z
          .array(
            z
              .object({
                accepted: z.boolean(),
                action: constructionActionSchema,
                diagnosticCode: learningDiagnosticCodeSchema.nullable(),
                explanation: z.string().max(1_000),
                id: identifierSchema,
                timestamp: timestampSchema,
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
    diagnostics: z
      .array(
        z
          .object({
            code: learningDiagnosticCodeSchema,
            element: solidElementRefSchema.nullable(),
            id: identifierSchema,
            message: z.string().max(1_000),
            timestamp: timestampSchema,
          })
          .strict(),
      )
      .max(64),
    hints: z
      .array(
        z
          .object({
            id: identifierSchema,
            ladderId: identifierSchema,
            level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            relatedElement: solidElementRefSchema.nullable(),
            timestamp: timestampSchema,
          })
          .strict(),
      )
      .max(24),
    id: solidLearningAttemptIdSchema,
    mode: z.enum(["guided", "assessment", "teacher-demo"]),
    phase: z.enum([
      "intro",
      "prediction",
      "construction",
      "reasoning",
      "measurement",
      "reflection",
      "completed",
    ]),
    prediction: z
      .object({
        confidence: z.enum(["confident", "unsure", "stuck"]),
        edgeIds: z.array(identifierSchema).max(64),
        parallelSidePairs: z
          .array(z.tuple([identifierSchema, identifierSchema]))
          .max(32),
        polygonKind: z.string().max(64),
        score: finiteNumberSchema.min(0).max(1).nullable(),
        submitted: z.boolean(),
        vertexCount: z.number().int().min(3).max(64).nullable(),
      })
      .strict()
      .nullable(),
    quizAnswers: z.record(identifierSchema, z.string().max(512)),
    reasoning: z
      .array(
        z
          .object({
            accepted: z.boolean(),
            premiseIds: z.array(identifierSchema).max(16),
            ruleId: identifierSchema,
            statementId: identifierSchema,
          })
          .strict(),
      )
      .max(128),
    result: z
      .object({
        completed: z.boolean(),
        constructionAccuracy: finiteNumberSchema.min(0).max(1),
        maximumHintLevel: z.number().int().min(0).max(3),
        measurementAccuracy: finiteNumberSchema.min(0).max(1),
        predictionScore: finiteNumberSchema.min(0).max(1),
        quizScore: finiteNumberSchema.min(0).max(1),
        reasoningAccuracy: finiteNumberSchema.min(0).max(1),
        skillScores: z.record(
          z.string().min(1).max(64),
          finiteNumberSchema.min(0).max(1),
        ),
      })
      .strict()
      .nullable(),
    revision: z.number().int().nonnegative(),
    scenarioId: identifierSchema,
    scenarioVersion: z.string().min(1).max(32),
    schemaVersion: z.literal("1.0"),
    solidId: solid3DIdSchema,
    startedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const solidLearningAttemptActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set-phase"),
      phase: z.enum([
        "intro",
        "prediction",
        "construction",
        "reasoning",
        "measurement",
        "reflection",
        "completed",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("submit-prediction"),
      prediction: solidLearningAttemptSchema.shape.prediction.unwrap(),
    })
    .strict(),
  z
    .object({
      entry: solidLearningAttemptSchema.shape.construction.shape.trace.element,
      kind: z.literal("construction-step"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("add-reasoning"),
      step: solidLearningAttemptSchema.shape.reasoning.element,
    })
    .strict(),
  z
    .object({
      answer: solidLearningAttemptSchema.shape.answers.element,
      kind: z.literal("submit-answer"),
    })
    .strict(),
  z
    .object({
      hint: solidLearningAttemptSchema.shape.hints.element,
      kind: z.literal("use-hint"),
    })
    .strict(),
  z
    .object({
      diagnostic: solidLearningAttemptSchema.shape.diagnostics.element,
      kind: z.literal("add-diagnostic"),
    })
    .strict(),
  z
    .object({
      checkpoint: solidLearningAttemptSchema.shape.checkpoints.element,
      kind: z.literal("add-checkpoint"),
    })
    .strict(),
  z
    .object({
      answer: z.string().max(512),
      itemId: identifierSchema,
      kind: z.literal("answer-quiz"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("restore"),
      snapshot: solidLearningAttemptSchema,
    })
    .strict(),
]);

function documentSchema(
  schemaVersion: "0.1" | "0.2" | "1.0" | "1.1" | "1.2",
  storedObjectSchema:
    | typeof legacyObjectSchema
    | typeof objectSchema10
    | typeof objectSchema11
    | typeof objectSchema12,
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
export const boardDocumentSchema11 = documentSchema("1.1", objectSchema11);
export const boardDocumentSchema12 = documentSchema("1.2", objectSchema12);
export const boardDocumentSchema13 = boardDocumentSchema12
  .extend({
    schemaVersion: z.literal("1.3"),
    solidModels: z.record(solid3DIdSchema, solidRecordSchema),
  })
  .strict();
export const boardDocumentSchema = boardDocumentSchema13
  .extend({
    schemaVersion: z.literal("1.4"),
    solidLearningAttempts: z.record(
      solidLearningAttemptIdSchema,
      solidLearningAttemptSchema,
    ),
  })
  .strict();

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
