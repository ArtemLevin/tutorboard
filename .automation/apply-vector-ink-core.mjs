import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
const replace = (file, before, after) => {
  const source = read(file);
  if (!source.includes(before)) {
    throw new Error(`Expected source fragment missing in ${file}: ${before.slice(0, 120)}`);
  }
  write(file, source.replace(before, after));
};
const replaceAll = (file, before, after) => {
  const source = read(file);
  if (!source.includes(before)) {
    throw new Error(`Expected source token missing in ${file}: ${before}`);
  }
  write(file, source.split(before).join(after));
};

replace(
  "src/core/board/document.ts",
  'export const boardDocumentSchemaVersion = "1.1" as const;',
  'export const boardDocumentSchemaVersion = "1.2" as const;',
);

replace(
  "src/core/board/objects.ts",
  'import type { Size2, Vec2 } from "./primitives";',
  'import type { Size2, Vec2 } from "./primitives";\nimport type { VectorInkData } from "./vector-ink";',
);
replace(
  "src/core/board/objects.ts",
  'export interface PenStrokeObject extends BoardObjectBase {\n  readonly kind: "drawing.pen-stroke";\n  readonly points: readonly Vec2[];\n}',
  'export interface PenStrokeObject extends BoardObjectBase {\n  /** Current BoardDocument 1.2 validation requires canonical Vector Ink data. */\n  readonly ink?: VectorInkData;\n  readonly kind: "drawing.pen-stroke";\n  readonly points: readonly Vec2[];\n}',
);

replace(
  "src/core/board/validation/schema.ts",
  '  svgSanitizerPolicyVersion,\n} from "../objects";',
  '  svgSanitizerPolicyVersion,\n} from "../objects";\nimport { vectorInkSchemaVersion } from "../vector-ink";',
);
replace(
  "src/core/board/validation/schema.ts",
  'const penStrokeSchema = z\n  .object({\n    ...objectBase,\n    kind: z.literal("drawing.pen-stroke"),\n    points: z.array(vec2Schema).min(2).max(100_000),\n  })\n  .strict();',
  'const legacyPenStrokeSchema = z\n  .object({\n    ...objectBase,\n    kind: z.literal("drawing.pen-stroke"),\n    points: z.array(vec2Schema).min(2).max(100_000),\n  })\n  .strict();\nconst vectorInkSampleSchema = z\n  .object({\n    point: vec2Schema,\n    pressure: finiteNumberSchema.min(0).max(1),\n    timestampMs: finiteNumberSchema.nonnegative(),\n  })\n  .strict();\nconst cubicBezierSegmentSchema = z\n  .object({\n    control1: vec2Schema,\n    control2: vec2Schema,\n    end: vec2Schema,\n    start: vec2Schema,\n  })\n  .strict();\nconst vectorInkSchema = z\n  .object({\n    centerline: z.array(cubicBezierSegmentSchema).min(1).max(100_000),\n    closed: z.boolean(),\n    samples: z.array(vectorInkSampleSchema).min(2).max(100_000),\n    version: z.literal(vectorInkSchemaVersion),\n  })\n  .strict();\nconst penStrokeSchema = z\n  .object({\n    ...objectBase,\n    ink: vectorInkSchema,\n    kind: z.literal("drawing.pen-stroke"),\n    points: z.array(vec2Schema).min(2).max(100_000),\n  })\n  .strict();',
);
replaceAll(
  "src/core/board/validation/schema.ts",
  '  penStrokeSchema,\n  lineSchema,',
  '  legacyPenStrokeSchema,\n  lineSchema,',
);
replace(
  "src/core/board/validation/schema.ts",
  'const objectSchema11 = z.discriminatedUnion("kind", [\n  legacyPenStrokeSchema,\n  lineSchema,\n  rectangleSchema,\n  ellipseSchema,\n  textSchema,\n  embeddedImageObjectSchema,\n  svgObjectSchema,\n  coordinatePlotObjectSchema,\n]);',
  'const objectSchema11 = z.discriminatedUnion("kind", [\n  legacyPenStrokeSchema,\n  lineSchema,\n  rectangleSchema,\n  ellipseSchema,\n  textSchema,\n  embeddedImageObjectSchema,\n  svgObjectSchema,\n  coordinatePlotObjectSchema,\n]);\nconst objectSchema12 = z.discriminatedUnion("kind", [\n  penStrokeSchema,\n  lineSchema,\n  rectangleSchema,\n  ellipseSchema,\n  textSchema,\n  embeddedImageObjectSchema,\n  svgObjectSchema,\n  coordinatePlotObjectSchema,\n]);',
);
replace(
  "src/core/board/validation/schema.ts",
  '  schemaVersion: "0.1" | "0.2" | "1.0" | "1.1",\n  storedObjectSchema:\n    typeof legacyObjectSchema | typeof objectSchema10 | typeof objectSchema11,',
  '  schemaVersion: "0.1" | "0.2" | "1.0" | "1.1" | "1.2",\n  storedObjectSchema:\n    | typeof legacyObjectSchema\n    | typeof objectSchema10\n    | typeof objectSchema11\n    | typeof objectSchema12,',
);
replace(
  "src/core/board/validation/schema.ts",
  'export const boardDocumentSchema10 = documentSchema("1.0", objectSchema10);\nexport const boardDocumentSchema = documentSchema("1.1", objectSchema11);',
  'export const boardDocumentSchema10 = documentSchema("1.0", objectSchema10);\nexport const boardDocumentSchema11 = documentSchema("1.1", objectSchema11);\nexport const boardDocumentSchema = documentSchema("1.2", objectSchema12);',
);

