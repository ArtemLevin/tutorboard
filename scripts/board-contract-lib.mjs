import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const contractRoot = path.join(repositoryRoot, "contracts/board/v1");

const identifierPattern =
  "^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const sha256Pattern = "^[a-f0-9]{64}$";
const timestamp = { format: "date-time", type: "string" };
const finiteNumber = { type: "number" };
const positiveNumber = { exclusiveMinimum: 0, type: "number" };
const nonNegativeInteger = { minimum: 0, type: "integer" };

function strictObject(properties, required = Object.keys(properties)) {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object",
  };
}

function reference(name) {
  return { $ref: `#/$defs/${name}` };
}

function record(value) {
  return {
    additionalProperties: value,
    propertyNames: { pattern: identifierPattern },
    type: "object",
  };
}

function array(items, options = {}) {
  return { items, type: "array", ...options };
}

const identifier = { pattern: identifierPattern, type: "string" };
const vec2 = strictObject({ x: finiteNumber, y: finiteNumber });
const vectorInkSample = strictObject({
  point: reference("Vec2"),
  pressure: { maximum: 1, minimum: 0, type: "number" },
  timestampMs: { minimum: 0, type: "number" },
});
const cubicBezierSegment = strictObject({
  control1: reference("Vec2"),
  control2: reference("Vec2"),
  end: reference("Vec2"),
  start: reference("Vec2"),
});
const vectorInkData = strictObject({
  centerline: array(reference("CubicBezierSegment"), {
    maxItems: 100_000,
    minItems: 1,
  }),
  closed: { type: "boolean" },
  samples: array(reference("VectorInkSample"), {
    maxItems: 100_000,
    minItems: 2,
  }),
  version: { const: "1.0" },
});
const positiveVec2 = strictObject({ x: positiveNumber, y: positiveNumber });
const size2 = strictObject({
  height: positiveNumber,
  width: positiveNumber,
});
const transform2d = strictObject({
  rotation: finiteNumber,
  scale: reference("PositiveVec2"),
  translation: reference("Vec2"),
});
const viewport = strictObject({
  offset: reference("Vec2"),
  zoom: positiveNumber,
});
const objectStyle = strictObject({
  fill: { type: ["string", "null"], maxLength: 256 },
  opacity: { maximum: 1, minimum: 0, type: "number" },
  stroke: { type: ["string", "null"], maxLength: 256 },
  strokeWidth: { minimum: 0, type: "number" },
});
const userSource = strictObject({ kind: { const: "user" } });
const geometryOsSource = strictObject({
  girEntityId: { maxLength: 256, minLength: 1, type: "string" },
  girEntityType: { maxLength: 128, minLength: 1, type: "string" },
  importId: reference("Identifier"),
  kind: { const: "geometryos" },
});
const objectBase = {
  groupId: {
    anyOf: [reference("Identifier"), { type: "null" }],
  },
  id: reference("Identifier"),
  locked: { type: "boolean" },
  position: reference("Vec2"),
  rotation: finiteNumber,
  scale: reference("PositiveVec2"),
  source: {
    oneOf: [reference("UserObjectSource"), reference("GeometryOsObjectSource")],
  },
  style: reference("ObjectStyle"),
  visible: { type: "boolean" },
};

function boardObject(kind, properties, required = Object.keys(properties)) {
  return strictObject(
    {
      ...objectBase,
      kind: { const: kind },
      ...properties,
    },
    [...Object.keys(objectBase), "kind", ...required],
  );
}

