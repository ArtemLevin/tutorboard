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

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

const violations = collectFiles(srcRoot)
  .filter(isSourceFile)
  .flatMap((filePath) =>
    analyzeSource({
      filePath,
      sourceText: fs.readFileSync(filePath, "utf8"),
      srcRoot,
    }),
  );

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
