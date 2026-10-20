import { readFileSync } from "node:fs";

for (const path of [
  "src/app/board/collaborative-undo-availability.ts",
  "src/app/board/large-clear-restore.ts",
  "tests/unit/app/large-clear-restore.test.ts",
]) {
  console.info(`ATOMIC_UNDO_FORMAT:${path}:${readFileSync(path).toString("base64")}`);
}
