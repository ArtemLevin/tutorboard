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
const plotSamplingRoot = path.join(srcRoot, "core", "plot-sampling");
const handwrittenFunctionRoot = path.join(
  srcRoot,
  "modules",
  "handwritten-function",
);

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function externalImports(sourceText) {
  return [...sourceText.matchAll(/(?:\bfrom\s+|\bimport\s*)(["'])([^"']+)\1/gu)]
    .map((match) => match[2])
    .filter((specifier) => !specifier.startsWith("."));
}

function plotExpressionViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const violations = [];

  for (const specifier of externalImports(sourceText)) {
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

function plotSamplingViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const violations = [];

  for (const specifier of externalImports(sourceText)) {
    violations.push({
      filePath,
      invariant: "PLOT-003",
      message: "the numerical sampler may import only relative core modules",
      specifier,
    });
  }

  for (const [pattern, specifier] of [
    [
      /\b(?:window|document|localStorage|sessionStorage|indexedDB)\b/u,
      "browser state",
    ],
    [/\b(?:XMLHttpRequest|WebSocket|fetch)\b/u, "network API"],
    [/\b(?:Date\.now|Math\.random|performance\.now)\b/u, "nondeterminism"],
    [/\b(?:setTimeout|setInterval|queueMicrotask)\b/u, "scheduler API"],
    [/\beval\s*\(/u, "eval"],
    [/\b(?:new\s+)?Function\s*\(/u, "Function"],
    [/\bimport\s*\(/u, "dynamic import"],
  ]) {
    if (pattern.test(sourceText)) {
      violations.push({
        filePath,
        invariant: "PLOT-004",
        message:
          "the numerical sampler must remain deterministic and worker-compatible",
        specifier,
      });
    }
  }
  return violations;
}

function handwrittenFunctionViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const violations = [];

  for (const specifier of externalImports(sourceText)) {
    violations.push({
      filePath,
      invariant: "HWR-001",
      message:
        "the handwritten function domain may import only its own relative modules",
      specifier,
    });
  }

  for (const [pattern, specifier] of [
    [
      /\b(?:window|document|localStorage|sessionStorage|indexedDB)\b/u,
      "browser or storage state",
    ],
    [/\b(?:XMLHttpRequest|WebSocket|fetch)\b/u, "network API"],
    [
      /\b(?:Date\.now|Math\.random|performance\.now|crypto\.randomUUID)\b/u,
      "nondeterminism",
    ],
    [/\b(?:setTimeout|setInterval)\b/u, "scheduler API"],
    [/\beval\s*\(/u, "eval"],
    [/\b(?:new\s+)?Function\s*\(/u, "Function"],
    [/\bimport\s*\(/u, "dynamic import"],
  ]) {
    if (pattern.test(sourceText)) {
      violations.push({
        filePath,
        invariant: "HWR-002",
        message:
          "the handwritten function domain must remain transient and provider-neutral",
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
  ...sourceFiles
    .filter((filePath) => filePath.startsWith(`${plotSamplingRoot}${path.sep}`))
    .flatMap(plotSamplingViolations),
  ...sourceFiles
    .filter((filePath) =>
      filePath.startsWith(`${handwrittenFunctionRoot}${path.sep}`),
    )
    .flatMap(handwrittenFunctionViolations),
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
