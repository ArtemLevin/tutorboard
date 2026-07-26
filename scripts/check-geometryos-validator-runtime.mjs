import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "contracts/geometryos/fixtures");
const validatorUrl = new URL(
  "../src/adapters/geometryos-http/generated/geometryos.validators.mjs",
  import.meta.url,
);

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"));
}

function conciseError(error) {
  if (!(error instanceof Error)) {
    return "UnknownError";
  }
  const message = error.message.split("\n", 1)[0].slice(0, 240);
  return `${error.name}: ${message}`;
}

let validators;
try {
  validators = await import(validatorUrl);
} catch (error) {
  console.error(
    `GeometryOS validator runtime smoke failed during ESM import: ${conciseError(error)}`,
  );
  process.exit(1);
}

const requiredExports = [
  "validateGenerateRequest",
  "validateGenerateResponse",
  "validateLayoutRequest",
  "validateLayoutResponse",
  "validateProblemDetail",
];
for (const name of requiredExports) {
  if (typeof validators[name] !== "function") {
    console.error(
      `GeometryOS validator runtime smoke failed: missing function export ${name}.`,
    );
    process.exit(1);
  }
}

const cases = [
  {
    label: "generate request",
    validator: validators.validateGenerateRequest,
    valid: readFixture("generate-success.request.json"),
    invalid: { input_type: "text", input: "" },
  },
  {
    label: "generate response",
    validator: validators.validateGenerateResponse,
    valid: readFixture("generate-success.response.json"),
    invalid: { status: "success", schema_version: "0.2.0" },
  },
  {
    label: "layout request",
    validator: validators.validateLayoutRequest,
    valid: readFixture("layout-success.request.json"),
    invalid: { schema_version: "0.3.0" },
  },
  {
    label: "layout response",
    validator: validators.validateLayoutResponse,
    valid: readFixture("layout-success.response.json"),
    invalid: { status: "success", layout_schema_version: "0.1.0" },
  },
  {
    label: "problem detail",
    validator: validators.validateProblemDetail,
    valid: readFixture("service-unavailable.problem.json"),
    invalid: { status: 503 },
  },
];

for (const testCase of cases) {
  if (!testCase.validator(testCase.valid)) {
    console.error(
      `GeometryOS validator runtime smoke failed: valid ${testCase.label} fixture was rejected.`,
    );
    process.exit(1);
  }
  if (testCase.validator(testCase.invalid)) {
    console.error(
      `GeometryOS validator runtime smoke failed: invalid ${testCase.label} value was accepted.`,
    );
    process.exit(1);
  }
  if (!Array.isArray(testCase.validator.errors)) {
    console.error(
      `GeometryOS validator runtime smoke failed: ${testCase.label} did not expose validation errors.`,
    );
    process.exit(1);
  }
}

console.log(
  "GeometryOS generated validators passed plain Node ESM import and fixture execution.",
);