write(
  "src/core/board/migrations.ts",
  `import { boardDocumentSchemaVersion, type BoardDocument } from "./document";
import { createVectorInkDataFromPoints } from "./vector-ink";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
  boardDocumentSchema10,
  boardDocumentSchema11,
} from "./validation/schema";
import {
  validateBoardDocument,
  type ValidationIssue,
} from "./validation/validate";

export type BoardDocumentMigrationResult =
  | { readonly document: BoardDocument; readonly ok: true }
  | { readonly issues: readonly ValidationIssue[]; readonly ok: false };

function schemaIssues(
  issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: readonly PropertyKey[];
  }[],
): readonly ValidationIssue[] {
  return issues.map((item) => ({
    code: \`schema.\${item.code}\`,
    message: item.message,
    path: item.path.map(String).join("."),
  }));
}

export function migrateBoardDocument11To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema11.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  const objects = Object.fromEntries(
    Object.entries(parsed.data.objects).map(([id, object]) => [
      id,
      object.kind === "drawing.pen-stroke"
        ? { ...object, ink: createVectorInkDataFromPoints(object.points) }
        : object,
    ]),
  );
  const validation = validateBoardDocument({
    ...parsed.data,
    objects,
    schemaVersion: boardDocumentSchemaVersion,
  });
  return validation.valid
    ? { ok: true, document: validation.document }
    : { ok: false, issues: validation.issues };
}

export function migrateBoardDocument10To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema10.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument11To12({
    ...parsed.data,
    schemaVersion: "1.1" as const,
  });
}

export function migrateBoardDocument02To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema02.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument10To12({
    ...parsed.data,
    schemaVersion: "1.0" as const,
  });
}

export function migrateBoardDocument01To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema01.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument02To12({
    ...parsed.data,
    schemaVersion: "0.2" as const,
  });
}

/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument01To10 = migrateBoardDocument01To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument01To11 = migrateBoardDocument01To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument02To10 = migrateBoardDocument02To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument02To11 = migrateBoardDocument02To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument10To11 = migrateBoardDocument10To12;
`,
);

