import { readFile, writeFile } from "node:fs/promises";

const path = "src/app/SyncedApp.tsx";
const text = await readFile(path, "utf8");
const before = `    if (lessonId !== undefined) {
      void repository
        .listEvidence(lessonId)
        .then(setEvidence)
        .catch(() => setEvidence([]));
    } else {
      setEvidence([]);
    }
`;
const after = `    if (lessonId !== undefined) {
      void repository
        .listEvidence(lessonId)
        .then(setEvidence)
        .catch(() => setEvidence([]));
    }
`;
if (!text.includes(before)) {
  throw new Error("SyncedApp evidence effect target was not found.");
}
await writeFile(path, text.replace(before, after));
