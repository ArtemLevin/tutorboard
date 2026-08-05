import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

const boardPath = "src/adapters/canvas-konva/BoardStage.tsx";
let board = readFileSync(boardPath, "utf8");
board = replaceOnce(
  board,
  `  readonly panMode: boolean;\n  readonly previewItems?: readonly BoardRenderItem[];`,
  `  readonly panMode: boolean;\n  readonly primaryCanvasGesturesEnabled?: boolean;\n  readonly previewItems?: readonly BoardRenderItem[];`,
  "BoardStage gesture eligibility prop",
);
board = replaceOnce(
  board,
  `  onSelectionTransform,\n  panMode,\n  previewItems = [],`,
  `  onSelectionTransform,\n  panMode,\n  primaryCanvasGesturesEnabled = false,\n  previewItems = [],`,
  "BoardStage gesture eligibility default",
);
board = replaceOnce(
  board,
  `    if (event.button !== 0) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }`,
  `    if (event.button !== 0 || !primaryCanvasGesturesEnabled) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }`,
  "capture eligibility guard",
);
writeFileSync(boardPath, board);

const appPath = "src/app/App.tsx";
let app = readFileSync(appPath, "utf8");
app = replaceOnce(
  app,
  `          panMode={activeTool === navigationToolId}\n          previewItems={previewItems}`,
  `          panMode={activeTool === navigationToolId}\n          primaryCanvasGesturesEnabled={\n            activeTool === navigationToolId ||\n            activeTool === "drawing.pen" ||\n            activeTool === "drawing.smart-ink" ||\n            isSelectionToolId(activeTool)\n          }\n          previewItems={previewItems}`,
  "App gesture eligibility",
);
writeFileSync(appPath, app);
