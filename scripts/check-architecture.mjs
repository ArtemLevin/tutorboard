import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { analyzeSource, isSourceFile } from "./architecture-rules.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const srcRoot = path.join(repositoryRoot, "src");
const plotExpressionRoot = path.join(srcRoot, "core", "plot-expression");

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function plotExpressionViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const externalImports = [
    ...sourceText.matchAll(/(?:\bfrom\s+|\bimport\s*)(["'])([^"']+)\1/gu),
  ]
    .map((match) => match[2])
    .filter((specifier) => !specifier.startsWith("."));

  for (const specifier of externalImports) {
    violations.push({
      filePath,
      invariant: "PLOT-001",
      message: "the expression engine may import only its own relative modules",
      specifier,
    });
  }

  for (const [pattern, specifier] of [
    [/\beval\s*\(/u, "eval"],
    [/\b(?:new\s+)?Function\s*\(/u, "Function"],
    [/\bimport\s*\(/u, "dynamic import"],
  ]) {
    if (pattern.test(sourceText)) {
      violations.push({
        filePath,
        invariant: "PLOT-002",
        message: "the expression engine cannot execute dynamic code",
        specifier,
      });
    }
  }
  return violations;
}

const sourceFiles = collectFiles(srcRoot).filter(isSourceFile);
const violations = [
  ...sourceFiles.flatMap((filePath) =>
    analyzeSource({
      filePath,
      sourceText: fs.readFileSync(filePath, "utf8"),
      srcRoot,
    }),
  ),
  ...sourceFiles
    .filter((filePath) =>
      filePath.startsWith(`${plotExpressionRoot}${path.sep}`),
    )
    .flatMap(plotExpressionViolations),
];

if (violations.length > 0) {
  for (const item of violations) {
    const relativePath = path.relative(repositoryRoot, item.filePath);
    console.error(
      `${item.invariant} ${relativePath}: ${item.message} (${item.specifier})`,
    );
  }
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries passed.");
}
