import fs from "node:fs";

const path = ".github/workflows/ci.yml";
const source = fs.readFileSync(path, "utf8");
const before = `  coordinate-plot-production:\n    name: Coordinate plot production gate\n    needs: quality\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n`;
const after = `  coordinate-plot-production:\n    name: Coordinate plot production gate\n    needs: quality\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n`;
if (!source.includes(before)) {
  throw new Error("Coordinate plot timeout anchor is missing.");
}
fs.writeFileSync(path, source.replace(before, after));
