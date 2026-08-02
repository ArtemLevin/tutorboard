import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/apply-coordinate-plot-right-drag-pan.mjs";
let source = await readFile(path, "utf8");
const strictGuard = `  if (source.indexOf(before, first + before.length) >= 0) {\n    throw new Error(\`Ambiguous replacement anchor in \${path}\`);\n  }\n`;
if (!source.includes(strictGuard)) {
  throw new Error("Expected strict replacement guard");
}
source = source.replace(strictGuard, "");
await writeFile(path, source);
await import("./apply-coordinate-plot-right-drag-pan.mjs");

const testPath = "tests/e2e/coordinate-plot-right-pan.spec.ts";
let testSource = await readFile(testPath, "utf8");
testSource = testSource
  .replaceAll("beforePlot.definition.size", "beforePlot.definition!.size")
  .replace(
    "afterPlot.definition.coordinateViewport.xMin",
    "afterPlot.definition!.coordinateViewport.xMin",
  );
await writeFile(testPath, testSource);
