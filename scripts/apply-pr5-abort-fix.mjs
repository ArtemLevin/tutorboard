import { readFile, writeFile } from "node:fs/promises";

const path = "src/adapters/math-ink-http/client.ts";
const source = await readFile(path, "utf8");
const before = "  let response: Response;\n  let text: string;\n  try {\n    response = await options.fetch(options.endpoint, {";
const after = "  let response: Response;\n  let text: string;\n  try {\n    if (controller.signal.aborted) {\n      throw (\n        controller.signal.reason ?? new DOMException(\"Aborted\", \"AbortError\")\n      );\n    }\n    response = await options.fetch(options.endpoint, {";
if (!source.includes(before)) throw new Error("abort insertion anchor is missing");
await writeFile(path, source.replace(before, after));