write(
  "src/core/board/validation/read.ts",
  `import { boardDocumentSchemaVersion, type BoardDocument } from "../document";
import {
  migrateBoardDocument01To12,
  migrateBoardDocument02To12,
  migrateBoardDocument10To12,
  migrateBoardDocument11To12,
} from "../migrations";
import type { ValidationIssue } from "./validate";
import {
  knownBoardObjectKinds,
  knownBoardObjectKinds10,
  legacyBoardObjectKinds,
} from "./schema";
import { validateBoardDocument } from "./validate";

export type BoardDocumentReadResult =
  | { readonly document: BoardDocument; readonly status: "ok" }
  | { readonly issues: readonly ValidationIssue[]; readonly raw: unknown; readonly status: "invalid-document" }
  | { readonly objectKinds: readonly string[]; readonly raw: unknown; readonly status: "incompatible-object" }
  | { readonly raw: unknown; readonly schemaVersion: unknown; readonly status: "incompatible-schema" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findUnknownObjectKinds(raw: unknown, knownKinds: ReadonlySet<string>): readonly string[] {
  if (!isRecord(raw) || !isRecord(raw.objects)) return [];
  const unknownKinds = new Set<string>();
  for (const object of Object.values(raw.objects)) {
    if (isRecord(object) && typeof object.kind === "string" && !knownKinds.has(object.kind)) {
      unknownKinds.add(object.kind);
    }
  }
  return [...unknownKinds].sort();
}

function migratedResult(
  raw: unknown,
  migration: (value: unknown) => ReturnType<typeof migrateBoardDocument11To12>,
): BoardDocumentReadResult {
  const migrated = migration(raw);
  return migrated.ok
    ? { status: "ok", document: migrated.document }
    : { status: "invalid-document", raw, issues: migrated.issues };
}

export function readBoardDocument(raw: unknown): BoardDocumentReadResult {
  const schemaVersion = isRecord(raw) ? raw.schemaVersion : undefined;
  if (schemaVersion === "0.1") {
    const objectKinds = findUnknownObjectKinds(raw, legacyBoardObjectKinds);
    return objectKinds.length > 0
      ? { status: "incompatible-object", raw, objectKinds }
      : migratedResult(raw, migrateBoardDocument01To12);
  }
  if (schemaVersion === "0.2") {
    const objectKinds = findUnknownObjectKinds(raw, knownBoardObjectKinds10);
    return objectKinds.length > 0
      ? { status: "incompatible-object", raw, objectKinds }
      : migratedResult(raw, migrateBoardDocument02To12);
  }
  if (schemaVersion === "1.0") {
    const objectKinds = findUnknownObjectKinds(raw, knownBoardObjectKinds10);
    return objectKinds.length > 0
      ? { status: "incompatible-object", raw, objectKinds }
      : migratedResult(raw, migrateBoardDocument10To12);
  }
  if (schemaVersion === "1.1") {
    const objectKinds = findUnknownObjectKinds(raw, knownBoardObjectKinds);
    return objectKinds.length > 0
      ? { status: "incompatible-object", raw, objectKinds }
      : migratedResult(raw, migrateBoardDocument11To12);
  }
  if (schemaVersion !== undefined && schemaVersion !== boardDocumentSchemaVersion) {
    return { status: "incompatible-schema", raw, schemaVersion };
  }
  const objectKinds = findUnknownObjectKinds(raw, knownBoardObjectKinds);
  if (objectKinds.length > 0) return { status: "incompatible-object", raw, objectKinds };
  const validation = validateBoardDocument(raw);
  return validation.valid
    ? { status: "ok", document: validation.document }
    : { status: "invalid-document", raw, issues: validation.issues };
}
`,
);

