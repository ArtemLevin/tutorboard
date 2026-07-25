import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyContractArtifacts } from "./geometryos-contract-lib.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rootRequire = createRequire(path.join(repositoryRoot, "package.json"));
const ts = rootRequire("typescript");
const moduleRoot = path.join(repositoryRoot, "src/modules/geometry-import");
const sourceTypesPath = path.join(
  repositoryRoot,
  "src/adapters/geometryos-http/generated/geometryos.types.ts",
);
const sourceValidatorPath = path.join(
  repositoryRoot,
  "src/adapters/geometryos-http/generated/geometryos.validators.mjs",
);
const generatedRootRelative = "src/modules/geometry-import/generated";
const validatorRelative = `${generatedRootRelative}/gir.validators.mjs`;
const declarationRelative = `${generatedRootRelative}/gir.validators.d.mts`;
const typesRelative = `${generatedRootRelative}/gir.types.ts`;

export const geometryImportGeneratedFiles = [
  typesRelative,
  validatorRelative,
  declarationRelative,
];

const allowedCoreBindings = new Set([
  "BoardObjectId",
  "GeometryImportId",
  "GroupId",
  "JsonValue",
  "boardObjectId",
  "groupId",
]);
const forbiddenCalls = new Set([
  "Date.now",
  "Math.random",
  "crypto.getRandomValues",
  "crypto.randomUUID",
  "globalThis.crypto.getRandomValues",
  "globalThis.crypto.randomUUID",
  "performance.now",
]);
const forbiddenGlobals = new Set([
  "document",
  "indexedDB",
  "localStorage",
  "navigator",
  "window",
]);

function moduleSourceFiles(directory = moduleRoot) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "generated") {
        files.push(...moduleSourceFiles(absolute));
      }
      continue;
    }
    if (
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function propertyPath(node) {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const parent = propertyPath(node.expression);
    return parent === null ? null : `${parent}.${node.name.text}`;
  }
  return null;
}

function moduleSpecifier(statement) {
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return statement.moduleSpecifier.text;
  }
  return null;
}

function coreBindings(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause === undefined) {
      return [];
    }
    const bindings = [];
    if (clause.name !== undefined) {
      bindings.push("default");
    }
    if (clause.namedBindings !== undefined) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        bindings.push("*");
      } else {
        bindings.push(
          ...clause.namedBindings.elements.map(
            (element) => element.propertyName?.text ?? element.name.text,
          ),
        );
      }
    }
    return bindings;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.exportClause === undefined) {
      return ["*"];
    }
    if (ts.isNamespaceExport(statement.exportClause)) {
      return ["*"];
    }
    return statement.exportClause.elements.map(
      (element) => element.propertyName?.text ?? element.name.text,
    );
  }
  return [];
}

