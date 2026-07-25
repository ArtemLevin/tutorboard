import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractRoot = path.join(repositoryRoot, "contracts/geometryos");
const reportRoot = path.join(repositoryRoot, "build/geometryos-repin");
const sourceRepository = "ArtemLevin/geometryos";
const sourceCommit = "49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c";
const sourcePaths = {
  openApi: "schemas/openapi.v1.json",
  girSchema: "schemas/gir-0.2.schema.json",
  fixtureManifest: "contracts/tutorboard/v1/manifest.json",
};
const headers = process.env.GITHUB_TOKEN
  ? {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    }
  : { Accept: "application/vnd.github+json" };

async function fetchBytes(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function rawUrl(sourcePath) {
  return `https://raw.githubusercontent.com/${sourceRepository}/${sourceCommit}/${sourcePath}`;
}

const artifacts = {};
for (const [kind, sourcePath] of Object.entries(sourcePaths)) {
  const bytes = await fetchBytes(rawUrl(sourcePath));
  artifacts[kind] = { bytes, sha256: sha256(bytes), sourcePath };
}

const treeResponse = await fetch(
  `https://api.github.com/repos/${sourceRepository}/git/trees/${sourceCommit}?recursive=1`,
  { headers },
);
if (!treeResponse.ok) {
  throw new Error(`Failed to read GeometryOS tree: ${treeResponse.status}`);
}
const tree = await treeResponse.json();
if (tree.truncated) {
  throw new Error("GeometryOS source tree response was truncated.");
}
const fixtureDirectory = path.posix.dirname(sourcePaths.fixtureManifest);
const fixtureEntries = tree.tree
  .filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path.startsWith(`${fixtureDirectory}/`) &&
      entry.path.endsWith(".json"),
  )
  .sort((left, right) => left.path.localeCompare(right.path));
if (fixtureEntries.length === 0 || fixtureEntries.length > 100) {
  throw new Error(
    `GeometryOS fixture count is outside the bounded range: ${fixtureEntries.length}`,
  );
}

fs.rmSync(contractRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(contractRoot, "fixtures"), { recursive: true });
fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(
  path.join(contractRoot, "openapi.v1.json"),
  artifacts.openApi.bytes,
);
fs.writeFileSync(
  path.join(contractRoot, "gir.schema.v0.2.json"),
  artifacts.girSchema.bytes,
);
for (const entry of fixtureEntries) {
  const relative = path.posix.relative(fixtureDirectory, entry.path);
  const target = path.join(contractRoot, "fixtures", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, await fetchBytes(rawUrl(entry.path)));
}

const openapi = JSON.parse(artifacts.openApi.bytes.toString("utf8"));
const manifest = {
  schemaVersion: "tutorboard.geometryos-contract/1",
  sourceRepository,
  sourceCommit,
  serviceVersion: openapi.info["x-geometryos-service-version"],
  openApiVersion: openapi.info.version,
  apiMajor: openapi.info["x-geometryos-api-major"],
  girSchemaVersion: openapi.info["x-geometryos-gir-schema-version"],
  consumerContract: openapi.info["x-geometryos-consumer-contract"],
  requestIdHeader: "X-Request-ID",
  openApiSha256: artifacts.openApi.sha256,
  girSchemaSha256: artifacts.girSchema.sha256,
  fixtureManifestSha256: artifacts.fixtureManifest.sha256,
  sourcePaths,
};
fs.writeFileSync(
  path.join(contractRoot, "contract-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

execFileSync(process.execPath, ["scripts/generate-geometryos-contract.mjs"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

const report = {
  sourceRepository,
  sourceCommit,
  fixtureCount: fixtureEntries.length,
  hashes: {
    openApi: artifacts.openApi.sha256,
    girSchema: artifacts.girSchema.sha256,
    fixtureManifest: artifacts.fixtureManifest.sha256,
  },
};
fs.writeFileSync(
  path.join(reportRoot, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