const penStroke = boardObject("drawing.pen-stroke", {
  ink: reference("VectorInkData"),
  points: array(reference("Vec2"), { maxItems: 100_000, minItems: 2 }),
});
const line = boardObject(
  "drawing.line",
  {
    end: reference("Vec2"),
    lineStyle: { enum: ["dashed", "solid"] },
  },
  ["end"],
);
const rectangle = boardObject("drawing.rectangle", {
  size: reference("Size2"),
});
const ellipse = boardObject("drawing.ellipse", {
  radius: reference("PositiveVec2"),
});
const text = boardObject("drawing.text", {
  text: { maxLength: 100_000, type: "string" },
});
const embeddedImage = boardObject("image.embedded", {
  contentSha256: { pattern: sha256Pattern, type: "string" },
  dataUrl: {
    maxLength: 12 * 1024 * 1024,
    minLength: 1,
    pattern: "^data:image/(?:png|jpeg|gif|svg\\+xml);base64,[A-Za-z0-9+/=]+$",
    type: "string",
  },
  fileName: { maxLength: 256, minLength: 1, type: "string" },
  intrinsicSize: strictObject({
    height: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
    width: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
  }),
  mimeType: { enum: ["image/png", "image/jpeg", "image/svg+xml", "image/gif"] },
  size: strictObject({
    height: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
    width: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
  }),
});
const svgViewBox = strictObject({
  height: { exclusiveMinimum: 0, maximum: 1_000_000, type: "number" },
  width: { exclusiveMinimum: 0, maximum: 1_000_000, type: "number" },
  x: finiteNumber,
  y: finiteNumber,
});
const svgObject = boardObject("svg-import.svg", {
  sanitizedSvg: {
    maxLength: 512 * 1024,
    minLength: 1,
    type: "string",
  },
  sanitizerPolicyVersion: { const: "tutorboard.svg-sanitizer/1" },
  size: strictObject({
    height: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
    width: { exclusiveMinimum: 0, maximum: 16_384, type: "number" },
  }),
  viewBox: reference("SvgViewBox"),
});
const plotSeriesStyle = strictObject({
  lineStyle: { enum: ["solid", "dashed", "dash-dot"] },
  opacity: { maximum: 1, minimum: 0, type: "number" },
  stroke: { maxLength: 256, minLength: 1, type: "string" },
  strokeWidth: { maximum: 32, minimum: 0.25, type: "number" },
});
const plotExpression = { maxLength: 2_000, minLength: 1, type: "string" };
const explicitPlotSeries = strictObject({
  domain: strictObject({
    maxExpression: { anyOf: [plotExpression, { type: "null" }] },
    minExpression: { anyOf: [plotExpression, { type: "null" }] },
  }),
  expression: plotExpression,
  id: reference("Identifier"),
  kind: { const: "explicit" },
  name: { maxLength: 128, minLength: 1, type: "string" },
  style: reference("PlotSeriesStyle"),
  visible: { type: "boolean" },
});
const parametricPlotSeries = strictObject({
  closed: { type: "boolean" },
  id: reference("Identifier"),
  kind: { const: "parametric" },
  name: { maxLength: 128, minLength: 1, type: "string" },
  parameterName: { const: "t" },
  range: strictObject({
    maxExpression: plotExpression,
    minExpression: plotExpression,
  }),
  style: reference("PlotSeriesStyle"),
  visible: { type: "boolean" },
  xExpression: plotExpression,
  yExpression: plotExpression,
});
const relationPlotSeries = strictObject({
  expression: plotExpression,
  fillOpacity: { maximum: 1, minimum: 0, type: "number" },
  id: reference("Identifier"),
  kind: { const: "relation" },
  name: { maxLength: 128, minLength: 1, type: "string" },
  style: reference("PlotSeriesStyle"),
  visible: { type: "boolean" },
});
const plotSeries = {
  oneOf: [
    reference("ExplicitPlotSeries"),
    reference("ParametricPlotSeries"),
    reference("RelationPlotSeries"),
  ],
};
const plotParameter = strictObject({
  id: reference("Identifier"),
  max: { type: ["number", "null"] },
  min: { type: ["number", "null"] },
  name: { maxLength: 32, minLength: 1, type: "string" },
  step: { type: ["number", "null"] },
  value: finiteNumber,
});
const coordinatePlotDefinition = strictObject({
  axes: strictObject({
    showArrows: { type: "boolean" },
    showLabels: { type: "boolean" },
    showXAxis: { type: "boolean" },
    showYAxis: { type: "boolean" },
    xLabel: { maxLength: 32, type: "string" },
    yLabel: { maxLength: 32, type: "string" },
  }),
  coordinateViewport: strictObject({
    equalScale: { type: "boolean" },
    xMax: finiteNumber,
    xMin: finiteNumber,
    yMax: finiteNumber,
    yMin: finiteNumber,
  }),
  expressionLanguage: { const: "tutorboard-expression/1" },
  grid: strictObject({
    automaticStep: { type: "boolean" },
    majorVisible: { type: "boolean" },
    minorVisible: { type: "boolean" },
    visible: { type: "boolean" },
    xStep: { type: ["number", "null"] },
    yStep: { type: ["number", "null"] },
  }),
  legend: strictObject({
    position: {
      enum: ["top-left", "top-right", "bottom-left", "bottom-right"],
    },
    visible: { type: "boolean" },
  }),
  parameters: array(reference("PlotParameter"), { maxItems: 32 }),
  series: array(reference("PlotSeries"), { maxItems: 32 }),
  size: strictObject({
    height: { maximum: 16_384, minimum: 100, type: "number" },
    width: { maximum: 16_384, minimum: 120, type: "number" },
  }),
});
const coordinatePlotObject = boardObject("math.coordinate-plot", {
  definition: reference("CoordinatePlotDefinition"),
});

