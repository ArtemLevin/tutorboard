import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  await writeFile(path, after, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing ${label}`);
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

await patch(
  "src/adapters/canvas-konva/coordinate-plot-renderer.tsx",
  (content) =>
    replaceOnce(
      content,
      "              onViewportChange(\n                pinchCoordinatePlotViewport(",
      "              onViewportChange?.(\n                pinchCoordinatePlotViewport(",
      "optional touch viewport callback",
    ),
);

await patch(
  "tests/unit/adapters/canvas-konva/coordinate-plot-renderer.test.tsx",
  (content) => {
    let next = replaceOnce(
      content,
      "  CoordinatePlotRenderer,\n  createDefaultKonvaRendererRegistry,\n}",
      "  CoordinatePlotRenderer,\n  createDefaultKonvaRendererRegistry,\n  type CoordinatePlotRendererProps,\n}",
      "renderer props type import",
    );
    next = replaceOnce(
      next,
      "    expect(element.type).toBe(CoordinatePlotRenderer);\n    expect(element.props.onSettingsRequest).toBeTypeOf(\"function\");\n    expect(element.props.onViewportCommit).toBeTypeOf(\"function\");\n    expect(element.props.onViewportChange).toBeUndefined();",
      "    expect(element.type).toBe(CoordinatePlotRenderer);\n    const props = element.props as CoordinatePlotRendererProps;\n    expect(props.onSettingsRequest).toBeTypeOf(\"function\");\n    expect(props.onViewportCommit).toBeTypeOf(\"function\");\n    expect(props.onViewportChange).toBeUndefined();",
      "typed renderer props assertions",
    );
    return next;
  },
);

await patch("tests/e2e/coordinate-plot-right-pan.spec.ts", (content) =>
  content
    .replaceAll("plot.definition.", "plot.definition!.")
    .replaceAll("afterPlot.definition.", "afterPlot.definition!.")
    .replaceAll("beforePlot.definition.", "beforePlot.definition!.")
    .replaceAll(
      "coordinatePlot(undone).definition.coordinateViewport",
      "coordinatePlot(undone).definition!.coordinateViewport",
    ),
);

console.log("Fixed right-gesture TypeScript diagnostics");
