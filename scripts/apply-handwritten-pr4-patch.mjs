import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function patch(relativePath, transforms) {
  const filePath = path.join(root, relativePath);
  let source = fs.readFileSync(filePath, "utf8");
  for (const { anchor, replacement } of transforms) {
    if (source.includes(replacement)) continue;
    if (!source.includes(anchor)) {
      throw new Error(`${relativePath}: missing anchor ${JSON.stringify(anchor)}`);
    }
    source = source.replace(anchor, replacement);
  }
  fs.writeFileSync(filePath, source);
}

patch("src/app/ProductShell.tsx", [
  {
    anchor:
      'import { geometryOsAdapterContractVersion } from "../adapters/geometryos-http/public";\n',
    replacement:
      'import { geometryOsAdapterContractVersion } from "../adapters/geometryos-http/public";\nimport { mathInkHttpAdapterContractVersion } from "../adapters/math-ink-http/public";\nimport type { MathInkRecognizer } from "../modules/handwritten-function/public";\n',
  },
  {
    anchor:
      "  readonly geometryOsClient: GeometryOsClient;\n  readonly repository: BoardDocumentRepository;",
    replacement:
      "  readonly geometryOsClient: GeometryOsClient;\n  readonly mathInkRecognizer?: MathInkRecognizer | undefined;\n  readonly repository: BoardDocumentRepository;",
  },
  {
    anchor:
      "        <div>\n          <dt>Persistence adapter</dt>\n          <dd>{persistenceAdapterContractVersion}</dd>\n        </div>",
    replacement:
      "        <div>\n          <dt>Math ink adapter</dt>\n          <dd>{mathInkHttpAdapterContractVersion}</dd>\n        </div>\n        <div>\n          <dt>Persistence adapter</dt>\n          <dd>{persistenceAdapterContractVersion}</dd>\n        </div>",
  },
  {
    anchor:
      "export function ProductShell({\n  environment,\n  geometryOsClient,\n  repository,",
    replacement:
      "export function ProductShell({\n  environment,\n  geometryOsClient,\n  mathInkRecognizer,\n  repository,",
  },
  {
    anchor:
      "                lessonId={serverSync.lessonId}\n                queue={serverSync.queue}",
    replacement:
      "                lessonId={serverSync.lessonId}\n                mathInkRecognizer={mathInkRecognizer}\n                queue={serverSync.queue}",
  },
  {
    anchor:
      "                onNotification={notify}\n                repository={repository}",
    replacement:
      "                mathInkRecognizer={mathInkRecognizer}\n                onNotification={notify}\n                repository={repository}",
  },
]);

patch("src/app/PersistedApp.tsx", [
  {
    anchor:
      'import { validateStoredSvgDocument } from "../modules/svg-import/public";\n',
    replacement:
      'import type { MathInkRecognizer } from "../modules/handwritten-function/public";\nimport { validateStoredSvgDocument } from "../modules/svg-import/public";\n',
  },
  {
    anchor:
      "  readonly geometryOsClient?: GeometryOsClient | undefined;\n  readonly onNotification?:",
    replacement:
      "  readonly geometryOsClient?: GeometryOsClient | undefined;\n  readonly mathInkRecognizer?: MathInkRecognizer | undefined;\n  readonly onNotification?:",
  },
  {
    anchor:
      "  readonly geometryOsClient: GeometryOsClient | undefined;\n  readonly onNotification:",
    replacement:
      "  readonly geometryOsClient: GeometryOsClient | undefined;\n  readonly mathInkRecognizer: MathInkRecognizer | undefined;\n  readonly onNotification:",
  },
  {
    anchor:
      "  repository,\n  geometryOsClient,\n  enableSnapshots,",
    replacement:
      "  repository,\n  geometryOsClient,\n  mathInkRecognizer,\n  enableSnapshots,",
  },
  {
    anchor:
      "      key={workspaceKey}\n      onDocumentChange={handleDocumentChange}",
    replacement:
      "      key={workspaceKey}\n      mathInkRecognizer={mathInkRecognizer}\n      onDocumentChange={handleDocumentChange}",
  },
  {
    anchor:
      "export function PersistedApp({\n  enableSnapshots = true,\n  geometryOsClient,\n  onNotification,",
    replacement:
      "export function PersistedApp({\n  enableSnapshots = true,\n  geometryOsClient,\n  mathInkRecognizer,\n  onNotification,",
  },
  {
    anchor:
      "        geometryOsClient={geometryOsClient}\n        initialRevisionId={null}",
    replacement:
      "        geometryOsClient={geometryOsClient}\n        initialRevisionId={null}\n        mathInkRecognizer={mathInkRecognizer}",
  },
  {
    anchor:
      "      geometryOsClient={geometryOsClient}\n      initialRevisionId={bootstrap.initialRevisionId}",
    replacement:
      "      geometryOsClient={geometryOsClient}\n      initialRevisionId={bootstrap.initialRevisionId}\n      mathInkRecognizer={mathInkRecognizer}",
  },
]);