const boardObjectUnion = {
  oneOf: [
    reference("PenStrokeObject"),
    reference("LineObject"),
    reference("RectangleObject"),
    reference("EllipseObject"),
    reference("TextObject"),
    reference("EmbeddedImageObject"),
    reference("SvgObject"),
    reference("CoordinatePlotObject"),
  ],
};
const boardGroup = strictObject({
  id: reference("Identifier"),
  locked: { type: "boolean" },
  objectIds: array(reference("Identifier"), { minItems: 1, uniqueItems: true }),
  transform: reference("Transform2D"),
});
const visualStyleOverride = {
  additionalProperties: false,
  minProperties: 1,
  properties: {
    fill: { type: ["string", "null"], maxLength: 256 },
    opacity: { maximum: 1, minimum: 0, type: "number" },
    stroke: { type: ["string", "null"], maxLength: 256 },
    strokeWidth: { minimum: 0, type: "number" },
  },
  type: "object",
};
const visualOverride = strictObject(
  {
    rotation: finiteNumber,
    scale: reference("PositiveVec2"),
    style: reference("VisualStyleOverride"),
    translation: reference("Vec2"),
  },
  ["rotation", "scale", "translation"],
);
const geometryImportRecord = strictObject({
  boardObjectIds: array(reference("Identifier"), {
    minItems: 1,
    uniqueItems: true,
  }),
  canonicalGir: {},
  createdAt: timestamp,
  geometryOsApiVersion: { const: "1.0.0" },
  girSchemaVersion: { const: "0.2.0" },
  id: reference("Identifier"),
  mapping: {
    additionalProperties: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
    type: "object",
  },
  prompt: { maxLength: 100_000, type: "string" },
  rawResponse: {},
  requestId: {
    type: ["string", "null"],
    pattern: "^[A-Za-z0-9._:-]{1,220}$",
  },
  rootGroupId: reference("Identifier"),
  visualOverrides: record(reference("VisualOverride")),
  visualTransform: reference("Transform2D"),
});
const boardDocument = strictObject({
  createdAt: timestamp,
  geometryImports: record(reference("GeometryImportRecord")),
  groups: record(reference("BoardGroup")),
  id: reference("Identifier"),
  objects: record(reference("BoardObject")),
  order: array(reference("Identifier"), { uniqueItems: true }),
  schemaVersion: { const: "1.2" },
  title: { maxLength: 256, minLength: 1, type: "string" },
  updatedAt: timestamp,
  viewport: reference("Viewport"),
});

