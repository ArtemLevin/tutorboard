import { readFile, writeFile } from "node:fs/promises";

const files = [
  {
    path: "tests/e2e/coordinate-plot-accessibility.spec.ts",
    marker: "const databaseName",
  },
  {
    path: "tests/e2e/coordinate-plot-editor.spec.ts",
    marker: "test(\"creates and persists",
  },
  {
    path: "tests/e2e/coordinate-plot-production.spec.ts",
    marker: "const databaseName",
  },
  {
    path: "tests/e2e/coordinate-plot-right-pan.spec.ts",
    marker: "interface ExportedPlotDocument",
  },
  {
    path: "tests/e2e/coordinate-plot-visual.spec.ts",
    marker: "const databaseName",
  },
  {
    path: "tests/e2e/object-settings-right-double-click.spec.ts",
    marker: "test(\"opens figure and graph settings",
  },
];

const importLine =
  'import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction";\n\n';
const helper = `async function openCoordinatePlotEditorByRightDoubleClick(\n  page: import("@playwright/test").Page,\n): Promise<void> {\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  const point = {\n    x: bounds.x + bounds.width / 2,\n    y: bounds.y + bounds.height / 2,\n  };\n  await page.mouse.click(point.x, point.y, { button: "right" });\n  await page.waitForTimeout(60);\n  await page.mouse.click(point.x, point.y, { button: "right" });\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeVisible();\n}\n\n`;

for (const { path, marker } of files) {
  let source = await readFile(path, "utf8");
  if (!source.includes(importLine)) {
    throw new Error(`Missing helper import in ${path}`);
  }
  source = source.replace(importLine, "");
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Missing insertion marker in ${path}`);
  source = `${source.slice(0, index)}${helper}${source.slice(index)}`;
  await writeFile(path, source);
}
