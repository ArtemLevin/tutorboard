import path from "node:path";

import ts from "typescript";

const sourceExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);
const coreRuntimeDependencies = new Set([
  "dexie",
  "konva",
  "react",
  "react-dom",
  "react-konva",
  "zustand",
]);

function packageName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : (segments[0] ?? specifier);
}

function sourceLocation(filePath, srcRoot) {
  const relativePath = path.relative(srcRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  const segments = relativePath.split(path.sep);
  return {
    layer: segments[0] ?? null,
    owner:
      segments[0] === "modules" || segments[0] === "adapters"
        ? (segments[1] ?? null)
        : null,
  };
}

function resolveLocalTarget(filePath, specifier, srcRoot) {
  if (specifier.startsWith("@/")) {
    return path.resolve(srcRoot, specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(filePath), specifier);
  }

  return null;
}

function isPublicModuleImport(specifier) {
  return /(?:^|\/)public(?:\.[cm]?tsx?)?$/.test(specifier);
}

function collectSpecifiers(sourceFile) {
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")
      ) {
        specifiers.push(node.arguments[0].text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function violation(invariant, filePath, specifier, message) {
  return { invariant, filePath, specifier, message };
}

export function analyzeSource({ filePath, sourceText, srcRoot }) {
  const importer = sourceLocation(filePath, srcRoot);

  if (importer?.layer === null || importer === null) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];

  for (const specifier of collectSpecifiers(sourceFile)) {
    const targetPath = resolveLocalTarget(filePath, specifier, srcRoot);

    if (targetPath === null) {
      if (
        importer.layer === "core" &&
        coreRuntimeDependencies.has(packageName(specifier))
      ) {
        violations.push(
          violation(
            "ARCH-001",
            filePath,
            specifier,
            "core cannot depend on UI, canvas, state, or persistence runtimes",
          ),
        );
      }
      continue;
    }

    const target = sourceLocation(targetPath, srcRoot);
    if (target === null || target.layer === null) {
      continue;
    }

    if (target.layer === "app" && importer.layer !== "app") {
      violations.push(
        violation(
          "ARCH-004",
          filePath,
          specifier,
          "only app may own or import application composition",
        ),
      );
      continue;
    }

    if (importer.layer === "core" && target.layer !== "core") {
      violations.push(
        violation(
          "ARCH-001",
          filePath,
          specifier,
          "core dependencies must remain inside core",
        ),
      );
      continue;
    }

    if (importer.layer === "shared" && target.layer !== "shared") {
      violations.push(
        violation(
          "ARCH-001",
          filePath,
          specifier,
          "shared cannot depend on application or domain layers",
        ),
      );
      continue;
    }

    if (
      importer.layer === "adapters" &&
      (target.layer === "modules" ||
        (target.layer === "adapters" && target.owner !== importer.owner))
    ) {
      violations.push(
        violation(
          "ARCH-001",
          filePath,
          specifier,
          "adapters may depend only on core and platform-neutral shared code",
        ),
      );
      continue;
    }

    if (importer.layer === "modules" && target.layer === "adapters") {
      violations.push(
        violation(
          "ARCH-001",
          filePath,
          specifier,
          "feature modules cannot depend on technology adapters",
        ),
      );
      continue;
    }

    if (
      importer.layer === "modules" &&
      target.layer === "modules" &&
      target.owner !== importer.owner &&
      !isPublicModuleImport(specifier)
    ) {
      violations.push(
        violation(
          "ARCH-002",
          filePath,
          specifier,
          "cross-module imports must target the module public contract",
        ),
      );
    }
  }

  return violations;
}

export function isSourceFile(filePath) {
  return (
    sourceExtensions.has(path.extname(filePath)) && !filePath.endsWith(".d.ts")
  );
}
