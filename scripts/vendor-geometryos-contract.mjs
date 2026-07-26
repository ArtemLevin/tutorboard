import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractRoot = path.join(repositoryRoot, "contracts/geometryos");
const sourceRepository = "ArtemLevin/geometryos";
const sourceCommit = "fe5ece9f7138044d638114907fe9aaecfd14e924";
const expected = {
  openApi: "eda2e6a4ab1e6e96b0c3561574695637a0be060ff68ba6a0e7b5432e989d94e9",
  girSchema: "dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993",
  fixtureManifest:
    "23c1cdd94a5cf9212c538bbc6ff423d1eb8580aebba092f9c7647ad74d3c0538",
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
const candidates = tree.tree
  .filter((entry) => entry.type === "blob" && entry.path.endsWith(".json"))
  .sort((left, right) => {
    const score = (value) =>
      /openapi|schema|manifest|fixture|tutorboard/i.test(value) ? 0 : 1;
    return (
      score(left.path) - score(right.path) ||
      left.path.localeCompare(right.path)
    );
  });
const matches = new Map();
for (const entry of candidates) {
  const bytes = await fetchBytes(
    `https://raw.githubusercontent.com/${sourceRepository}/${sourceCommit}/${entry.path}`,
  );
  const hash = sha256(bytes);
  for (const [kind, expectedHash] of Object.entries(expected)) {
    if (hash === expectedHash) {
      matches.set(kind, { path: entry.path, bytes });
    }
  }
  if (matches.size === Object.keys(expected).length) {
    break;
  }
}
for (const kind of Object.keys(expected)) {
  if (!matches.has(kind)) {
    throw new Error(
      `Unable to find pinned GeometryOS ${kind} artifact by checksum.`,
    );
  }
}

fs.rmSync(contractRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(contractRoot, "fixtures"), { recursive: true });
fs.writeFileSync(
  path.join(contractRoot, "openapi.v1.json"),
  matches.get("openApi").bytes,
);
fs.writeFileSync(
  path.join(contractRoot, "gir.schema.v0.2.json"),
  matches.get("girSchema").bytes,
);
fs.writeFileSync(
  path.join(contractRoot, "fixtures/manifest.json"),
  matches.get("fixtureManifest").bytes,
);

const fixtureSourcePath = matches.get("fixtureManifest").path;
const fixtureDirectory = path.posix.dirname(fixtureSourcePath);
const fixtureEntries = candidates.filter(
  (entry) =>
    entry.path !== fixtureSourcePath &&
    entry.path.startsWith(`${fixtureDirectory}/`) &&
    entry.path.endsWith(".json"),
);
if (fixtureEntries.length > 100) {
  throw new Error(
    "GeometryOS fixture directory exceeds the bounded vendor limit.",
  );
}
for (const entry of fixtureEntries) {
  const relative = path.posix.relative(fixtureDirectory, entry.path);
  const target = path.join(contractRoot, "fixtures", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    await fetchBytes(
      `https://raw.githubusercontent.com/${sourceRepository}/${sourceCommit}/${entry.path}`,
    ),
  );
}

const openapi = JSON.parse(matches.get("openApi").bytes.toString("utf8"));
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
  openApiSha256: expected.openApi,
  girSchemaSha256: expected.girSchema,
  fixtureManifestSha256: expected.fixtureManifest,
  sourcePaths: {
    openApi: matches.get("openApi").path,
    girSchema: matches.get("girSchema").path,
    fixtureManifest: fixtureSourcePath,
  },
};
fs.writeFileSync(
  path.join(contractRoot, "contract-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Vendored GeometryOS contract from ${sourceCommit}.`);