const boardDefinitions = {
  BoardDocument: boardDocument,
  BoardGroup: boardGroup,
  BoardObject: boardObjectUnion,
  CoordinatePlotDefinition: coordinatePlotDefinition,
  CoordinatePlotObject: coordinatePlotObject,
  EllipseObject: ellipse,
  EmbeddedImageObject: embeddedImage,
  GeometryImportRecord: geometryImportRecord,
  GeometryOsObjectSource: geometryOsSource,
  Identifier: identifier,
  LineObject: line,
  ObjectStyle: objectStyle,
  ExplicitPlotSeries: explicitPlotSeries,
  ParametricPlotSeries: parametricPlotSeries,
  RelationPlotSeries: relationPlotSeries,
  PlotParameter: plotParameter,
  PlotSeries: plotSeries,
  PlotSeriesStyle: plotSeriesStyle,
  PenStrokeObject: penStroke,
  CubicBezierSegment: cubicBezierSegment,
  VectorInkData: vectorInkData,
  VectorInkSample: vectorInkSample,
  PositiveVec2: positiveVec2,
  RectangleObject: rectangle,
  Size2: size2,
  SvgObject: svgObject,
  SvgViewBox: svgViewBox,
  TextObject: text,
  Transform2D: transform2d,
  UserObjectSource: userSource,
  Vec2: vec2,
  Viewport: viewport,
  VisualOverride: visualOverride,
  VisualStyleOverride: visualStyleOverride,
};

function command(kind, properties = {}, required = Object.keys(properties)) {
  const metadata = {
    actorId: reference("Identifier"),
    id: reference("Identifier"),
    kind: { const: kind },
    timestamp,
  };
  return strictObject({ ...metadata, ...properties }, [
    ...Object.keys(metadata),
    ...required,
  ]);
}