replace(
  "src/core/board/validation/validate.ts",
  'import { ownValue } from "../records";',
  'import { ownValue } from "../records";\nimport { vectorInkDataMatchesPoints } from "../vector-ink";',
);
replace(
  "src/core/board/validation/validate.ts",
  'function validateTimestamps(\n  document: BoardDocument,\n): readonly ValidationIssue[] {',
  'function validateVectorInk(\n  document: BoardDocument,\n): readonly ValidationIssue[] {\n  return definedObjects(document).flatMap((object) => {\n    if (object.kind !== "drawing.pen-stroke") return [];\n    return object.ink !== undefined &&\n      vectorInkDataMatchesPoints(object.ink, object.points)\n      ? []\n      : [\n          issue(\n            "document.vector-ink-noncanonical",\n            `objects.${object.id}.ink`,\n            "Pen stroke Vector Ink data must match points and canonical cubic geometry.",\n          ),\n        ];\n  });\n}\n\nfunction validateTimestamps(\n  document: BoardDocument,\n): readonly ValidationIssue[] {',
);
replace(
  "src/core/board/validation/validate.ts",
  '    ...validateCoordinatePlots(document),\n    ...validateTimestamps(document),',
  '    ...validateCoordinatePlots(document),\n    ...validateVectorInk(document),\n    ...validateTimestamps(document),',
);

replace(
  "src/core/public.ts",
  'export {\n  boardObjectKinds,',
  'export {\n  createCubicBezierCenterline,\n  createLegacyVectorInkSamples,\n  createVectorInkData,\n  createVectorInkDataFromPoints,\n  defaultVectorInkPressure,\n  legacyVectorInkSampleIntervalMs,\n  maximumVectorInkSamples,\n  normalizeVectorInkSamples,\n  resolveVectorInkData,\n  vectorInkCenterlinePathData,\n  vectorInkDataMatchesPoints,\n  vectorInkOutlinePathData,\n  vectorInkSchemaVersion,\n  vectorInkStrokeIsClosed,\n  type CubicBezierSegment,\n  type VectorInkData,\n  type VectorInkSample,\n  type VectorInkStrokeLike,\n} from "./board/vector-ink";\nexport {\n  boardObjectKinds,',
);
replace(
  "src/core/public.ts",
  '  migrateBoardDocument10To11,\n  type BoardDocumentMigrationResult,',
  '  migrateBoardDocument10To11,\n  migrateBoardDocument01To12,\n  migrateBoardDocument02To12,\n  migrateBoardDocument10To12,\n  migrateBoardDocument11To12,\n  type BoardDocumentMigrationResult,',
);

