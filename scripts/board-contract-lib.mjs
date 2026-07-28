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
const boardObjectUnion = {
  oneOf: [
    reference("PenStrokeObject"),
    reference("LineObject"),
    reference("RectangleObject"),
    reference("EllipseObject"),
    reference("TextObject"),
    reference("SvgObject"),
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
  schemaVersion: { const: "1.0" },
  title: { maxLength: 256, minLength: 1, type: "string" },
  updatedAt: timestamp,
  viewport: reference("Viewport"),
});

const boardDefinitions = {
  BoardDocument: boardDocument,
  BoardGroup: boardGroup,
  BoardObject: boardObjectUnion,
  EllipseObject: ellipse,
  GeometryImportRecord: geometryImportRecord,
  GeometryOsObjectSource: geometryOsSource,
  Identifier: identifier,
  LineObject: line,
  ObjectStyle: objectStyle,
  PenStrokeObject: penStroke,
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
    "BoardCommandEnvelope 1.0",
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
      schemaVersion: { const: "1.0" },
    }),
    commandDefinitions,
  ),
  "board-document.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-document.schema.json",
    "BoardDocument 1.0",
    reference("BoardDocument"),
    boardDefinitions,
  ),
  "board-geometry-import.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-geometry-import.schema.json",
    "BoardGeometryImport 1.0",
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
      schemaVersion: { const: "1.0" },
    }),
    { Identifier: identifier },
  ),
  "board-snapshot.schema.json": rootSchema(
    "https://contracts.tutorboard.dev/board/v1/board-snapshot.schema.json",
    "BoardSnapshot 1.0",
    strictObject({
      createdAt: timestamp,
      document: reference("BoardDocument"),
      documentId: reference("Identifier"),
      documentSha256: { pattern: sha256Pattern, type: "string" },
      revision: nonNegativeInteger,
      schemaVersion: { const: "1.0" },
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

- \`BoardDocument 1.0\` is the canonical persisted board state.
- \`BoardCommandEnvelope 1.0\` carries one atomic, idempotent command batch
  against a known base revision.
- \`BoardSnapshot 1.0\` binds a canonical document to a server revision and
  SHA-256 digest.
- \`BoardGeometryImport 1.0\` records GeometryOS GIR/Layout provenance without
  adding transport state to \`BoardDocument\`.

The manifest hashes every schema and canonical fixture. Run
\`npm run board-contract:check\` to verify freshness and executable validation.

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

function fixtures() {
  const document = readBoardDocumentFixture();
  const documentHash = sha256(canonicalPayload(document));
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
      ],
      documentId: document.id,
      expectedDocumentSha256: documentHash,
      idempotencyKey: "client:tutor-01:batch-08",
      schemaVersion: "1.0",
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
      schemaVersion: "1.0",
    },
    "fixtures/board-snapshot.json": {
      createdAt: "2026-07-28T17:00:00.000Z",
      document,
      documentId: document.id,
      documentSha256: documentHash,
      revision: 7,
      schemaVersion: "1.0",
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
