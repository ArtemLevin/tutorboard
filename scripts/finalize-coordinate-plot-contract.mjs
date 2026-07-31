import fs from "node:fs";

const path = "scripts/board-contract-lib.mjs";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one match, received ${occurrences}.`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  "  const document = readBoardDocumentFixture();",
  '  const document = { ...readBoardDocumentFixture(), schemaVersion: "1.1" };',
  "current document fixture",
);

replaceOnce(
  '      idempotencyKey: "client:tutor-01:batch-08",\n      schemaVersion: "1.0",',
  '      idempotencyKey: "client:tutor-01:batch-08",\n      schemaVersion: "1.1",',
  "command envelope fixture version",
);

replaceOnce(
  '      prompt: "Постройте треугольник ABC.",\n      schemaVersion: "1.0",',
  '      prompt: "Постройте треугольник ABC.",\n      schemaVersion: "1.1",',
  "geometry import fixture version",
);

replaceOnce(
  '      revision: 7,\n      schemaVersion: "1.0",',
  '      revision: 7,\n      schemaVersion: "1.1",',
  "snapshot fixture version",
);

for (const name of [
  "BoardCommandEnvelope",
  "BoardDocument",
  "BoardGeometryImport",
  "BoardSnapshot",
]) {
  source = source.replaceAll(`${name} 1.0`, `${name} 1.1`);
}

replaceOnce(
  "| Atomic Smart Ink acceptance | `core.objects.replace` | This release+ | board/v1 with replace support |",
  "| Atomic Smart Ink acceptance | `core.objects.replace` | This release+ | board/v1 with replace support |\n| Coordinate plot definition edit | `core.coordinate-plot.update` | BoardDocument 1.1+ | board/v1 with coordinate plot support |",
  "compatibility matrix",
);

fs.writeFileSync(path, source);
