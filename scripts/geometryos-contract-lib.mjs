import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contractRoot = path.join(repositoryRoot, "contracts/geometryos");
const toolRoot = path.join(repositoryRoot, "tools/geometryos-contract");
const toolRequire = createRequire(path.join(toolRoot, "package.json"));
const Ajv2020 = toolRequire("ajv/dist/2020").default;
const standaloneCode = toolRequire("ajv/dist/standalone").default;
const openApiPath = path.join(contractRoot, "openapi.v1.json");
const girSchemaPath = path.join(contractRoot, "gir.schema.v0.2.json");
const fixtureManifestPath = path.join(contractRoot, "fixtures/manifest.json");
const generatedRootRelative = "src/adapters/geometryos-http/generated";
const validatorPath = path.join(
  generatedRootRelative,
  "geometryos.validators.mjs",
);
const runtimeBridgePath = path.join(
  generatedRootRelative,
  "geometryos.ajv-runtime.mjs",
);

export const generatedFiles = [
  "src/adapters/geometryos-http/generated/geometryos.types.ts",
  validatorPath,
  runtimeBridgePath,
  "src/adapters/geometryos-http/generated/geometryos.validators.d.mts",
  "src/adapters/geometryos-http/generated/contract-metadata.ts",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hashFile(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function verifyAjvVersionParity() {
  const rootPackage = readJson(path.join(repositoryRoot, "package.json"));
  const toolPackage = readJson(path.join(toolRoot, "package.json"));
  const rootVersion = rootPackage.devDependencies?.ajv;
  const toolVersion = toolPackage.devDependencies?.ajv;
  if (
    typeof rootVersion !== "string" ||
    typeof toolVersion !== "string" ||
    rootVersion !== toolVersion ||
    !/^\d+\.\d+\.\d+$/.test(rootVersion)
  ) {
    throw new Error(
      `GeometryOS validator Ajv versions must be the same exact version: root=${String(rootVersion)}, tool=${String(toolVersion)}`,
    );
  }
}

export function verifyContractArtifacts() {
  verifyAjvVersionParity();
  const manifest = readJson(path.join(contractRoot, "contract-manifest.json"));
  const checks = [
    [openApiPath, manifest.openApiSha256, "OpenAPI"],
    [girSchemaPath, manifest.girSchemaSha256, "GIR schema"],
    [fixtureManifestPath, manifest.fixtureManifestSha256, "fixture manifest"],
  ];
  for (const [filePath, expected, label] of checks) {
    const actual = hashFile(filePath);
    if (actual !== expected) {
      throw new Error(
        `${label} checksum mismatch: expected ${expected}, received ${actual}`,
      );
    }
  }

  const openapi = readJson(openApiPath);
  const expectedMetadata = {
    version: manifest.openApiVersion,
    apiMajor: manifest.apiMajor,
    girSchemaVersion: manifest.girSchemaVersion,
    consumerContract: manifest.consumerContract,
    serviceVersion: manifest.serviceVersion,
  };
  const actualMetadata = {
    version: openapi.info?.version,
    apiMajor: openapi.info?.["x-geometryos-api-major"],
    girSchemaVersion: openapi.info?.["x-geometryos-gir-schema-version"],
    consumerContract: openapi.info?.["x-geometryos-consumer-contract"],
    serviceVersion: openapi.info?.["x-geometryos-service-version"],
  };
  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error(
      `GeometryOS OpenAPI metadata mismatch: ${JSON.stringify(actualMetadata)}`,
    );
  }
  return { manifest, openapi };
}

function rewriteSchema(value) {
  if (Array.isArray(value)) {
    return value.map(rewriteSchema);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "$id" || key === "discriminator") {
      continue;
    }
    if (key === "$ref" && typeof item === "string") {
      output[key] = item.replace("#/components/schemas/", "#/$defs/");
    } else {
      output[key] = rewriteSchema(item);
    }
  }
  return output;
}

function bundledSchema(rootSchema, components, id) {
  return {
    $id: id,
    ...rewriteSchema(rootSchema),
    $defs: rewriteSchema(components),
  };
}

