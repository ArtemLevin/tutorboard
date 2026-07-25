import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = path.join(root, "PLAN.md");
const before = `11. **PR 2.9 — deterministic GIR-to-Board import — следующий**
   - реализовать layout policy, pure GIR adapter и атомарный import command.
12. Далее выполнять PR 2.10–2.12 из Technical Spike plan, не обходя phase gates.`;
const after = `11. **PR 2.8.1 — GeometryOS contract repin — завершён**
    - закрепить producer commit \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\` и новые SHA-256;
    - регенерировать DTO и runtime validators из актуального additive OpenAPI;
    - доказать CORS preflight, exposed \`X-Request-ID\` и live response validation на pinned container.
12. **PR 2.9 — deterministic GIR-to-Board import — следующий**
    - реализовать layout policy, pure GIR adapter и атомарный import command.
13. Далее выполнять PR 2.10–2.12 из Technical Spike plan, не обходя phase gates.`;
const plan = fs.readFileSync(planPath, "utf8");
if (plan.includes(before)) {
  fs.writeFileSync(planPath, plan.replace(before, after));
} else if (!plan.includes(after)) {
  throw new Error("Expected PR 2.9 execution-order block was not found.");
}

await import("./finalize-geometryos-repin.mjs");
