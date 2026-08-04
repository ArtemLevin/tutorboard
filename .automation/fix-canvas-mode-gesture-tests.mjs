import fs from "node:fs";

const path = "src/app/App.test.tsx";
const source = fs.readFileSync(path, "utf8");
const before = `            props.onCanvasContextMenuRequest?.({
              clientPoint: { x: 180, y: 140 },
              worldPoint: { x: 42, y: 56 },
            })`;
const after = `            props.onCanvasContextMenuRequest?.({
              clientPoint: { x: 180, y: 140 },
              objectId: null,
              worldPoint: { x: 42, y: 56 },
            })`;
if (!source.includes(before)) {
  throw new Error("Canvas context-menu test fixture anchor is missing.");
}
fs.writeFileSync(path, source.replace(before, after));
