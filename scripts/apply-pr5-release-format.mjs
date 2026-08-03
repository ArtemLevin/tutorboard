import { readFile, writeFile } from "node:fs/promises";

const packagePath = "package.json";
let packageSource = await readFile(packagePath, "utf8");
const before =
  '    "handwriting:pr4": "vitest run src/adapters/math-ink-http/client.test.ts tests/node/math-ink-proxy.test.mjs tests/node/math-ink-proxy-forwarding.test.mjs --reporter=verbose",\n    "math-ink-proxy:start": "node services/math-ink-proxy/server.mjs"';
const after =
  '    "handwriting:pr4": "npm run handwriting:pr5",\n    "handwriting:pr5": "vitest run src/adapters/math-ink-http/client.test.ts src/adapters/math-ink-http/rasterization.test.ts src/app/configuration/formula-recognition-settings.test.ts tests/node/math-ink-proxy.test.mjs tests/node/math-ink-proxy-forwarding.test.mjs --reporter=verbose",\n    "formula-recognition-gateway:start": "node services/math-ink-proxy/server.mjs",\n    "math-ink-proxy:start": "npm run formula-recognition-gateway:start"';
if (!packageSource.includes(before)) {
  throw new Error("package script anchor is missing");
}
packageSource = packageSource.replace(before, after);
await writeFile(packagePath, packageSource);
