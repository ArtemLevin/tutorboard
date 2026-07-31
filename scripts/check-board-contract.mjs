import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  contractRoot,
  fileSha256,
  generateBoardContract,
  listContractFiles,
  repositoryRoot,
  schemas,
} from "./board-contract-lib.mjs";

const require = createRequire(path.join(repositoryRoot, "package.json"));
const Ajv2020 = require("ajv/dist/2020").default;
const ts = require("typescript");

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function sourceLiteralArray(relativePath, variableName) {
  const filePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variableName &&
        declaration.initializer !== undefined
      ) {
        const initializer = unwrapExpression(declaration.initializer);
        if (!ts.isArrayLiteralExpression(initializer)) {
          break;
        }
        return initializer.elements.map((element) => {
          if (!ts.isStringLiteral(element)) {
            throw new Error(
              `${variableName} must contain string literals only.`,
            );
          }
          return element.text;
        });
      }
    }
  }
  throw new Error(`Cannot find ${variableName} in ${relativePath}.`);
}

function assertFresh() {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tutorboard-board-contract-"),
  );
  try {
    generateBoardContract(temporaryRoot);
    const expected = listContractFiles(temporaryRoot);
    const actual = listContractFiles(contractRoot);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Board contract file set is stale: expected ${expected.join(", ")}, received ${actual.join(", ")}`,
      );
    }
    for (const relativePath of expected) {
      const generated = path.join(temporaryRoot, relativePath);
      const committed = path.join(contractRoot, relativePath);
      if (fileSha256(generated) !== fileSha256(committed)) {
        throw new Error(
          `Board contract artifact is stale: ${relativePath}. Run npm run board-contract:generate.`,
        );
      }
    }
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function validateFixtures() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateFormats: false,
  });
  const pairs = [
    ["board-document.schema.json", "board-document.json"],
    ["board-command-envelope.schema.json", "board-command-envelope.json"],
    ["board-snapshot.schema.json", "board-snapshot.json"],
    ["board-geometry-import.schema.json", "board-geometry-import.json"],
  ];
  for (const [schemaName, fixtureName] of pairs) {
    const validate = ajv.compile(schemas[schemaName]);
    const fixture = JSON.parse(
      fs.readFileSync(path.join(contractRoot, "fixtures", fixtureName), "utf8"),
    );
    if (!validate(fixture)) {
      throw new Error(
        `${fixtureName} does not satisfy ${schemaName}: ${ajv.errorsText(validate.errors)}`,
      );
    }
  }
}

function verifySourceParity() {
  const sourceCommandKinds = sourceLiteralArray(
    "src/core/board/commands/commands.ts",
    "boardCommandKinds",
  ).sort();
  const schemaCommandKinds = Object.values(
    schemas["board-command-envelope.schema.json"].$defs,
  )
    .map((definition) => definition?.properties?.kind?.const)
    .filter((kind) => typeof kind === "string" && kind.startsWith("core."))
    .sort();
  if (
    JSON.stringify(sourceCommandKinds) !== JSON.stringify(schemaCommandKinds)
  ) {
    throw new Error(
      `Board command schema does not match source kinds: source=${sourceCommandKinds.join(",")}; schema=${schemaCommandKinds.join(",")}`,
    );
  }

  const sourceObjectKinds = sourceLiteralArray(
    "src/core/board/objects.ts",
    "boardObjectKinds",
  ).sort();
  const schemaObjectKinds = [
    "CoordinatePlotObject",
    "EllipseObject",
    "EmbeddedImageObject",
    "LineObject",
    "PenStrokeObject",
    "RectangleObject",
    "SvgObject",
    "TextObject",
  ]
    .map(
      (name) =>
        schemas["board-document.schema.json"].$defs[name].properties.kind.const,
    )
    .sort();
  if (JSON.stringify(sourceObjectKinds) !== JSON.stringify(schemaObjectKinds)) {
    throw new Error(
      `Board object schema does not match source kinds: source=${sourceObjectKinds.join(",")}; schema=${schemaObjectKinds.join(",")}`,
    );
  }
}

assertFresh();
validateFixtures();
verifySourceParity();
console.log("TutorBoard board/v1 contract is fresh and executable.");
