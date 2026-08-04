import fs from "node:fs";

const path = "scripts/board-contract-lib.mjs";
const source = fs.readFileSync(path, "utf8");
const before = "  delete smartInkCircle.points;\n";
const after = "  delete smartInkCircle.points;\n  delete smartInkCircle.ink;\n";
if (!source.includes(before)) {
  throw new Error("Smart Ink fixture deletion anchor is missing.");
}
if (source.includes(after)) {
  throw new Error("Smart Ink fixture correction is already applied.");
}
fs.writeFileSync(path, source.replace(before, after));