replace(
  "src/modules/drawing/interaction.ts",
  '  BoardObjectId,\n  ObjectStyle,\n  Vec2,',
  '  BoardObjectId,\n  ObjectStyle,\n  VectorInkSample,\n  Vec2,',
);
replace(
  "src/modules/drawing/interaction.ts",
  'import type { DrawingToolId } from "./tools";',
  'import { createVectorInkData, createVectorInkDataFromPoints } from "../../core/public";\n\nimport type { DrawingToolId } from "./tools";',
);
replace(
  "src/modules/drawing/interaction.ts",
  '  readonly points: readonly Vec2[];\n  readonly style: ObjectStyle;',
  '  readonly inputOriginMs: number | null;\n  readonly samples: readonly VectorInkSample[];\n  readonly style: ObjectStyle;',
);
replace(
  "src/modules/drawing/interaction.ts",
  '      readonly point: Vec2;\n      readonly pointerId: number;\n      readonly polygonSides?: number;',
  '      readonly inputTimestampMs?: number;\n      readonly point: Vec2;\n      readonly pointerId: number;\n      readonly polygonSides?: number;\n      readonly pressure?: number;',
);
replaceAll(
  "src/modules/drawing/interaction.ts",
  '      readonly point: Vec2;\n      readonly pointerId: number;\n    }',
  '      readonly inputTimestampMs?: number;\n      readonly point: Vec2;\n      readonly pointerId: number;\n      readonly pressure?: number;\n    }',
);
replace(
  "src/modules/drawing/interaction.ts",
  'function appendPenPoint(points: readonly Vec2[], point: Vec2): readonly Vec2[] {\n  const previous = points.at(-1);\n  if (\n    points.length >= maximumPenPoints ||\n    (previous !== undefined && samePoint(previous, point))\n  ) {\n    return points;\n  }\n\n  return [...points, point];\n}',
  'function normalizedPressure(value: number | undefined): number {\n  return value === undefined || !Number.isFinite(value)\n    ? 0.5\n    : Math.min(1, Math.max(0, value));\n}\n\nfunction appendPenSample(\n  state: Pick<PenInteraction, "inputOriginMs" | "samples">,\n  action: {\n    readonly inputTimestampMs?: number;\n    readonly point: Vec2;\n    readonly pressure?: number;\n  },\n): readonly VectorInkSample[] {\n  const previous = state.samples.at(-1);\n  if (\n    state.samples.length >= maximumPenPoints ||\n    (previous !== undefined && samePoint(previous.point, action.point))\n  ) {\n    return state.samples;\n  }\n  const timestampMs =\n    state.inputOriginMs !== null &&\n    action.inputTimestampMs !== undefined &&\n    Number.isFinite(action.inputTimestampMs)\n      ? Math.max(previous?.timestampMs ?? 0, action.inputTimestampMs - state.inputOriginMs)\n      : (previous?.timestampMs ?? -8) + 8;\n  return [\n    ...state.samples,\n    {\n      point: action.point,\n      pressure: normalizedPressure(action.pressure),\n      timestampMs: Math.max(0, timestampMs),\n    },\n  ];\n}',
);
replace(
  "src/modules/drawing/interaction.ts",
  '  const points = simplifyStroke(\n    appendPenPoint(state.points, point),\n    penStrokeStorageSimplificationTolerance,\n  );\n  if (points.length < 2) {',
  '  const appended = appendPenSample(state, { point });\n  const rawPoints = appended.map(({ point: samplePoint }) => samplePoint);\n  const points = simplifyStroke(\n    rawPoints,\n    penStrokeStorageSimplificationTolerance,\n  );\n  const retained = new Set(points);\n  const samples = appended.filter(({ point: samplePoint }) => retained.has(samplePoint));\n  if (points.length < 2 || samples.length < 2) {',
);
replace(
  "src/modules/drawing/interaction.ts",
  '    kind: "drawing.pen-stroke",\n    points,',
  '    ink: createVectorInkData(samples),\n    kind: "drawing.pen-stroke",\n    points,',
);
replace(
  "src/modules/drawing/interaction.ts",
  '        kind: "drawing.pen-stroke",\n        points,\n      };',
  '        ink: createVectorInkDataFromPoints(points),\n        kind: "drawing.pen-stroke",\n        points,\n      };',
);
replace(
  "src/modules/drawing/interaction.ts",
  '      return state.points.length < 2\n        ? null\n        : {\n            ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),\n            kind: "drawing.pen-stroke",\n            points: state.points,\n          };',
  '      return state.samples.length < 2\n        ? null\n        : {\n            ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),\n            ink: createVectorInkData(state.samples),\n            kind: "drawing.pen-stroke",\n            points: state.samples.map(({ point }) => point),\n          };',
);
replace(
  "src/modules/drawing/interaction.ts",
  '        points: [action.point],\n        style: action.style,',
  '        inputOriginMs:\n          action.inputTimestampMs !== undefined &&\n          Number.isFinite(action.inputTimestampMs)\n            ? action.inputTimestampMs\n            : null,\n        samples: [\n          {\n            point: action.point,\n            pressure: normalizedPressure(action.pressure),\n            timestampMs: 0,\n          },\n        ],\n        style: action.style,',
);
replace(
  "src/modules/drawing/interaction.ts",
  '          points: appendPenPoint(state.points, action.point),',
  '          samples: appendPenSample(state, action),',
);
replace(
  "src/modules/drawing/interaction.ts",
  'function completePen(\n  state: PenInteraction,\n  point: Vec2,\n): UserDrawingObject | null {\n  const appended = appendPenSample(state, { point });',
  'function completePen(\n  state: PenInteraction,\n  action: Extract<DrawingAction, { readonly kind: "finish" }>,\n): UserDrawingObject | null {\n  const appended = appendPenSample(state, action);',
);
replace(
  "src/modules/drawing/interaction.ts",
  '      completedObject = completePen(state, action.point);',
  '      completedObject = completePen(state, action);',
);

