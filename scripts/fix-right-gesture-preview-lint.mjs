import { readFile, writeFile } from "node:fs/promises";

const path = "src/adapters/canvas-konva/coordinate-plot-renderer.tsx";
let content = await readFile(path, "utf8");

function replaceOnce(search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  content =
    content.slice(0, index) + replacement + content.slice(index + search.length);
}

replaceOnce(
  `function sameCoordinateViewport(\n  left: CoordinatePlotViewport,\n  right: CoordinatePlotViewport,\n): boolean {\n  return (\n    left.equalScale === right.equalScale &&\n    left.xMax === right.xMax &&\n    left.xMin === right.xMin &&\n    left.yMax === right.yMax &&\n    left.yMin === right.yMin\n  );\n}\n\n`,
  "",
  "unused viewport equality helper",
);

replaceOnce(
  `      if (session.moved) {\n        if (!editingRef.current) {\n          const accepted =\n            viewportCommitRef.current?.(session.latestViewport) ?? false;\n          if (!accepted) setDirectViewportPreview(null);\n        }\n        return;\n      }`,
  `      if (session.moved) {\n        if (!editingRef.current) {\n          viewportCommitRef.current?.(session.latestViewport);\n          setDirectViewportPreview(null);\n        }\n        return;\n      }`,
  "closed-editor viewport commit completion",
);

replaceOnce(
  `  useEffect(() => {\n    if (\n      directViewportPreview !== null &&\n      sameCoordinateViewport(\n        object.definition.coordinateViewport,\n        directViewportPreview,\n      )\n    ) {\n      setDirectViewportPreview(null);\n    }\n  }, [directViewportPreview, object.definition.coordinateViewport]);\n`,
  "",
  "synchronous preview cleanup effect",
);

await writeFile(path, content, "utf8");
console.log("Removed synchronous preview cleanup effect");
