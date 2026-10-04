import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ciGateNames = [
  "geometryos",
  "coordinate_plot",
  "production_image",
  "smart_ink",
  "formula_recognition",
  "paddle_formula",
];

const globalRiskPaths = [".github/workflows/", "scripts/ci/"];

const globalRiskFiles = new Set([
  ".nvmrc",
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "vite.config.ts",
]);

const boardContractFiles = new Set([
  "src/core/public.ts",
  "src/core/board/document.ts",
  "src/core/board/objects.ts",
]);

const geometryOsPrefixes = [
  "tools/geometryos-contract/",
  "src/adapters/geometryos-http/",
  "src/adapters/canvas-konva/",
  "tests/live/",
];

const coordinatePlotPrefixes = [
  "src/core/plot-expression/",
  "src/core/plot-sampling/",
  "src/adapters/canvas-konva/",
  "src/adapters/persistence-dexie/",
  "src/modules/collaboration/",
];

const coordinatePlotFiles = new Set([
  "src/modules/document-transfer/snapshot.ts",
]);

const smartInkPrefixes = [
  "src/modules/smart-ink/",
  "src/modules/smart-ink-spike/",
];

const formulaRecognitionPrefixes = [
  "src/adapters/canvas-konva/",
  "src/adapters/math-ink-http/",
  "src/modules/handwritten-function/",
  "services/math-ink-proxy/",
];

const paddleFormulaPrefixes = [
  "services/math-ink-proxy/",
  "services/paddle-formula-sidecar/",
];

const compositionFiles = new Set([
  "src/app/App.tsx",
  "src/app/board/active-tool.ts",
  "src/app/board/controllers/useBoardInteractionRouter.ts",
  "src/app/board/views/BoardCanvas.tsx",
  "src/app/board/views/BoardOverlays.tsx",
  "src/app/board/views/BoardToolDockContainer.tsx",
  "src/app/board-chrome/BoardToolDock.tsx",
  "src/app/configuration/environment.ts",
]);

const productionImageFiles = new Set([
  ".dockerignore",
  "Dockerfile",
  "deploy/nginx.conf",
]);

const smartInkFiles = new Set([
  "src/shared/smart-ink-release.ts",
  "tests/e2e/smart-ink-release-gate.spec.ts",
]);

const formulaRecognitionFiles = new Set([
  "Dockerfile.math-ink-proxy",
  "deploy/math-ink.compose.yml",
  "src/app/HandwrittenFunctionPanel.tsx",
  "src/app/HandwrittenFunctionWorkflow.tsx",
  "src/app/board/views/BoardSettingsPanel.tsx",
  "src/app/handwritten-function-composition.ts",
  "src/app/configuration/formula-recognition-settings.ts",
  "src/app/configuration/formula-recognition-settings.test.ts",
  "tests/e2e/math-ink-recognition-production.spec.ts",
  "tests/fixtures/mathpix-mock-server.mjs",
]);

const paddleFormulaFiles = new Set([
  "deploy/math-ink.compose.yml",
  "deploy/paddle-formula.compose.yml",
  "deploy/paddle-formula.gpu.compose.yml",
]);

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function hasPrefix(path, prefixes) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function hasFragment(path, fragment) {
  return path.toLowerCase().includes(fragment);
}

function allEnabled() {
  return Object.fromEntries(ciGateNames.map((name) => [name, true]));
}

function allDisabled() {
  return Object.fromEntries(ciGateNames.map((name) => [name, false]));
}

export function classifyChangedFiles(changedFiles) {
  const routing = allDisabled();

  for (const rawPath of changedFiles) {
    const path = normalizePath(rawPath);
    if (path.length === 0) continue;

    if (globalRiskFiles.has(path) || hasPrefix(path, globalRiskPaths)) {
      return allEnabled();
    }

    if (boardContractFiles.has(path)) {
      routing.geometryos = true;
      routing.coordinate_plot = true;
      routing.smart_ink = true;
      routing.formula_recognition = true;
    }

    if (
      path.startsWith("tsconfig") ||
      path.startsWith("eslint.config.") ||
      (path.startsWith("playwright.") && path.endsWith(".config.ts"))
    ) {
      return allEnabled();
    }

    if (
      hasPrefix(path, geometryOsPrefixes) ||
      path.startsWith("scripts/geometryos-") ||
      path.startsWith("scripts/check-geometryos-") ||
      hasFragment(path, "geometry") ||
      compositionFiles.has(path)
    ) {
      routing.geometryos = true;
    }

    if (
      hasPrefix(path, coordinatePlotPrefixes) ||
      coordinatePlotFiles.has(path) ||
      path === "src/core/board/coordinate-plot.ts" ||
      hasFragment(path, "coordinate-plot") ||
      hasFragment(path, "coordinateplot") ||
      path === "playwright.visual.config.ts" ||
      compositionFiles.has(path)
    ) {
      routing.coordinate_plot = true;
    }

    if (productionImageFiles.has(path)) {
      routing.production_image = true;
    }

    if (
      hasPrefix(path, smartInkPrefixes) ||
      smartInkFiles.has(path) ||
      hasFragment(path, "smart-ink") ||
      compositionFiles.has(path)
    ) {
      routing.smart_ink = true;
    }

    if (
      hasPrefix(path, formulaRecognitionPrefixes) ||
      formulaRecognitionFiles.has(path) ||
      hasFragment(path, "math-ink") ||
      hasFragment(path, "formula-recognition") ||
      hasFragment(path, "handwriting") ||
      hasFragment(path, "handwrittenfunction") ||
      path === "deploy/nginx.conf" ||
      compositionFiles.has(path)
    ) {
      routing.formula_recognition = true;
    }

    if (
      hasPrefix(path, paddleFormulaPrefixes) ||
      paddleFormulaFiles.has(path) ||
      path.startsWith("tests/node/math-ink-proxy-") ||
      hasFragment(path, "paddle-formula")
    ) {
      routing.paddle_formula = true;
    }
  }

  return routing;
}

function validateCommitSha(name, value) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? "")) {
    throw new Error(`${name} must be a 40-character Git commit SHA.`);
  }
  return value;
}

export function changedFilesFromGit(baseSha, headSha) {
  const base = validateCommitSha("base SHA", baseSha);
  const head = validateCommitSha("head SHA", headSha);
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head, "--"],
    { encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean);
}

export function computeGateRouting({
  eventName,
  baseSha,
  headSha,
  changedFiles,
}) {
  if (eventName === "push" || eventName === "workflow_dispatch") {
    return allEnabled();
  }
  if (eventName !== "pull_request") {
    throw new Error(`Unsupported GitHub Actions event: ${eventName}`);
  }

  const files = changedFiles ?? changedFilesFromGit(baseSha, headSha);
  return classifyChangedFiles(files);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Expected --key value CLI arguments.");
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function printRouting(routing) {
  for (const gate of ciGateNames) {
    console.log(`${gate}=${routing[gate] ? "true" : "false"}`);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const routing = computeGateRouting({
      eventName: args.event,
      baseSha: args.base,
      headSha: args.head,
    });
    printRouting(routing);
  } catch (error) {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  }
}
