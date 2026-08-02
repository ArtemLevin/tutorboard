import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const e2eRoot = "tests/e2e";
const helperImport =
  'import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction";\n';
const createPlotPattern =
  /(await page\s*\.getByRole\(\s*"button",\s*\{\s*name:\s*"Создать координатную плоскость \(G\)"\s*\}\s*\)\s*\.click\(\);)/gu;
const layerEnterPattern =
  /await page\.getByRole\("button", \{ name: "math\.coordinate-plot" \}\)\.click\(\);\s*await page\.keyboard\.press\("Enter"\);/gu;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(target)));
    else files.push(target);
  }
  return files;
}

for (const file of await filesIn(e2eRoot)) {
  if (!file.endsWith(".ts") || file.endsWith("coordinate-plot-interaction.ts")) {
    continue;
  }
  let source = await readFile(file, "utf8");
  if (!source.includes("Создать координатную плоскость (G)")) continue;
  if (!source.includes(helperImport.trim())) source = `${helperImport}\n${source}`;
  source = source.replace(
    createPlotPattern,
    "$1\n  await openCoordinatePlotEditorByRightDoubleClick(page);",
  );
  source = source.replace(
    layerEnterPattern,
    `await page\n    .getByRole("button", { name: "math.coordinate-plot" })\n    .click();\n  await openCoordinatePlotEditorByRightDoubleClick(page);`,
  );
  await writeFile(file, source);
}

await writeFile(
  path.join(e2eRoot, "coordinate-plot-interaction.ts"),
  `import { expect, type Page } from "@playwright/test";\n\nexport async function rightDoubleClickBoardCenter(page: Page): Promise<void> {\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  const point = {\n    x: bounds.x + bounds.width / 2,\n    y: bounds.y + bounds.height / 2,\n  };\n  await page.mouse.click(point.x, point.y, { button: "right" });\n  await page.waitForTimeout(60);\n  await page.mouse.click(point.x, point.y, { button: "right" });\n}\n\nexport async function openCoordinatePlotEditorByRightDoubleClick(\n  page: Page,\n) {\n  await rightDoubleClickBoardCenter(page);\n  const editor = page.getByRole("complementary", {\n    name: "Редактор координатной плоскости",\n  });\n  await expect(editor).toBeVisible();\n  return editor;\n}\n`,
);

await writeFile(
  path.join(e2eRoot, "object-settings-right-double-click.spec.ts"),
  `import { expect, test } from "@playwright/test";\n\nimport {\n  openCoordinatePlotEditorByRightDoubleClick,\n  rightDoubleClickBoardCenter,\n} from "./coordinate-plot-interaction";\n\ntest("opens figure and graph settings only after a right-button double-click", async ({\n  page,\n}) => {\n  await page.goto("/");\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  const center = {\n    x: bounds.x + bounds.width / 2,\n    y: bounds.y + bounds.height / 2,\n  };\n\n  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();\n  await page.mouse.move(center.x - 70, center.y - 50);\n  await page.mouse.down();\n  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });\n  await page.mouse.up();\n  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");\n  await expect(\n    page.getByRole("complementary", { name: "Выделенные объекты" }),\n  ).toBeHidden();\n\n  await page.mouse.click(center.x, center.y, { button: "right" });\n  await expect(\n    page.getByRole("complementary", { name: "Выделенные объекты" }),\n  ).toBeHidden();\n  await page.waitForTimeout(60);\n  await page.mouse.click(center.x, center.y, { button: "right" });\n  await expect(\n    page.getByRole("complementary", { name: "Выделенные объекты" }),\n  ).toBeVisible();\n  await page.getByRole("button", { name: "Закрыть настройки объекта" }).click();\n\n  await page\n    .getByRole("button", { name: "Создать координатную плоскость (G)" })\n    .click();\n  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeHidden();\n  await page.keyboard.press("Enter");\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeHidden();\n\n  await openCoordinatePlotEditorByRightDoubleClick(page);\n});\n\ntest("a right drag remains board panning", async ({ page }) => {\n  await page.goto("/");\n  await page\n    .getByRole("button", { name: "Создать координатную плоскость (G)" })\n    .click();\n  const before = await page.getByTestId("viewport-offset").textContent();\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  await page.mouse.move(bounds.x + 40, bounds.y + 40);\n  await page.mouse.down({ button: "right" });\n  await page.mouse.move(bounds.x + 140, bounds.y + 100, { steps: 8 });\n  await page.mouse.up({ button: "right" });\n  await expect(page.getByTestId("viewport-offset")).not.toHaveText(before ?? "");\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeHidden();\n\n  await rightDoubleClickBoardCenter(page);\n});\n`,
);
