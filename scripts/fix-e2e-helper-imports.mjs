import { readFile, writeFile } from "node:fs/promises";

const files = [
  "tests/e2e/coordinate-plot-accessibility.spec.ts",
  "tests/e2e/coordinate-plot-editor.spec.ts",
  "tests/e2e/coordinate-plot-production.spec.ts",
  "tests/e2e/coordinate-plot-right-pan.spec.ts",
  "tests/e2e/coordinate-plot-visual.spec.ts",
  "tests/e2e/object-settings-right-double-click.spec.ts",
];

const before = 'from "./coordinate-plot-interaction";';
const after = 'from "./coordinate-plot-interaction.js";';

for (const path of files) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing import in ${path}`);
  await writeFile(path, source.replace(before, after));
}
