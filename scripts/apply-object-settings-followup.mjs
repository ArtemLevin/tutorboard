import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before)) {
    throw new Error(`Expected one patch target in ${path}`);
  }
  await writeFile(path, `${source.slice(0, first)}${after}${source.slice(first + before.length)}`);
}

await replaceOnce(
  "src/app/App.tsx",
  `      if (object === undefined || object.source.kind !== "user") return;`,
  `      if (object === undefined) return;`,
);

await replaceOnce(
  "tests/e2e/object-settings-right-double-click.spec.ts",
  `import {\n  openCoordinatePlotEditorByRightDoubleClick,\n  rightDoubleClickBoardCenter,\n} from "./coordinate-plot-interaction";`,
  `import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction";`,
);
await replaceOnce(
  "tests/e2e/object-settings-right-double-click.spec.ts",
  `\n\n  await rightDoubleClickBoardCenter(page);\n});`,
  `\n});`,
);
