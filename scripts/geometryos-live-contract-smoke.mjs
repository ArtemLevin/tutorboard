import fs from "node:fs";
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
    throw new Error(`Missing required response header: ${name}`);
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
    `Allowed CORS preflight returned HTTP ${allowedPreflight.status}.`,
  );
}
if (
  requireHeader(allowedPreflight, "access-control-allow-origin") !==
  allowedOrigin
) {
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
    throw new Error(`Allowed CORS preflight does not permit ${header}.`);
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
    path.join(
      root,
      "contracts/geometryos/fixtures/generate-success.request.json",
    ),
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
  throw new Error(`Generate request returned HTTP ${response.status}.`);
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
  throw new Error(
    "Generate response does not expose X-Request-ID to browsers.",
  );
}
const contentType = requireHeader(response, "content-type").toLowerCase();
if (!contentType.startsWith("application/json")) {
  throw new Error(`Unexpected generate response media type: ${contentType}.`);
}
const payload = await response.json();
if (!validateGenerateResponse(payload)) {
  const diagnostics = (validateGenerateResponse.errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    schemaPath: error.schemaPath,
  }));
  throw new Error(
    `Live generate response failed the pinned validator: ${JSON.stringify(diagnostics)}`,
  );
}
if (payload.status !== "success" || payload.schema_version !== "0.2.0") {
  throw new Error("Live generate response is not canonical GIR 0.2 success.");
}

console.log(
  "GeometryOS live browser contract passed: CORS, request ID and generated response validation.",
);
