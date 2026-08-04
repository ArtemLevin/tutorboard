import fs from "node:fs";

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected fragment missing in ${path}: ${before}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replace(
  "src/adapters/canvas-konva/default-renderers.tsx",
  `import {\n  buildCachedSmoothClosedStrokePoints,\n  buildCachedSmoothStrokePoints,\n  buildSmoothStrokePoints,\n  flattenStrokePoints,\n} from "../../shared/stroke-smoothing";`,
  `import {\n  buildSmoothStrokePoints,\n  flattenStrokePoints,\n} from "../../shared/stroke-smoothing";`,
);

replace(
  "src/app/handwritten-function-composition.ts",
  ".map((point, sampleIndex) => ({",
  ".map((point) => ({",
);

replace(
  "src/modules/document-transfer/snapshot.ts",
  "function objectMarkup(object: BoardObject, zoom: number): string {",
  "function objectMarkup(object: BoardObject): string {",
);
replace(
  "src/modules/document-transfer/snapshot.ts",
  "function itemMarkup(item: BoardRenderItem, zoom: number): string {",
  "function itemMarkup(item: BoardRenderItem): string {",
);
replace(
  "src/modules/document-transfer/snapshot.ts",
  "    objectMarkup(item.object, zoom),",
  "    objectMarkup(item.object),",
);
replace(
  "src/modules/document-transfer/snapshot.ts",
  "    visibleItems.map((item) => itemMarkup(item, scene.viewport.zoom)).join(\"\"),",
  "    visibleItems.map((item) => itemMarkup(item)).join(\"\"),",
);

replace(
  "tests/unit/adapters/persistence-dexie/vector-ink-migration.test.ts",
  "import {\n  createEmptyBoardDocument,",
  "import {\n  boardObjectId,\n  createEmptyBoardDocument,",
);
replace(
  "tests/unit/adapters/persistence-dexie/vector-ink-migration.test.ts",
  '    const stroke = loaded.document.objects["object:legacy"];',
  '    const stroke = loaded.document.objects[boardObjectId("object:legacy")];',
);