replace(
  "src/adapters/canvas-konva/BoardStage.tsx",
  'export interface WorldPointerSample {\n  readonly point: Vec2;\n  readonly pointerId: number;\n  readonly pressure: number;\n}',
  'export interface WorldPointerSample {\n  readonly inputTimestampMs?: number;\n  readonly point: Vec2;\n  readonly pointerId: number;\n  readonly pressure: number;\n}',
);
replace(
  "src/adapters/canvas-konva/BoardStage.tsx",
  '    ): TimedWorldPointerSample => ({\n      inputTimestampMs: pointerEventInputTimestampMs(event),',
  '    ): TimedWorldPointerSample => ({\n      inputTimestampMs: pointerEventInputTimestampMs(event),',
);

for (const fragment of [
  '        point: sample.point,\n        polygonSides,\n        pointerId: sample.pointerId,',
  '        kind: "move",\n        point: sample.point,\n        pointerId: sample.pointerId,',
  '          kind: "move",\n          point: sample.point,\n          pointerId: sample.pointerId,',
  '          kind: "finish",\n          point: sample.point,\n          pointerId: sample.pointerId,',
]) {
  const replacement = fragment.replace(
    'point: sample.point,',
    'inputTimestampMs: sample.inputTimestampMs,\n        point: sample.point,',
  ).replace(
    'pointerId: sample.pointerId,',
    'pointerId: sample.pointerId,\n        pressure: sample.pressure,',
  );
  replace("src/app/App.tsx", fragment, replacement);
}

replace(
  "src/modules/clipboard/clipboard.ts",
  'export const boardClipboardSchemaVersion = "1.1" as const;',
  'export const boardClipboardSchemaVersion = "1.2" as const;',
);
replace(
  "src/modules/clipboard/clipboard.ts",
  '    const copied =\n      object.kind === "math.coordinate-plot"\n        ? {\n            ...object,\n            definition: copyCoordinatePlotDefinition(object.definition),\n          }\n        : object;',
  '    const copied =\n      object.kind === "math.coordinate-plot"\n        ? {\n            ...object,\n            definition: copyCoordinatePlotDefinition(object.definition),\n          }\n        : object.kind === "drawing.pen-stroke"\n          ? {\n              ...object,\n              points: object.points.map((point) => ({ ...point })),\n              ...(object.ink === undefined\n                ? {}\n                : {\n                    ink: {\n                      ...object.ink,\n                      centerline: object.ink.centerline.map((segment) => ({\n                        control1: { ...segment.control1 },\n                        control2: { ...segment.control2 },\n                        end: { ...segment.end },\n                        start: { ...segment.start },\n                      })),\n                      samples: object.ink.samples.map((sample) => ({\n                        ...sample,\n                        point: { ...sample.point },\n                      })),\n                    },\n                  }),\n            }\n          : object;',
);

replace(
  "src/app/handwritten-function-composition.ts",
  '  boardObjectId,\n  maximumCoordinatePlotParameters,',
  '  boardObjectId,\n  createVectorInkData,\n  maximumCoordinatePlotParameters,',
);
replace(
  "src/app/handwritten-function-composition.ts",
  '    return {\n      groupId: null,',
  '    const retained = new Set(points);\n    const samples = stroke.points\n      .filter((point) => retained.has(point))\n      .map((point, sampleIndex) => ({\n        point: { x: point.x, y: point.y },\n        pressure: 0.5,\n        timestampMs: Math.max(0, point.timeMs - stroke.points[0]!.timeMs),\n      }));\n    return {\n      groupId: null,',
);
replace(
  "src/app/handwritten-function-composition.ts",
  '      kind: "drawing.pen-stroke",\n      locked: false,\n      points,',
  '      ink: createVectorInkData(samples),\n      kind: "drawing.pen-stroke",\n      locked: false,\n      points,',
);