function verifyPureModuleBoundary() {
  const violations = [];
  for (const filePath of moduleSourceFiles()) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of sourceFile.statements) {
      const specifier = moduleSpecifier(statement);
      if (specifier === null) {
        continue;
      }
      if (!specifier.startsWith(".")) {
        violations.push(`${filePath}: external dependency ${specifier}`);
        continue;
      }
      const target = path.resolve(path.dirname(filePath), specifier);
      const relativeToModule = path.relative(moduleRoot, target);
      const corePublic = path.join(repositoryRoot, "src/core/public");
      if (
        target !== corePublic &&
        (relativeToModule.startsWith("..") || path.isAbsolute(relativeToModule))
      ) {
        violations.push(`${filePath}: dependency outside module ${specifier}`);
        continue;
      }
      if (target === corePublic) {
        for (const binding of coreBindings(statement)) {
          if (!allowedCoreBindings.has(binding)) {
            violations.push(`${filePath}: forbidden core binding ${binding}`);
          }
        }
      }
    }

    function visit(node) {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === "Date") {
          violations.push(`${filePath}: new Date`);
        }
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          violations.push(`${filePath}: dynamic import`);
        }
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require"
        ) {
          violations.push(`${filePath}: require`);
        }
        const call = propertyPath(node.expression);
        if (call !== null && forbiddenCalls.has(call)) {
          violations.push(`${filePath}: ${call}`);
        }
        if (
          call === "fetch" ||
          call === "globalThis.fetch" ||
          call === "window.fetch"
        ) {
          violations.push(`${filePath}: ${call}`);
        }
      }
      if (
        ts.isIdentifier(node) &&
        forbiddenGlobals.has(node.text) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      ) {
        violations.push(`${filePath}: browser global ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  if (violations.length > 0) {
    throw new Error(
      `Geometry import module violates its pure boundary:\n${[
        ...new Set(violations),
      ]
        .sort()
        .join("\n")}`,
    );
  }
}

function hashFile(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}


function schemaMemberName(member, sourceFile) {
  if (!ts.isPropertySignature(member) || member.name === undefined) {
    return null;
  }
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
    return member.name.text;
  }
  return member.name.getText(sourceFile);
}

function referencedSchemaNames(node, sourceFile) {
  const names = new Set();
  function visit(current) {
    if (ts.isIndexedAccessTypeNode(current)) {
      const text = current.getText(sourceFile);
      const match = text.match(/^components\[\"schemas\"\]\[\"([^\"]+)\"\]$/);
      if (match?.[1] !== undefined) {
        names.add(match[1]);
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return names;
}

function generateGirTypes(source) {
  const sourceFile = ts.createSourceFile(
    sourceTypesPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const components = sourceFile.statements.find(
    (statement) =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === "components",
  );
  if (components === undefined) {
    throw new Error("Generated GeometryOS components interface is missing.");
  }
  const schemas = components.members.find(
    (member) =>
      ts.isPropertySignature(member) &&
      schemaMemberName(member, sourceFile) === "schemas" &&
      member.type !== undefined &&
      ts.isTypeLiteralNode(member.type),
  );
  if (
    schemas === undefined ||
    !ts.isPropertySignature(schemas) ||
    schemas.type === undefined ||
    !ts.isTypeLiteralNode(schemas.type)
  ) {
    throw new Error("Generated GeometryOS schema registry is missing.");
  }
  const membersByName = new Map();
  for (const member of schemas.type.members) {
    const name = schemaMemberName(member, sourceFile);
    if (name !== null) {
      membersByName.set(name, member);
    }
  }
  const pending = ["GirScene"];
  const selected = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || selected.has(name)) {
      continue;
    }
    const member = membersByName.get(name);
    if (member === undefined) {
      throw new Error(`Generated GIR schema dependency is missing: ${name}`);
    }
    selected.add(name);
    for (const dependency of referencedSchemaNames(member, sourceFile)) {
      if (!selected.has(dependency)) {
        pending.push(dependency);
      }
    }
  }
  const rendered = [...selected]
    .sort()
    .map((name) => {
      const member = membersByName.get(name);
      const lines = source
        .slice(member.getFullStart(), member.end)
        .split("\n");
      while (lines.length > 0 && lines[0].trim().length === 0) {
        lines.shift();
      }
      const baseline = Math.min(
        ...lines
          .filter((line) => line.trim().length > 0)
          .map((line) => line.match(/^ */)?.[0].length ?? 0),
      );
      return lines
        .map(
          (line) =>
            `    ${line.slice(Math.min(baseline, line.length))}`,
        )
        .join("\n");
    })
    .join("\n");
  return `/**\n * Generated from the pinned GeometryOS OpenAPI contract.\n * Do not edit directly.\n */\nexport interface components {\n  schemas: {\n${rendered}\n  };\n}\n`;
}

function validatorDeclarationSource() {
  return `export interface GeneratedValidationError {\n  readonly instancePath: string;\n  readonly keyword: string;\n  readonly message?: string;\n  readonly params: unknown;\n  readonly schemaPath: string;\n}\n\nexport interface GeneratedValidator {\n  (value: unknown): boolean;\n  readonly errors?: readonly GeneratedValidationError[] | null;\n}\n\nexport const validateGirScene: GeneratedValidator;\n`;
}

function assertSelfContainedValidator(functionName, functionSource) {
  const validatorCalls = [
    ...functionSource.matchAll(/\b(validate\d+)\s*\(/g),
  ].map((match) => match[1]);
  const externalValidators = validatorCalls.filter(
    (candidate) => candidate !== functionName,
  );
  const forbidden = [
    ...externalValidators,
    ...[...functionSource.matchAll(/\b(func\d+|schema\d+)\b/g)].map(
      (match) => match[1],
    ),
  ];
  if (forbidden.length > 0 || /\brequire\s*\(/.test(functionSource)) {
    throw new Error(
      `Generated GIR validator is no longer self-contained: ${[
        ...new Set(forbidden),
      ]
        .sort()
        .join(", ")}`,
    );
  }
}

function extractGirValidator(source) {
  const callMatch = source.match(
    /if\(!\((validate\d+)\(data\.gir, \{instancePath:instancePath\+"\/gir"/,
  );
  if (callMatch?.[1] === undefined) {
    throw new Error(
      "Unable to locate the generated GirScene validator from the success response.",
    );
  }
  const functionName = callMatch[1];
  const sourceFile = ts.createSourceFile(
    sourceValidatorPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  );
  if (declaration === undefined) {
    throw new Error(
      `Generated validator function is missing: ${functionName}`,
    );
  }
  const evaluated = sourceFile.statements.find((statement) => {
    if (!ts.isExpressionStatement(statement)) {
      return false;
    }
    const expression = statement.expression;
    return (
      ts.isBinaryExpression(expression) &&
      propertyPath(expression.left) === `${functionName}.evaluated`
    );
  });
  if (evaluated === undefined) {
    throw new Error(
      `Generated validator evaluated metadata is missing: ${functionName}`,
    );
  }
  const functionSource = source.slice(
    declaration.getStart(sourceFile),
    declaration.end,
  );
  assertSelfContainedValidator(functionName, functionSource);
  const evaluatedSource = source.slice(
    evaluated.getStart(sourceFile),
    evaluated.end,
  );
  return `"use strict";\nexport const validateGirScene = ${functionName};\n${functionSource}\n${evaluatedSource}\n`;
}

export function generateGeometryImportContract(outputRoot = repositoryRoot) {
  verifyContractArtifacts();
  for (const required of [sourceTypesPath, sourceValidatorPath]) {
    if (!fs.existsSync(required)) {
      throw new Error(
        "Generate the pinned GeometryOS contract before the GIR semantic contract.",
      );
    }
  }
  const generatedRoot = path.join(outputRoot, generatedRootRelative);
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, typesRelative),
    generateGirTypes(fs.readFileSync(sourceTypesPath, "utf8")),
  );
  fs.writeFileSync(
    path.join(outputRoot, validatorRelative),
    extractGirValidator(fs.readFileSync(sourceValidatorPath, "utf8")),
  );
  fs.writeFileSync(
    path.join(outputRoot, declarationRelative),
    validatorDeclarationSource(),
  );
}

function compareGenerated(outputRoot) {
  const mismatches = [];
  for (const relativePath of geometryImportGeneratedFiles) {
    const expected = path.join(repositoryRoot, relativePath);
    const actual = path.join(outputRoot, relativePath);
    if (
      !fs.existsSync(expected) ||
      !fs.existsSync(actual) ||
      hashFile(expected) !== hashFile(actual)
    ) {
      mismatches.push(relativePath);
    }
  }
  return mismatches;
}

async function verifyRuntime() {
  const validatorPath = path.join(repositoryRoot, validatorRelative);
  const module = await import(
    `${pathToFileURL(validatorPath).href}?sha256=${hashFile(validatorPath)}`
  );
  if (typeof module.validateGirScene !== "function") {
    throw new Error("Generated GIR validator export is missing.");
  }
  const response = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        "contracts/geometryos/fixtures/generate-success.response.json",
      ),
      "utf8",
    ),
  );
  if (!module.validateGirScene(response.gir)) {
    throw new Error("Generated GIR validator rejected the pinned success fixture.");
  }
  const invalid = { ...response.gir };
  delete invalid.objects;
  if (module.validateGirScene(invalid)) {
    throw new Error("Generated GIR validator accepted an invalid scene.");
  }
  if (!Array.isArray(module.validateGirScene.errors)) {
    throw new Error("Generated GIR validator did not expose validation errors.");
  }
}

export async function checkGeometryImportContract() {
  verifyPureModuleBoundary();
  const artifactRoot = process.env.GEOMETRY_IMPORT_GENERATED_ARTIFACT_DIR;
  const outputRoot = artifactRoot
    ? path.resolve(artifactRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), "tutorboard-gir-contract-"));
  try {
    generateGeometryImportContract(outputRoot);
    const mismatches = compareGenerated(outputRoot);
    if (mismatches.length > 0) {
      throw new Error(
        `Generated GIR semantic contract is stale: ${mismatches.join(", ")}`,
      );
    }
    await verifyRuntime();
  } finally {
    if (!artifactRoot) {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  }
}