const commands = {
  AddGroupCommand: command("core.groups.add", {
    group: reference("BoardGroup"),
  }),
  AddObjectsCommand: command(
    "core.objects.add",
    {
      atIndex: nonNegativeInteger,
      objects: array(reference("BoardObject"), { minItems: 1 }),
    },
    ["objects"],
  ),
  CutContentCommand: command("core.clipboard.cut", {
    geometryImportIds: array(reference("Identifier"), { uniqueItems: true }),
    groupIds: array(reference("Identifier"), { uniqueItems: true }),
    objectIds: array(reference("Identifier"), { uniqueItems: true }),
  }),
  DeleteObjectsCommand: command("core.objects.delete", {
    objectIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  ImportGeometryCommand: command("core.geometry.import", {
    group: reference("BoardGroup"),
    importRecord: reference("GeometryImportRecord"),
    objects: array(reference("BoardObject"), { minItems: 1 }),
  }),
  MoveGroupCommand: command("core.groups.move", {
    delta: reference("Vec2"),
    groupId: reference("Identifier"),
  }),
  SetGroupTransformCommand: command("core.groups.set-transform", {
    groupId: reference("Identifier"),
    transform: reference("Transform2D"),
  }),
  MoveObjectsCommand: command("core.objects.move", {
    delta: reference("Vec2"),
    objectIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  MoveSelectionCommand: command("core.selection.move", {
    delta: reference("Vec2"),
    groupIds: array(reference("Identifier"), { uniqueItems: true }),
    objectIds: array(reference("Identifier"), { uniqueItems: true }),
  }),
  OffsetGeometryLabelCommand: command("core.geometry.label-offset", {
    delta: reference("Vec2"),
    importId: reference("Identifier"),
    objectId: reference("Identifier"),
  }),
  PasteContentCommand: command("core.clipboard.paste", {
    geometryImports: array(reference("GeometryImportRecord")),
    groups: array(reference("BoardGroup")),
    objects: array(reference("BoardObject")),
  }),
  RemoveGroupsCommand: command("core.groups.remove", {
    groupIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  ReplaceObjectsCommand: command("core.objects.replace", {
    originals: array(reference("BoardObject"), { minItems: 1 }),
    replacements: array(reference("BoardObject"), { minItems: 1 }),
  }),
  RenameDocumentCommand: command("core.document.rename", {
    title: { maxLength: 256, minLength: 1, type: "string" },
  }),
  ReorderLayersCommand: command("core.layers.reorder", {
    mode: { enum: ["back", "backward", "forward", "front"] },
    objectIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
  }),
  SetGeometryVisualStyleCommand: command("core.geometry.style-override", {
    importId: reference("Identifier"),
    objectId: reference("Identifier"),
    style: reference("VisualStyleOverride"),
  }),
  SetLayerVisibilityCommand: command("core.layers.set-visibility", {
    objectIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
    visible: { type: "boolean" },
  }),
  SetSelectionLockCommand: command("core.selection.set-lock", {
    groupIds: array(reference("Identifier"), { uniqueItems: true }),
    locked: { type: "boolean" },
    objectIds: array(reference("Identifier"), { uniqueItems: true }),
  }),
  SetSelectionStyleCommand: command("core.selection.set-style", {
    objectIds: array(reference("Identifier"), {
      minItems: 1,
      uniqueItems: true,
    }),
    style: reference("VisualStyleOverride"),
  }),
  SetViewportCommand: command("core.viewport.set", {
    viewport: reference("Viewport"),
  }),
  TranslateGeometryImportCommand: command("core.geometry.translate", {
    delta: reference("Vec2"),
    importId: reference("Identifier"),
  }),
  UpdateCoordinatePlotCommand: command("core.coordinate-plot.update", {
    expected: reference("CoordinatePlotDefinition"),
    objectId: reference("Identifier"),
    replacement: reference("CoordinatePlotDefinition"),
  }),
  UpdateTextCommand: command("core.text.update", {
    objectId: reference("Identifier"),
    text: { maxLength: 100_000, type: "string" },
  }),
};
const boardCommand = {
  oneOf: Object.keys(commands).sort().map(reference),
};
const commandDefinitions = {
  ...boardDefinitions,
  ...commands,
  BoardCommand: boardCommand,
};

function rootSchema(id, title, root, definitions) {
  return {
    $defs: definitions,
    $id: id,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    ...root,
  };
}

export const schemas = {
  "board-command-envelope.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-command-envelope.schema.json",
    "BoardCommandEnvelope 1.1",
    strictObject({
      actorId: reference("Identifier"),
      baseRevision: nonNegativeInteger,
      commands: array(reference("BoardCommand"), {
        maxItems: 100,
        minItems: 1,
      }),
      documentId: reference("Identifier"),
      expectedDocumentSha256: {
        pattern: sha256Pattern,
        type: "string",
      },
      idempotencyKey: {
        maxLength: 128,
        minLength: 1,
        pattern: "^[A-Za-z0-9._:-]+$",
        type: "string",
      },
      schemaVersion: { const: "1.2" },
    }),
    commandDefinitions,
  ),
  "board-document.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-document.schema.json",
    "BoardDocument 1.1",
    reference("BoardDocument"),
    boardDefinitions,
  ),
  "board-geometry-import.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-geometry-import.schema.json",
    "BoardGeometryImport 1.1",
    strictObject({
      baseRevision: nonNegativeInteger,
      commandId: reference("Identifier"),
      createdAt: timestamp,
      documentId: reference("Identifier"),
      geometryOs: strictObject({
        apiVersion: { const: "1.0.0" },
        girSchemaVersion: { const: "0.2.0" },
        girSha256: { pattern: sha256Pattern, type: "string" },
        layoutDocumentVersion: { const: "0.1.0" },
        layoutSha256: { pattern: sha256Pattern, type: "string" },
        requestId: {
          maxLength: 220,
          minLength: 1,
          pattern: "^[A-Za-z0-9._:-]+$",
          type: "string",
        },
        serviceVersion: {
          pattern: "^0\\.[0-9]+\\.[0-9]+$",
          type: "string",
        },
      }),
      importId: reference("Identifier"),
      prompt: { maxLength: 100_000, minLength: 1, type: "string" },
      schemaVersion: { const: "1.2" },
    }),
    { Identifier: identifier },
  ),
  "board-snapshot.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-snapshot.schema.json",
    "BoardSnapshot 1.1",
    strictObject({
      createdAt: timestamp,
      document: reference("BoardDocument"),
      documentId: reference("Identifier"),
      documentSha256: { pattern: sha256Pattern, type: "string" },
      revision: nonNegativeInteger,
      schemaVersion: { const: "1.2" },
    }),
    boardDefinitions,
  ),
};

const readme = `# TutorBoard board contract v1

This directory is the machine-readable boundary between TutorBoard and the
server that persists and synchronizes boards. JSON uses TutorBoard's native
camelCase field names. Every schema is self-contained and targets JSON Schema
2020-12.

## Artifacts

- \`BoardDocument 1.1\` is the canonical persisted board state.
- \`BoardCommandEnvelope 1.1\` carries one atomic, idempotent command batch
  against a known base revision.
- \`BoardSnapshot 1.1\` binds a canonical document to a server revision and
  SHA-256 digest.
- \`BoardGeometryImport 1.1\` records GeometryOS GIR/Layout provenance without
  adding transport state to \`BoardDocument\`.

The manifest hashes every schema and canonical fixture. Run
\`npm run board-contract:check\` to verify freshness and executable validation.
The supported command matrix is recorded in \`COMPATIBILITY.md\`.

## Compatibility policy

- Additive: optional fields or new non-breaking metadata may be added in a
  minor contract revision after both consumers accept them.
- Minor: new command kinds or object kinds require fixtures, tolerant-reader
  evidence, and an explicit supported-version matrix.
- Breaking: removing or renaming fields, changing meanings or bounds, making an
  optional field required, or changing canonicalization requires a new major
  contract directory.

Unknown major versions and unknown persistent command/object kinds must be
rejected explicitly. Consumers must never silently discard unknown data.
`;

const compatibility = `# Board command compatibility

| Capability | Command kind | TutorBoard reader | Server reader |
| --- | --- | --- | --- |
| Base board editing | Existing \`core.*\` command set | 0.1.0+ | board/v1 |
| Atomic Smart Ink acceptance | \`core.objects.replace\` | This release+ | board/v1 with replace support |

\`core.objects.replace\` carries complete original and replacement snapshots.
Older strict readers reject this command explicitly. Deployments using server
sync must update the board/v1 reader before enabling Smart Ink for shared
boards.
`;

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

function canonicalPayload(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readBoardDocumentFixture() {
  return JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, "tests/fixtures/board-document-1.0.json"),
      "utf8",
    ),
  );
}

