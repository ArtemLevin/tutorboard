import { readFile, writeFile } from "node:fs/promises";

const appPath = "src/app/App.tsx";
const source = await readFile(appPath, "utf8");
const before =
  '          <span>Двойной щелчок правой кнопкой по объекту — настройки</span>\n';
if (!source.includes(before)) {
  throw new Error("Expected visible object-settings hint");
}
await writeFile(appPath, source.replace(before, ""));