patch("src/app/SyncedApp.tsx", [
  {
    anchor:
      'import { App, type AppPersistenceStatus } from "./App";\n',
    replacement:
      'import type { MathInkRecognizer } from "../modules/handwritten-function/public";\nimport { App, type AppPersistenceStatus } from "./App";\n',
  },
  {
    anchor:
      "  readonly lessonId: string;\n  readonly queue: PendingBoardCommandQueue;",
    replacement:
      "  readonly lessonId: string;\n  readonly mathInkRecognizer?: MathInkRecognizer | undefined;\n  readonly queue: PendingBoardCommandQueue;",
  },
  {
    anchor:
      "  geometryOsClient,\n  lessonId,\n  queue,",
    replacement:
      "  geometryOsClient,\n  lessonId,\n  mathInkRecognizer,\n  queue,",
  },
  {
    anchor:
      "        key={workspaceKey}\n        onCollaborativeUndo={() => {",
    replacement:
      "        key={workspaceKey}\n        mathInkRecognizer={mathInkRecognizer}\n        onCollaborativeUndo={() => {",
  },
]);

patch("scripts/architecture-rules.mjs", [
  {
    anchor:
      '  if (!(\n    importer.layer === "adapters" && importer.owner === "geometryos-http"\n  )) {',
    replacement:
      '  const networkAdapter =\n    importer.layer === "adapters" &&\n    (importer.owner === "geometryos-http" || importer.owner === "math-ink-http");\n  if (!networkAdapter) {',
  },
  {
    anchor:
      '    if (\n      importer.layer === "adapters" &&\n      (target.layer === "modules" ||\n        (target.layer === "adapters" && target.owner !== importer.owner))\n    ) {\n      violations.push(',
    replacement:
      '    const consumesMathInkPort =\n      importer.layer === "adapters" &&\n      importer.owner === "math-ink-http" &&\n      target.layer === "modules" &&\n      target.owner === "handwritten-function" &&\n      isPublicModuleImport(specifier);\n    if (\n      importer.layer === "adapters" &&\n      !consumesMathInkPort &&\n      (target.layer === "modules" ||\n        (target.layer === "adapters" && target.owner !== importer.owner))\n    ) {\n      violations.push(',
  },
]);

const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts.format = packageJson.scripts.format.replace(
  '"scripts/**/*.mjs"',
  '"scripts/**/*.mjs" "services/**/*.mjs"',
);
packageJson.scripts["format:check"] = packageJson.scripts["format:check"].replace(
  '"scripts/**/*.mjs"',
  '"scripts/**/*.mjs" "services/**/*.mjs"',
);
packageJson.scripts["handwriting:pr4"] =
  "vitest run src/adapters/math-ink-http/client.test.ts tests/node/math-ink-proxy.test.mjs --reporter=verbose";
packageJson.scripts["math-ink-proxy:start"] =
  "node services/math-ink-proxy/server.mjs";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