function legacyVectorInk(points) {
  const closed =
    points.length > 2 &&
    Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) <
      0.001;
  const source = closed ? points.slice(0, -1) : points;
  const centerline = [];
  const segment = (previous, start, end, next) => ({
    start: { ...start },
    control1: {
      x: start.x + (end.x - previous.x) / 6,
      y: start.y + (end.y - previous.y) / 6,
    },
    control2: {
      x: end.x - (next.x - start.x) / 6,
      y: end.y - (next.y - start.y) / 6,
    },
    end: { ...end },
  });
  if (closed) {
    for (let index = 0; index < source.length; index += 1) {
      centerline.push(
        segment(
          source[(index - 1 + source.length) % source.length],
          source[index],
          source[(index + 1) % source.length],
          source[(index + 2) % source.length],
        ),
      );
    }
  } else {
    for (let index = 0; index < source.length - 1; index += 1) {
      centerline.push(
        segment(
          source[Math.max(0, index - 1)],
          source[index],
          source[index + 1],
          source[Math.min(source.length - 1, index + 2)],
        ),
      );
    }
  }
  return {
    centerline,
    closed,
    samples: points.map((point, index) => ({
      point: { ...point },
      pressure: 0.5,
      timestampMs: index * 8,
    })),
    version: "1.0",
  };
}

