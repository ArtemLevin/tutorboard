import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function replaceExact(relativePath, before, after) {
  const filePath = path.join(root, relativePath);
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes(after)) {
    return;
  }
  if (!current.includes(before)) {
    throw new Error(`Expected text was not found in ${relativePath}.`);
  }
  fs.writeFileSync(filePath, current.replace(before, after));
}

function write(relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts["geometryos:live-smoke"] =
  "node scripts/geometryos-live-contract-smoke.mjs";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

write(
  "scripts/geometryos-live-contract-smoke.mjs",
  `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateGenerateResponse } from "../src/adapters/geometryos-http/generated/geometryos.validators.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.GEOMETRYOS_BASE_URL ?? "http://127.0.0.1:18000";
const allowedOrigin =
  process.env.GEOMETRYOS_ALLOWED_ORIGIN ?? "http://localhost:5173";
const deniedOrigin = "https://untrusted.example";
const requestId = "tutorboard-live-contract";
const generateUrl = new URL("/api/v1/generate", baseUrl);

function requireHeader(response, name) {
  const value = response.headers.get(name);
  if (value === null || value.length === 0) {
    throw new Error(\`Missing required response header: \${name}\`);
  }
  return value;
}

function splitHeader(value) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function waitForReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/ready", baseUrl), {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) {
        return;
      }
    } catch {
      // The bounded retry loop handles container startup without logging payloads.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("GeometryOS did not become ready within 30 seconds.");
}

async function preflight(origin) {
  return fetch(generateUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-request-id",
    },
    signal: AbortSignal.timeout(5_000),
  });
}

await waitForReady();

const allowedPreflight = await preflight(allowedOrigin);
if (allowedPreflight.status !== 200) {
  throw new Error(
    \`Allowed CORS preflight returned HTTP \${allowedPreflight.status}.\`,
  );
}
if (requireHeader(allowedPreflight, "access-control-allow-origin") !== allowedOrigin) {
  throw new Error("Allowed CORS preflight did not echo the exact origin.");
}
const allowedMethods = splitHeader(
  requireHeader(allowedPreflight, "access-control-allow-methods"),
);
if (!allowedMethods.includes("post")) {
  throw new Error("Allowed CORS preflight does not permit POST.");
}
const allowedHeaders = splitHeader(
  requireHeader(allowedPreflight, "access-control-allow-headers"),
);
for (const header of ["content-type", "x-request-id"]) {
  if (!allowedHeaders.includes(header)) {
    throw new Error(\`Allowed CORS preflight does not permit \${header}.\`);
  }
}
if (allowedPreflight.headers.has("access-control-allow-credentials")) {
  throw new Error("GeometryOS CORS must not permit browser credentials.");
}

const deniedPreflight = await preflight(deniedOrigin);
if (deniedPreflight.status < 400) {
  throw new Error("Untrusted CORS origin was not rejected.");
}
if (deniedPreflight.headers.has("access-control-allow-origin")) {
  throw new Error("Untrusted CORS origin received an allow-origin header.");
}

const request = JSON.parse(
  fs.readFileSync(
    path.join(root, "contracts/geometryos/fixtures/generate-success.request.json"),
    "utf8",
  ),
);
const response = await fetch(generateUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: allowedOrigin,
    "X-Request-ID": requestId,
  },
  body: JSON.stringify(request),
  signal: AbortSignal.timeout(30_000),
});
if (response.status !== 200) {
  throw new Error(\`Generate request returned HTTP \${response.status}.\`);
}
if (requireHeader(response, "x-request-id") !== requestId) {
  throw new Error("GeometryOS did not preserve the safe request ID.");
}
if (requireHeader(response, "access-control-allow-origin") !== allowedOrigin) {
  throw new Error("Generate response did not echo the exact allowed origin.");
}
const exposedHeaders = splitHeader(
  requireHeader(response, "access-control-expose-headers"),
);
if (!exposedHeaders.includes("x-request-id")) {
  throw new Error("Generate response does not expose X-Request-ID to browsers.");
}
const contentType = requireHeader(response, "content-type").toLowerCase();
if (!contentType.startsWith("application/json")) {
  throw new Error(\`Unexpected generate response media type: \${contentType}.\`);
}
const payload = await response.json();
if (!validateGenerateResponse(payload)) {
  const diagnostics = (validateGenerateResponse.errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    schemaPath: error.schemaPath,
  }));
  throw new Error(
    \`Live generate response failed the pinned validator: \${JSON.stringify(diagnostics)}\`,
  );
}
if (payload.status !== "success" || payload.schema_version !== "0.2.0") {
  throw new Error("Live generate response is not canonical GIR 0.2 success.");
}

console.log(
  "GeometryOS live browser contract passed: CORS, request ID and generated response validation.",
);
`,
);

write(
  ".github/workflows/ci.yml",
  `name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Quality gate
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install locked dependencies
        run: npm ci

      - name: Install locked GeometryOS code-generation toolchain
        run: npm ci --prefix tools/geometryos-contract

      - name: Verify pinned GeometryOS contract
        run: npm run geometryos:check

      - name: Check formatting
        run: npm run format:check

      - name: Lint
        run: npm run lint

      - name: Type-check
        run: npm run typecheck

      - name: Run unit and architecture-rule tests
        run: npm run test

      - name: Enforce source boundaries
        run: npm run architecture

      - name: Build production bundle
        run: npm run build

  geometryos-live-contract:
    name: GeometryOS live browser contract
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Check out TutorBoard
        uses: actions/checkout@v7

      - name: Check out pinned GeometryOS source
        uses: actions/checkout@v7
        with:
          repository: ArtemLevin/geometryos
          ref: 49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c
          path: geometryos-source
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc

      - name: Build pinned GeometryOS image
        run: |
          docker build \\
            --tag geometryos-contract-smoke:\${GITHUB_SHA} \\
            --build-arg BUILD_REVISION=49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c \\
            --build-arg BUILD_VERSION=0.2.0 \\
            geometryos-source

      - name: Start hardened GeometryOS container
        run: |
          docker run --detach \\
            --name tutorboard-geometryos-contract \\
            --publish 127.0.0.1:18000:8000 \\
            --read-only \\
            --tmpfs /tmp:rw,noexec,nosuid,size=64m \\
            --cap-drop ALL \\
            --security-opt no-new-privileges \\
            --env GEOMETRYOS_CORS_ALLOWED_ORIGINS=http://localhost:5173 \\
            geometryos-contract-smoke:\${GITHUB_SHA}

      - name: Verify live browser contract
        env:
          GEOMETRYOS_ALLOWED_ORIGIN: http://localhost:5173
          GEOMETRYOS_BASE_URL: http://127.0.0.1:18000
        run: npm run geometryos:live-smoke

      - name: Capture container diagnostics
        if: always()
        run: |
          docker logs tutorboard-geometryos-contract || true
          docker rm --force tutorboard-geometryos-contract || true

  e2e-smoke:
    name: Browser smoke
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install locked dependencies
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Build production bundle
        run: npm run build

      - name: Run browser smoke
        run: npm run e2e
`,
);

replaceExact(
  "PLAN.md",
  "Safe SVG insertion. Gate 0 GeometryOS закрыт",
  "Safe SVG insertion. PR 2.8.1 закрепил актуальный browser contract GeometryOS и live-container gate. Gate 0 GeometryOS закрыт",
);
replaceExact(
  "PLAN.md",
  "и recovery при tampered SVG. GeometryOS client ещё не реализован.",
  "и recovery при tampered SVG. Generated GeometryOS client реализован, закреплён на актуальном producer commit и проверяется fixture/live-container gates.",
);
replaceExact(
  "PLAN.md",
  `11. **PR 2.9 — deterministic GIR-to-Board import — следующий**
    - реализовать layout policy, pure GIR adapter и атомарный import command.
12. Далее выполнять PR 2.10–2.12 из Technical Spike plan, не обходя phase gates.`,
  `11. **PR 2.8.1 — GeometryOS contract repin — завершён**
    - закрепить producer commit \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\` и новые SHA-256;
    - регенерировать DTO и runtime validators из актуального additive OpenAPI;
    - доказать CORS preflight, exposed \`X-Request-ID\` и live response validation на pinned container.
12. **PR 2.9 — deterministic GIR-to-Board import — следующий**
    - реализовать layout policy, pure GIR adapter и атомарный import command.
13. Далее выполнять PR 2.10–2.12 из Technical Spike plan, не обходя phase gates.`,
);

replaceExact(
  "README.md",
  "GeometryOS client spike: BoardDocument 0.2, canvas/tools/selection, Dexie recovery, safe SVG и generated validated HTTP boundary",
  "Geometry import spike: BoardDocument 0.2, canvas/tools/selection, Dexie recovery, safe SVG и актуальный generated/live-validated GeometryOS HTTP boundary",
);
replaceExact(
  "README.md",
  "Pinned GeometryOS DTO, standalone runtime validators и bounded HTTP adapter готовы; следующий этап — deterministic GIR-to-Board import.",
  "Pinned GeometryOS DTO, standalone runtime validators, bounded HTTP adapter и live-container CORS/request-ID gate готовы; следующий этап — deterministic GIR-to-Board import.",
);

write(
  "docs/spike/GEOMETRYOS_CONTRACT_BASELINE.md",
  `# GeometryOS contract baseline

- Status: verified with one documented layout compatibility gap
- Date: 2026-07-25
- GeometryOS repository commit:
  \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`

## Pinned contracts

| Contract | Version | Evidence |
|---|---|---|
| GeometryOS service | \`0.2.0\` | release manifest and OpenAPI metadata |
| HTTP API | \`v1\` / \`1.0.0\` | \`schemas/openapi.v1.json\` |
| GIR | \`0.2.0\` | GIR schema and generated response fixtures |
| Consumer fixtures | \`tutorboard/v1\` | executable fixture manifest |

Pinned artifact hashes:

\`\`\`text
OpenAPI v1
4507f5c2da15e70a5836198e4d9af709f382f6f73e766b10e7a78e7a1d12e549

GIR 0.2 JSON Schema
dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993

TutorBoard v1 fixture manifest
8777c49f8abbc7fec7e667b3fb475a781ed2c05523ce1e32e85387ea3b50782c
\`\`\`

These hashes are the immutable Gate 0/PR 2.8.1 evidence. Normal CI never downloads a mutable GeometryOS branch: generation uses the committed artifacts, while the live gate checks out the exact source commit.

## Verified behavior

- OpenAPI and GIR schema exports match their committed artifacts.
- TypeScript DTOs generate from OpenAPI and compile in strict mode.
- \`POST /api/v1/generate\` is a discriminated union: \`success\`, \`needs_clarification\`, or domain \`error\`.
- Expected domain outcomes remain HTTP 200 and are not Problem Details.
- Request validation and infrastructure failures use \`application/problem+json\`.
- OpenAPI formally publishes request and response \`X-Request-ID\` contracts.
- Generate publishes typed \`503\` service-unavailable Problem Details.
- Browser CORS is default-deny, accepts only the pinned exact origin, rejects an untrusted origin, does not permit credentials, and exposes \`X-Request-ID\`.
- Live response payloads pass the committed generated runtime validator.
- \`/health\` and \`/ready\` have distinct liveness and readiness semantics.
- Canonical responses emit GIR \`0.2.0\`; supported GIR \`0.1\` is read-only compatibility input.

## Error matrix

| Outcome | Transport | TutorBoard policy |
|---|---|---|
| success | HTTP 200 JSON | validate version and response before import |
| needs clarification | HTTP 200 JSON | show options; do not retry unchanged input |
| domain error | HTTP 200 JSON | show supported-domain diagnostic |
| invalid request | HTTP 422 Problem Details | correct request; no automatic retry |
| unavailable | HTTP 503 or network failure | retryable with bounded backoff |
| operation timeout | HTTP 504 Problem Details | retryable because generation is side-effect-free |
| internal error | HTTP 500 Problem Details | diagnostic with request ID |
| incompatible API/GIR | client boundary rejection | preserve payload for diagnosis; do not import |

## Layout compatibility gap

\`GenerateSuccessResponse\` publishes canonical GIR and optional SVG/TikZ, but no machine-readable layout object. The success fixture therefore cannot provide canonical point coordinates to a GIR-to-Board adapter.

This does not block repository foundation or the pure semantic portion of PR 2.9. It affects coordinate placement:

1. SVG must not become the semantic source (\`GEO-009\`).
2. The spike may use a deterministic, versioned fallback layout only for the approved triangle-and-altitude fixture until GeometryOS publishes Layout Document 0.1.
3. Fallback coordinates belong to the adapter result, never to canonical GIR.
4. The Phase 2 report must retain the bounded fallback as explicit debt or consume the versioned GeometryOS layout contract.

## Executed checks

Producer artifact preparation:

\`\`\`text
pinned OpenAPI/GIR/fixture SHA-256 verification
byte-identical DTO/runtime-validator regeneration
\`\`\`

TutorBoard gates:

\`\`\`text
npm run geometryos:check
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run architecture
npm run build
npm run geometryos:live-smoke
\`\`\`

The live smoke builds GeometryOS from the exact pinned commit in a hardened container and verifies CORS preflight, denied-origin behavior, browser-visible request correlation and generated response validation.

## Gate decision

Gate 0 and PR 2.8.1 are complete. TutorBoard may proceed to deterministic GIR-to-Board import while treating machine-readable layout as the only remaining producer compatibility gap.
`,
);

write(
  "docs/adr/ADR-006-geometryos-generated-client.md",
  `# ADR-006: Generated GeometryOS client boundary

- Status: accepted
- Date: 2026-07-24
- Updated: 2026-07-25

## Context

TutorBoard must consume a large OpenAPI 3.1 contract containing canonical GIR. Static TypeScript types alone do not validate untrusted network responses, while handwritten runtime schemas would create a second contract likely to drift.

## Decision

Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same pinned \`openapi-typescript\` version used by the producer contract smoke, and generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all generated DTOs private to \`adapters/geometryos-http\` and expose only a normalized \`GeometryOsClient\` port from \`core\`.

The adapter performs no automatic retry and does not create Board objects. Contract repins require exact source commit and SHA-256 provenance, a reproducible generated diff and a live browser-contract gate against a container built from that same commit.

## Consequences

- contract upgrades produce an explicit artifact and generated-code diff;
- network responses are validated at runtime before entering TutorBoard;
- generated validator output is committed and reproducibility-checked;
- OpenAPI request/response \`X-Request-ID\`, typed generate \`503\` and exact-origin CORS are verified against the real producer runtime;
- the production bundle may include small Ajv runtime helpers referenced by the standalone output;
- machine-readable layout remains the only producer follow-up before the general GIR-to-Board placement contract.

## Rejected alternatives

- handwritten DTOs or Zod copies: duplicate source of truth;
- using generated TypeScript types without runtime validation: unsafe boundary;
- compiling OpenAPI dynamically in the browser: unnecessary code generation and CSP complexity;
- returning generated DTOs from the core port: external contract leakage;
- parsing SVG to recover layout or semantics: violates the GIR-first boundary;
- testing only mocked transport: cannot prove real CORS middleware and exposed response headers.
`,
);

write(
  "docs/architecture/GEOMETRYOS_CLIENT.md",
  `# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to \`adapters/geometryos-http\`; the rest of TutorBoard consumes the platform-neutral \`GeometryOsClient\` port from \`core\`.

## Flow

\`\`\`text
prompt
  -> GeometryOsClient task
  -> one bounded HTTP request
  -> request-ID/content-type/body checks
  -> generated runtime validation
  -> normalized result union
\`\`\`

The result union keeps HTTP 200 domain outcomes distinct from Problem Details, transport failures, cancellation and incompatible contracts. The adapter marks retryability but performs no retry. Application-level retry and import deduplication require a durable import operation identity and belong to the later geometry-import flow.

## Compatibility

Pinned producer:

- repository \`ArtemLevin/geometryos\`;
- commit \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`;
- GeometryOS service \`0.2.0\`;
- HTTP API \`v1\` / \`1.0.0\`;
- GIR \`0.2.0\`;
- consumer fixtures \`tutorboard/v1\`.

A success response with another GIR version, invalid response schema, missing or mismatched request ID, invalid content type, malformed UTF-8/JSON, or an oversized body is rejected before any GIR-to-Board code can observe it.

The committed OpenAPI now declares request and response \`X-Request-ID\` contracts and typed generate \`503\` Problem Details. CI additionally builds the exact producer commit and proves allowed/denied CORS preflight, non-credentialed browser access, exposed request correlation and runtime response validation.

## Privacy and security

The adapter and live smoke never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. The CI container receives only a non-secret exact development origin.

## Remaining producer follow-up

GeometryOS still does not publish a versioned machine-readable layout contract. GIR remains the mathematical source; SVG must not be parsed for semantics or coordinates. PR 2.9 may implement its pure semantic mapping independently, while general placement should consume Layout Document 0.1 or retain an explicitly bounded fixture-only fallback.
`,
);

replaceExact(
  "tests/contracts/geometryos-contract.test.mjs",
  `    expect(counts.problem).toBeGreaterThan(0);
  });
});`,
  `    expect(counts.problem).toBeGreaterThan(0);
  });

  it("publishes browser correlation and service-unavailable contracts", () => {
    const openapi = json(path.join(root, "openapi.v1.json"));
    const operation = openapi.paths["/api/v1/generate"].post;
    expect(openapi.components.parameters.GeometryOsRequestId).toMatchObject({
      in: "header",
      name: "X-Request-ID",
      required: false,
    });
    expect(openapi.components.headers.GeometryOsRequestId).toMatchObject({
      required: true,
    });
    expect(operation.parameters).toContainEqual({
      $ref: "#/components/parameters/GeometryOsRequestId",
    });
    for (const status of ["200", "422", "500", "503", "504"]) {
      expect(operation.responses[status].headers["X-Request-ID"]).toEqual({
        $ref: "#/components/headers/GeometryOsRequestId",
      });
    }
    expect(operation.responses["503"]).toMatchObject({
      content: {
        "application/problem+json": {
          schema: { $ref: "#/components/schemas/ProblemDetail" },
        },
      },
    });

    const fixtureManifest = json(path.join(root, "fixtures/manifest.json"));
    expect(fixtureManifest.cases).toContainEqual(
      expect.objectContaining({
        id: "service-unavailable",
        path: "/api/v1/generate",
        response: "service-unavailable.problem.json",
        status: 503,
      }),
    );
    expect(
      validateProblemDetail(
        json(path.join(root, "fixtures/service-unavailable.problem.json")),
      ).valid,
    ).toBe(true);
  });
});`,
);

console.log("Applied TutorBoard PR 2.8.1 product changes.");
