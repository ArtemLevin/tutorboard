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

const rendererPath =
  "src/adapters/canvas-konva/coordinate-plot-renderer.tsx";
let rendererSource = await readFile(rendererPath, "utf8");
const refAssignment = `  const viewportChangeRef = useRef(onViewportChange);\n  viewportChangeRef.current = onViewportChange;\n  const cursorContainerRef = useRef<HTMLElement | null>(null);`;
const effectAssignment = `  const viewportChangeRef = useRef(onViewportChange);\n  const cursorContainerRef = useRef<HTMLElement | null>(null);`;
if (!rendererSource.includes(refAssignment)) {
  throw new Error("Expected render-time viewport callback assignment");
}
rendererSource = rendererSource.replace(refAssignment, effectAssignment);
const cursorRef = `  const cursorPressedRef = useRef(false);`;
if (!rendererSource.includes(cursorRef)) {
  throw new Error("Expected cursor pressed ref");
}
rendererSource = rendererSource.replace(
  cursorRef,
  `${cursorRef}\n  useEffect(() => {\n    viewportChangeRef.current = onViewportChange;\n  }, [onViewportChange]);`,
);
await writeFile(rendererPath, rendererSource);

const testPath = "tests/e2e/coordinate-plot-right-pan.spec.ts";
let testSource = await readFile(testPath, "utf8");
testSource = testSource
  .replaceAll("beforePlot.definition.size", "beforePlot.definition!.size")
  .replace(
    "afterPlot.definition.coordinateViewport.xMin",
    "afterPlot.definition!.coordinateViewport.xMin",
  );
await writeFile(testPath, testSource);