function normalizeStandaloneEsm(source) {
  const imports = [];
  const supportedRuntimeHelpers = new Map([["ucs2length", "ucs2length"]]);
  const normalized = source.replace(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\((["'])ajv\/dist\/runtime\/([^"']+)\2\)\.default\s*;?/g,
    (_match, localName, _quote, helperPath) => {
      const exportName = supportedRuntimeHelpers.get(helperPath);
      if (exportName === undefined) {
        throw new Error(
          `Unsupported Ajv standalone runtime helper: ${helperPath}`,
        );
      }
      imports.push(
        `import { ${exportName} as ${localName} } from "./geometryos.ajv-runtime.mjs";`,
      );
      return "";
    },
  );

  const markers = [
    ["require(", /\brequire\s*\(/],
    ["module.exports", /\bmodule\.exports\b/],
    ["exports.", /\bexports\./],
  ];
  for (const [label, pattern] of markers) {
    if (pattern.test(normalized)) {
      throw new Error(
        `Generated GeometryOS validator still contains CommonJS marker: ${label}`,
      );
    }
  }

  const prelude = [...new Set(imports)].sort().join("\n");
  return prelude.length > 0 ? `${prelude}\n${normalized}` : normalized;
}

function generateValidators(openapi) {
  const components = openapi.components.schemas;
  const responseSchema =
    openapi.paths["/api/v1/generate"].post.responses["200"].content[
      "application/json"
    ].schema;
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    code: { esm: true, lines: true, source: true },
    strict: false,
    validateFormats: false,
  });
  const schemaIds = {
    validateGenerateRequest: "urn:tutorboard:geometryos:generate-request",
    validateGenerateResponse: "urn:tutorboard:geometryos:generate-response",
    validateProblemDetail: "urn:tutorboard:geometryos:problem-detail",
  };
  ajv.addSchema(
    bundledSchema(
      components.GenerateV1Request,
      components,
      schemaIds.validateGenerateRequest,
    ),
  );
  ajv.addSchema(
    bundledSchema(
      responseSchema,
      components,
      schemaIds.validateGenerateResponse,
    ),
  );
  ajv.addSchema(
    bundledSchema(
      components.ProblemDetail,
      components,
      schemaIds.validateProblemDetail,
    ),
  );
  return normalizeStandaloneEsm(standaloneCode(ajv, schemaIds));
}

function runtimeBridgeSource() {
  return `import ucs2lengthModule from "ajv/dist/runtime/ucs2length.js";\n\nconst ucs2length =\n  typeof ucs2lengthModule === "function"\n    ? ucs2lengthModule\n    : ucs2lengthModule.default;\n\nif (typeof ucs2length !== "function") {\n  throw new TypeError("Ajv ucs2length runtime helper is unavailable.");\n}\n\nexport { ucs2length };\n`;
}

function writeMetadata(outputRoot, manifest) {
  const content = `export const geometryOsContractMetadata = ${JSON.stringify(
    {
      apiMajor: manifest.apiMajor,
      consumerContract: manifest.consumerContract,
      girSchemaVersion: manifest.girSchemaVersion,
      openApiSha256: manifest.openApiSha256,
      openApiVersion: manifest.openApiVersion,
      serviceVersion: manifest.serviceVersion,
      sourceCommit: manifest.sourceCommit,
      sourceRepository: manifest.sourceRepository,
    },
    null,
    2,
  )} as const;\n`;
  fs.writeFileSync(
    path.join(
      outputRoot,
      "src/adapters/geometryos-http/generated/contract-metadata.ts",
    ),
    content,
  );
}

export function generateContract(outputRoot = repositoryRoot) {
  const { manifest, openapi } = verifyContractArtifacts();
  const generatedRoot = path.join(outputRoot, generatedRootRelative);
  fs.mkdirSync(generatedRoot, { recursive: true });
  const executable = path.join(
    toolRoot,
    "node_modules/.bin",
    process.platform === "win32"
      ? "openapi-typescript.cmd"
      : "openapi-typescript",
  );
  execFileSync(
    executable,
    [openApiPath, "-o", path.join(generatedRoot, "geometryos.types.ts")],
    {
      cwd: repositoryRoot,
      stdio: "inherit",
    },
  );
  fs.writeFileSync(
    path.join(outputRoot, validatorPath),
    generateValidators(openapi),
  );
  fs.writeFileSync(
    path.join(outputRoot, runtimeBridgePath),
    runtimeBridgeSource(),
  );
  fs.writeFileSync(
    path.join(generatedRoot, "geometryos.validators.d.mts"),
    `export interface GeneratedValidationError {\n  readonly instancePath: string;\n  readonly keyword: string;\n  readonly message?: string;\n  readonly params: unknown;\n  readonly schemaPath: string;\n}\n\nexport interface GeneratedValidator {\n  (value: unknown): boolean;\n  readonly errors?: readonly GeneratedValidationError[] | null;\n}\n\nexport const validateGenerateRequest: GeneratedValidator;\nexport const validateGenerateResponse: GeneratedValidator;\nexport const validateProblemDetail: GeneratedValidator;\n`,
  );
  writeMetadata(outputRoot, manifest);
  const prettier = path.join(
    repositoryRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier",
  );
  execFileSync(
    prettier,
    [
      "--write",
      path.join(generatedRoot, "geometryos.types.ts"),
      path.join(generatedRoot, "contract-metadata.ts"),
      path.join(generatedRoot, "geometryos.ajv-runtime.mjs"),
    ],
    { cwd: repositoryRoot, stdio: "ignore" },
  );
}

export function checkGeneratedContract() {
  verifyContractArtifacts();
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tutorboard-geometryos-"),
  );
  try {
    generateContract(temporaryRoot);
    const differences = [];
    for (const relativePath of generatedFiles) {
      const expected = fs.readFileSync(path.join(repositoryRoot, relativePath));
      const actual = fs.readFileSync(path.join(temporaryRoot, relativePath));
      if (!expected.equals(actual)) {
        differences.push(relativePath);
      }
    }
    if (differences.length > 0) {
      throw new Error(
        `Generated GeometryOS contract is stale: ${differences.join(", ")}. Run npm run geometryos:generate.`,
      );
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