replace(
  "src/modules/text-shape-placement/templates.ts",
  'import {',
  'import { createVectorInkDataFromPoints } from "../../core/public";\n\nimport {',
);
replace(
  "src/modules/text-shape-placement/templates.ts",
  '    const first = item.points[0]!;\n    objects.push({',
  '    const first = item.points[0]!;\n    const points = item.points.map((point) => ({\n      x: point.x - first.x,\n      y: point.y - first.y,\n    }));\n    objects.push({',
);
replace(
  "src/modules/text-shape-placement/templates.ts",
  '      kind: "drawing.pen-stroke",\n      points: item.points.map((point) => ({\n        x: point.x - first.x,\n        y: point.y - first.y,\n      })),',
  '      ink: createVectorInkDataFromPoints(points),\n      kind: "drawing.pen-stroke",\n      points,',
);

replace(
  "src/modules/smart-ink/proposal.ts",
  '  BoardObject,\n  ObjectStyle,',
  '  BoardObject,\n  createVectorInkDataFromPoints,\n  ObjectStyle,',
);
replace(
  "src/modules/smart-ink/proposal.ts",
  '    case "arrow": {\n      const shaftLength = distance(geometry.start, geometry.tip);',
  '    case "arrow": {\n      const shaftLength = distance(geometry.start, geometry.tip);',
);
replace(
  "src/modules/smart-ink/proposal.ts",
  '      return {\n        ...base(stroke, geometry.start),\n        kind: "drawing.pen-stroke",\n        points: [',
  '      const points = [',
);
replace(
  "src/modules/smart-ink/proposal.ts",
  '          },\n        ],\n      };\n    }\n    case "line": {',
  '          },\n        ];\n      return {\n        ...base(stroke, geometry.start),\n        ink: createVectorInkDataFromPoints(points),\n        kind: "drawing.pen-stroke",\n        points,\n      };\n    }\n    case "line": {',
);
replace(
  "src/modules/smart-ink/proposal.ts",
  '      return {\n        ...base(stroke, first),\n        kind: "drawing.pen-stroke",\n        points: [\n          ...geometry.vertices.map((point) => ({',
  '      const points = [\n          ...geometry.vertices.map((point) => ({',
);
replace(
  "src/modules/smart-ink/proposal.ts",
  '          { x: 0, y: 0 },\n        ],\n      };\n    }',
  '          { x: 0, y: 0 },\n        ];\n      return {\n        ...base(stroke, first),\n        ink: createVectorInkDataFromPoints(points),\n        kind: "drawing.pen-stroke",\n        points,\n      };\n    }',
);

replaceAll(
  "src/core/ports/board-sync-repository.ts",
  'readonly schemaVersion: "1.1";',
  'readonly schemaVersion: "1.2";',
);
replaceAll(
  "src/modules/server-sync/sync.ts",
  'schemaVersion: "1.1"',
  'schemaVersion: "1.2"',
);

for (const file of [
  "tests/integration/coordinate-plot-sync.test.ts",
  "tests/unit/modules/server-sync/sync.test.ts",
  "tests/unit/adapters/board-http/client.test.ts",
]) {
  replaceAll(file, 'schemaVersion: "1.1"', 'schemaVersion: "1.2"');
}
for (const file of [
  "tests/e2e/document-transfer.spec.ts",
  "tests/unit/core/board-document.test.ts",
  "src/core/board/coordinate-plot-integration.test.ts",
]) {
  replaceAll(file, '.toBe("1.1")', '.toBe("1.2")');
}

console.log("Applied Vector Ink core, migration, input and transport changes.");