function upgradeVectorInkDocument(document) {
  return {
    ...document,
    objects: Object.fromEntries(
      Object.entries(document.objects).map(([id, object]) => [
        id,
        object.kind === "drawing.pen-stroke"
          ? { ...object, ink: legacyVectorInk(object.points) }
          : object,
      ]),
    ),
    schemaVersion: "1.2",
  };
}

function fixtures() {
  const document = upgradeVectorInkDocument(readBoardDocumentFixture());
  const documentHash = sha256(canonicalPayload(document));
  const smartInkPoints = [
    { x: 10, y: 40 },
    { x: 40, y: 10 },
    { x: 70, y: 40 },
    { x: 40, y: 70 },
    { x: 10, y: 40 },
  ];
  const smartInkStroke = {
    groupId: null,
    id: "object:smart-ink-01",
    kind: "drawing.pen-stroke",
    ink: legacyVectorInk(smartInkPoints),
    locked: false,
    points: smartInkPoints,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#245d6b",
      strokeWidth: 3,
    },
    visible: true,
  };
  const smartInkCircle = {
    ...smartInkStroke,
    kind: "drawing.ellipse",
    position: { x: 40, y: 40 },
    radius: { x: 30, y: 30 },
  };
  delete smartInkCircle.points;
  return {
    "fixtures/board-command-envelope.json": {
      actorId: "actor:tutor-01",
      baseRevision: 7,
      commands: [
        {
          actorId: "actor:tutor-01",
          id: "command:rename-08",
          kind: "core.document.rename",
          timestamp: "2026-07-28T17:00:00.000Z",
          title: "Linear functions: lesson summary",
        },
        {
          actorId: "actor:tutor-01",
          id: "command:smart-ink-09",
          kind: "core.objects.replace",
          originals: [smartInkStroke],
          replacements: [smartInkCircle],
          timestamp: "2026-07-28T17:00:01.000Z",
        },
      ],
      documentId: document.id,
      expectedDocumentSha256: documentHash,
      idempotencyKey: "client:tutor-01:batch-08",
      schemaVersion: "1.2",
    },
    "fixtures/board-document.json": document,
    "fixtures/board-geometry-import.json": {
      baseRevision: 7,
      commandId: "command:geometry-import-08",
      createdAt: "2026-07-28T17:00:00.000Z",
      documentId: document.id,
      geometryOs: {
        apiVersion: "1.0.0",
        girSchemaVersion: "0.2.0",
        girSha256: "1".repeat(64),
        layoutDocumentVersion: "0.1.0",
        layoutSha256: "2".repeat(64),
        requestId: "geometryos:request-08",
        serviceVersion: "0.3.0",
      },
      importId: "import:geometry-08",
      prompt: "Постройте треугольник ABC.",
      schemaVersion: "1.2",
    },
    "fixtures/board-snapshot.json": {
      createdAt: "2026-07-28T17:00:00.000Z",
      document,
      documentId: document.id,
      documentSha256: documentHash,
      revision: 7,
      schemaVersion: "1.2",
    },
  };
}

export function generateBoardContract(outputRoot = contractRoot) {
  const files = {
    ...Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        canonicalJson(schema),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(fixtures()).map(([name, fixture]) => [
        name,
        canonicalJson(fixture),
      ]),
    ),
    "COMPATIBILITY.md": compatibility,
    "README.md": readme,
  };
  fs.mkdirSync(path.join(outputRoot, "fixtures"), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputRoot, relativePath), content);
  }

  const artifacts = Object.fromEntries(
    Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, content]) => [
        relativePath,
        { sha256: sha256(content) },
      ]),
  );
  const manifest = {
    artifacts,
    contract: "board/v1",
    schemas: {
      boardCommandEnvelope: "1.0",
      boardDocument: "1.0",
      boardGeometryImport: "1.0",
      boardSnapshot: "1.0",
    },
  };
  fs.writeFileSync(
    path.join(outputRoot, "manifest.json"),
    canonicalJson(manifest),
  );
}

export function listContractFiles(root = contractRoot) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute));
      }
    }
  }
  visit(root);
  return files.sort();
}

export function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}
