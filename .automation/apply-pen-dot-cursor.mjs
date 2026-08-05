import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

const boardPath = "src/adapters/canvas-konva/BoardStage.tsx";
let board = readFileSync(boardPath, "utf8");

board = replaceOnce(
  board,
  `const canvasPrimaryClickDelayMs = 500;\n`,
  `const canvasPrimaryClickDelayMs = 500;\nconst penDotCursor =\n  'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%229%22 height=%229%22 viewBox=%220 0 9 9%22%3E%3Ccircle cx=%224.5%22 cy=%224.5%22 r=%222.25%22 fill=%22%23245d6b%22 stroke=%22%23ffffff%22 stroke-width=%221%22/%3E%3C/svg%3E") 4 4, crosshair';\n`,
  "pen dot cursor constant",
);

const oldCursor = `  const cursor =\n    isPanning || isTransforming\n      ? "grabbing"\n      : laserActive\n        ? "none"\n        : panMode || spacePressed\n          ? "grab"\n          : selectionModeKey === "selection.lasso"\n            ? "crosshair"\n            : selectionModeKey !== null\n              ? "default"\n              : drawingModeKey === null\n                ? "default"\n                : "crosshair";\n`;
const newCursor = `  const usesPenDotCursor =\n    drawingModeKey === "drawing.pen" ||\n    drawingModeKey === "drawing.smart-ink";\n  const cursorKind =\n    isPanning || isTransforming\n      ? "grabbing"\n      : laserActive\n        ? "hidden"\n        : panMode || spacePressed\n          ? "grab"\n          : selectionModeKey === "selection.lasso"\n            ? "crosshair"\n            : selectionModeKey !== null\n              ? "default"\n              : usesPenDotCursor\n                ? "pen-dot"\n                : drawingModeKey === null\n                  ? "default"\n                  : "crosshair";\n  const cursor = cursorKind === "pen-dot" ? penDotCursor : cursorKind === "hidden" ? "none" : cursorKind;\n`;
board = replaceOnce(board, oldCursor, newCursor, "cursor selection");

board = replaceOnce(
  board,
  `      data-drawing={isDrawing}\n      data-drawing-mode={drawingModeKey ?? "none"}\n`,
  `      data-cursor-kind={cursorKind}\n      data-drawing={isDrawing}\n      data-drawing-mode={drawingModeKey ?? "none"}\n`,
  "cursor diagnostic",
);

writeFileSync(boardPath, board);

const testPath = "tests/e2e/canvas-mode-gestures.spec.ts";
let test = readFileSync(testPath, "utf8");
const marker = `test("keeps drag gestures in their active tools", async ({ page }) => {`;
const cursorTest = `test("shows a compact dot for pen cursors and keeps crosshair for shape tools", async ({\n  page,\n}) => {\n  const stage = page.getByTestId("board-stage");\n\n  await selectPen(page);\n  await expect(stage).toHaveAttribute("data-cursor-kind", "pen-dot");\n  expect(await stage.evaluate((element) => getComputedStyle(element).cursor)).toContain(\n    "url(\",\n  );\n\n  const point = await stagePoint(page, 480, 260);\n  await page.mouse.click(point.x, point.y);\n  await expect(stage).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.smart-ink",\n  );\n  await expect(stage).toHaveAttribute("data-cursor-kind", "pen-dot");\n\n  await page.keyboard.press("r");\n  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.rectangle");\n  await expect(stage).toHaveAttribute("data-cursor-kind", "crosshair");\n  await expect(stage).toHaveCSS("cursor", "crosshair");\n});\n\n`;
test = replaceOnce(test, marker, cursorTest + marker, "cursor e2e insertion");
writeFileSync(testPath, test);
